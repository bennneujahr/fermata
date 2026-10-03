"""Textmodus „Text statt Stimme“: derselbe Gesprächskern über HTTP (FastAPI).

Die Web-App bekommt Adresse und Zugang von der Edge Function ``interview-token`` (mode=text) und spricht dann
direkt mit diesem Dienst. Protokoll (Details: docs/bereiche/viola.md):

- ``POST /v1/text/sessions/{id}/start``     → Begrüßung mit KI-Hinweis
- ``POST /v1/text/sessions/{id}/messages``  → Antwort von Viola (JSON oder Server-Sent Events)
- ``POST /v1/text/sessions/{id}/end``       → Person beendet
- ``GET  /v1/text/sessions/{id}``           → Zustand

Zugang: ``Authorization: Bearer <token>`` (HS256, aud ``viola-text``, iss ``fermata``, Claim ``sid`` = Sitzung).
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import time
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from typing import Any

import jwt
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from viola.backend import Backend, BackendError
from viola.config import Config
from viola.context import SessionContext
from viola.domain import Mode
from viola.engine import Conversation, EngineEvent, EngineOptions
from viola.llm.base import ChatModel

log = logging.getLogger("viola.text")

MAX_MESSAGES_PER_SESSION = 150
MAX_TEXT_CHARS = 2000


class MessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT_CHARS)


@dataclass
class _Entry:
    conversation: Conversation
    messages: int = 0
    last_activity: float = 0.0
    switch_from_voice: bool = False
    closing: bool = False


def verify_text_token(token: str, secret: str, session_id: str) -> dict[str, Any]:
    if not secret or len(secret) < 32:
        raise HTTPException(503, detail="text_not_configured")
    try:
        claims: dict[str, Any] = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience="viola-text",
            issuer="fermata",
            options={"require": ["exp", "sid", "sub"]},
            leeway=30,
        )
    except jwt.PyJWTError as err:
        raise HTTPException(401, detail="invalid_token") from err
    if claims.get("sid") != session_id:
        raise HTTPException(403, detail="wrong_session")
    return claims


class SessionRegistry:
    """Hält laufende Gespräche im Speicher (eine Instanz; mehrere Instanzen brauchen Sitzungsbindung am Lastverteiler)."""

    def __init__(
        self,
        backend: Backend,
        model: ChatModel,
        options: EngineOptions,
        clock: Callable[[], float] = time.monotonic,
        idle_seconds: float = 20 * 60,
    ) -> None:
        self.backend = backend
        self.model = model
        self.options = options
        self.clock = clock
        self.entries: dict[str, _Entry] = {}
        self.finishing: set[asyncio.Task[None]] = set()
        # Ohne Nachricht so lange → Ende „technik“ (fortsetzbar). Länger als die Höchstdauer im Textmodus plus Puffer.
        self.idle_seconds = idle_seconds
        self._lock = asyncio.Lock()

    def sweep(self) -> int:
        """Beendet Gespräche ohne Aktivität (Person hat das Fenster geschlossen). Läuft bei jedem Aufruf mit."""
        now = self.clock()
        stale = [
            e
            for e in self.entries.values()
            if not e.closing and not e.conversation.ended and e.conversation.opened and now - e.last_activity > self.idle_seconds
        ]
        for entry in stale:
            entry.closing = True

            async def end_and_finish(e: _Entry = entry) -> None:
                await e.conversation.end_by_technical_problem()
                self.schedule_finish(e)

            task = asyncio.create_task(end_and_finish(), name="viola-idle-end")
            self.finishing.add(task)
            task.add_done_callback(self.finishing.discard)
        return len(stale)

    async def get(self, session_id: str, *, create: bool) -> _Entry | None:
        self.sweep()
        async with self._lock:
            entry = self.entries.get(session_id)
            if entry is None and create:
                ctx = SessionContext.from_json(await self.backend.context(session_id))
                if ctx.status not in ("requested", "active"):
                    raise HTTPException(409, detail="session_closed")
                conv = Conversation(ctx, self.model, self.backend, options=self.options, clock=self.clock)
                conv.mode = Mode.TEXT
                entry = _Entry(conv, last_activity=self.clock(), switch_from_voice=ctx.mode is not Mode.TEXT)
                self.entries[session_id] = entry
            return entry

    def schedule_finish(self, entry: _Entry) -> None:
        conv = entry.conversation

        async def run() -> None:
            try:
                await conv.finish()
            except Exception:
                log.exception("Auswertung fehlgeschlagen")
            finally:
                self.entries.pop(conv.session_id, None)

        task = asyncio.create_task(run(), name=f"viola-finish-{conv.session_id}")
        self.finishing.add(task)
        task.add_done_callback(self.finishing.discard)

    async def drain(self) -> None:
        while self.finishing:
            await asyncio.gather(*list(self.finishing), return_exceptions=True)


def _state(conv: Conversation) -> dict[str, Any]:
    status = conv.state.time_status()
    return {
        "session_id": conv.session_id,
        "phase": conv.state.phase.value,
        "ended": conv.ended,
        "end_reason": conv.end_reason.value if conv.end_reason else None,
        "address_form": conv.form.value,
        "remaining_seconds": max(0, round(status.remaining_s)),
        "covered_blocks": [b.value for b in conv.state.covered_blocks()],
    }


def _events(events: list[EngineEvent]) -> list[dict[str, Any]]:
    return [{"type": e.type, **e.data} for e in events]


def create_app(
    cfg: Config,
    *,
    backend: Backend,
    model: ChatModel,
    options: EngineOptions | None = None,
    clock: Callable[[], float] = time.monotonic,
) -> FastAPI:
    registry = SessionRegistry(backend, model, options or EngineOptions(), clock)

    @contextlib.asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        yield
        await registry.drain()

    app = FastAPI(title="Viola – Textmodus", version="1", lifespan=lifespan, docs_url=None, redoc_url=None)
    app.state.registry = registry
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(cfg.text_allowed_origins),
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["authorization", "content-type", "accept"],
        max_age=600,
    )

    @app.exception_handler(HTTPException)
    async def http_error(_req: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse({"error": exc.detail}, status_code=exc.status_code, headers={"cache-control": "no-store"})

    @app.exception_handler(BackendError)
    async def backend_error(_req: Request, exc: BackendError) -> JSONResponse:
        status = exc.status if exc.status in (404, 409, 422) else 502
        return JSONResponse({"error": exc.code}, status_code=status, headers={"cache-control": "no-store"})

    def authorize(session_id: str, authorization: str | None) -> None:
        if not authorization or not authorization.lower().startswith("bearer "):
            raise HTTPException(401, detail="not_authenticated")
        verify_text_token(authorization.split(" ", 1)[1].strip(), cfg.text_token_secret, session_id)

    async def entry_for(session_id: str, authorization: str | None, *, create: bool = False) -> _Entry:
        authorize(session_id, authorization)
        entry = await registry.get(session_id, create=create)
        if entry is None:
            raise HTTPException(409, detail="not_started")
        return entry

    @app.get("/healthz")
    async def healthz() -> dict[str, Any]:
        return {"ok": True, "sessions": len(registry.entries)}

    @app.post("/v1/text/sessions/{session_id}/start")
    async def start(session_id: str, authorization: str | None = Header(default=None)) -> JSONResponse:
        entry = await entry_for(session_id, authorization, create=True)
        conv = entry.conversation
        resumed = conv.opened
        if not resumed:
            await conv.open()
            if entry.switch_from_voice:
                # Wechsel von Stimme zu Text: Die Sitzung läuft weiter, nur der Weg ändert sich.
                with contextlib.suppress(BackendError):
                    await registry.backend.switch_mode(session_id, "text")
            await conv.greeting_delivered()  # Text: angezeigt = zugestellt
        greeting = conv.messages[1]["content"][0]["text"]
        entry.last_activity = registry.clock()
        return JSONResponse(
            {**_state(conv), "resumed": resumed, "ai_notice": True, "messages": [{"role": "viola", "text": greeting}]},
            headers={"cache-control": "no-store"},
        )

    async def _reply(entry: _Entry, text: str) -> AsyncIterator[str]:
        conv = entry.conversation
        entry.messages += 1
        entry.last_activity = registry.clock()
        async for sentence in conv.respond(text):
            yield sentence
        if conv.ended:
            registry.schedule_finish(entry)

    @app.post("/v1/text/sessions/{session_id}/messages", response_model=None)
    async def message(
        session_id: str,
        body: MessageIn,
        authorization: str | None = Header(default=None),
        accept: str | None = Header(default=None),
    ) -> JSONResponse | StreamingResponse:
        entry = await entry_for(session_id, authorization)
        conv = entry.conversation
        if not conv.opened:
            raise HTTPException(409, detail="not_started")
        if conv.ended:
            raise HTTPException(409, detail="session_ended")
        if entry.messages >= MAX_MESSAGES_PER_SESSION:
            raise HTTPException(429, detail="too_many_messages")

        if accept and "text/event-stream" in accept:

            async def stream() -> AsyncIterator[bytes]:
                async for sentence in _reply(entry, body.text):
                    yield _sse("sentence", {"text": sentence})
                for ev in _events(conv.take_events()):
                    yield _sse("event", ev)
                yield _sse("done", _state(conv))

            return StreamingResponse(
                stream(), media_type="text/event-stream", headers={"cache-control": "no-store", "x-accel-buffering": "no"}
            )

        sentences = [s async for s in _reply(entry, body.text)]
        text = " ".join(sentences)
        return JSONResponse(
            {
                **_state(conv),
                "messages": [{"role": "viola", "text": text}] if text else [],
                "events": _events(conv.take_events()),
            },
            headers={"cache-control": "no-store"},
        )

    @app.post("/v1/text/sessions/{session_id}/end")
    async def end(session_id: str, authorization: str | None = Header(default=None)) -> JSONResponse:
        entry = await entry_for(session_id, authorization)
        conv = entry.conversation
        if not conv.ended:
            await conv.end_by_person()
            registry.schedule_finish(entry)
        return JSONResponse({**_state(conv), "events": _events(conv.take_events())}, headers={"cache-control": "no-store"})

    @app.get("/v1/text/sessions/{session_id}")
    async def state(session_id: str, authorization: str | None = Header(default=None)) -> JSONResponse:
        entry = await entry_for(session_id, authorization)
        return JSONResponse(_state(entry.conversation), headers={"cache-control": "no-store"})

    return app


def _sse(event: str, data: dict[str, Any]) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode()


def build_app_from_env(cfg: Config | None = None) -> FastAPI:
    from viola.factory import build_backend, build_model, engine_options

    c = cfg or Config.from_env()
    return create_app(c, backend=build_backend(c), model=build_model(c), options=engine_options(c))
