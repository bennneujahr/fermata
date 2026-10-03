"""Viola als LiveKit-Agent: Stimme rein (Deepgram EU), Gesprächskern, Stimme raus (TtsProvider).

Die Antworten kommen nicht aus einem LiveKit-LLM-Plugin, sondern aus dem Gesprächskern (``llm_node`` ist
überschrieben). So gelten in Stimme und Text dieselben Regeln: KI-Hinweis, Leitfaden, Werkzeuge, Art.-9-Filter,
Sicherheit, Zeitlimit. Audio fließt nur durch: keine Aufnahme (``record=False``), keine Dateien, keine Datenbank.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import time
from collections.abc import AsyncIterable, AsyncIterator, Awaitable, Callable
from typing import Any

from livekit import rtc
from livekit.agents import Agent, APIConnectOptions, llm, stt
from livekit.agents.llm import ChatContext
from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS, NOT_GIVEN, NotGivenOr
from livekit.agents.voice.agent import ModelSettings

from viola.engine import Conversation, EngineEvent
from viola.voice.gate import FLUSH, SpeechGate

log = logging.getLogger("viola.voice")

DATA_TOPIC = "viola"


class EngineLLM(llm.LLM):
    """Platzhalter, damit LiveKit Antworten anfordert. Die Antwort selbst liefert ``ViolaAgent.llm_node``."""

    def __init__(self, model_id: str) -> None:
        super().__init__()
        self._model_id = model_id

    @property
    def model(self) -> str:
        return self._model_id

    @property
    def provider(self) -> str:
        return "fermata-viola"

    def chat(
        self,
        *,
        chat_ctx: ChatContext,
        tools: list[Any] | None = None,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
        parallel_tool_calls: NotGivenOr[bool] = NOT_GIVEN,
        tool_choice: NotGivenOr[Any] = NOT_GIVEN,
        extra_kwargs: NotGivenOr[dict[str, Any]] = NOT_GIVEN,
    ) -> llm.LLMStream:
        raise RuntimeError("EngineLLM wird nicht direkt aufgerufen; Antworten kommen aus ViolaAgent.llm_node")


def last_user_text(chat_ctx: ChatContext) -> str:
    for item in reversed(chat_ctx.items):
        if getattr(item, "type", None) == "message" and getattr(item, "role", None) == "user":
            return (item.text_content or "").strip()  # type: ignore[union-attr]
    return ""


Publisher = Callable[[dict[str, Any]], Awaitable[None]]


class ViolaAgent(Agent):
    def __init__(
        self,
        conv: Conversation,
        greeting: str,
        *,
        publish: Publisher | None = None,
        gate_factory: Callable[[], SpeechGate] | None = None,
        on_finished: Callable[[], Awaitable[None]] | None = None,
    ) -> None:
        super().__init__(instructions="Viola – die Gesprächsführung liegt im Gesprächskern (viola.engine).")
        self.conv = conv
        self.greeting = greeting
        self._publish = publish
        self._gate_factory = gate_factory
        self._on_finished = on_finished
        self._turn_started: float | None = None
        self._closing = False

    # -- Begrüßung mit KI-Hinweis, nicht unterbrechbar ---------------------------------
    async def on_enter(self) -> None:
        handle = self.session.say(self.greeting, allow_interruptions=False)
        await handle.wait_for_playout()
        await self.conv.greeting_delivered()
        await self.publish({"type": "ai_notice", "spoken": True})

    # -- Antwort aus dem Gesprächskern -------------------------------------------------
    async def llm_node(  # type: ignore[override]
        self, chat_ctx: ChatContext, tools: list[Any], model_settings: ModelSettings
    ) -> AsyncIterator[str]:
        text = last_user_text(chat_ctx)
        if not text or self.conv.ended:
            return
        self._turn_started = time.perf_counter()
        async for sentence in self.conv.respond(text):
            yield sentence + " "
        await self.flush_events()
        if self.conv.ended:
            self.schedule_close()

    def first_audio(self) -> None:
        """Erster Ton einer Antwort: Antwortzeit ab Ende der Äußerung der Person."""
        if self._turn_started is not None:
            self.conv.latency.add((time.perf_counter() - self._turn_started) * 1000)
            self._turn_started = None

    # -- Stille nicht an die Spracherkennung senden -----------------------------------
    async def stt_node(  # type: ignore[override]
        self, audio: AsyncIterable[rtc.AudioFrame], model_settings: ModelSettings
    ) -> AsyncIterator[stt.SpeechEvent]:
        if self._gate_factory is None:
            async for ev in Agent.default.stt_node(self, audio, model_settings):
                yield ev
            return
        recognizer = self.session.stt
        if recognizer is None:
            return
        async for ev in gated_recognition(recognizer, audio, self._gate_factory(), self.session.conn_options.stt_conn_options):
            yield ev

    # -- Ereignisse an die Web-App (Daten-Kanal) ---------------------------------------
    async def publish(self, payload: dict[str, Any]) -> None:
        if self._publish is not None:
            try:
                await self._publish(payload)
            except Exception:  # noqa: BLE001 – Anzeige darf das Gespräch nicht stören
                log.warning("Ereignis nicht gesendet: %s", payload.get("type"))

    async def flush_events(self) -> None:
        for ev in self.conv.take_events():
            await self.publish(event_payload(ev))

    def schedule_close(self) -> None:
        if self._closing:
            return
        self._closing = True
        asyncio.get_running_loop().create_task(self._close(), name="viola-close")

    async def _close(self) -> None:
        # Erst ausreden lassen, dann auflegen und auswerten.
        with contextlib.suppress(Exception):
            current = self.session.current_speech
            if current is not None:
                await current.wait_for_playout()
        if self._on_finished is not None:
            await self._on_finished()


def event_payload(ev: EngineEvent) -> dict[str, Any]:
    return {"type": ev.type, **ev.data}


async def gated_recognition(
    recognizer: stt.STT,
    audio: AsyncIterable[rtc.AudioFrame],
    gate: SpeechGate,
    conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
) -> AsyncIterator[stt.SpeechEvent]:
    """Wie die Standard-Spracherkennung, aber nur mit Sprach-Rahmen; beim Schließen des Tors ``flush`` (Finalize)."""
    async with recognizer.stream(conn_options=conn_options) as stream:

        async def forward() -> None:
            async for item in gate.process(audio):
                if item is FLUSH:
                    stream.flush()
                else:
                    stream.push_frame(item)
            stream.end_input()

        task = asyncio.create_task(forward(), name="viola-stt-gate")
        try:
            async for ev in stream:
                yield ev
        finally:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task
            with contextlib.suppress(Exception):
                await gate.detector.aclose()


def data_message(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, ensure_ascii=False).encode()
