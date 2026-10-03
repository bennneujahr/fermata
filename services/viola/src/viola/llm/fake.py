"""Attrappe des Sprachmodells: Drehbuch für Tests und lokale Läufe ohne Netz und ohne Zugangsdaten."""

from __future__ import annotations

import asyncio
import copy
import itertools
import re
from collections.abc import AsyncIterator, Callable, Iterable
from dataclasses import dataclass, field
from typing import Any

from viola.llm.base import (
    ChatRequest,
    JsonRequest,
    JsonResult,
    StreamItem,
    TextDelta,
    ToolUse,
    TurnDone,
    TurnResult,
    Usage,
)


@dataclass(slots=True)
class FakeReply:
    text: str = ""
    tool_calls: list[tuple[str, dict[str, Any]]] = field(default_factory=list)
    stop_reason: str | None = None
    refusal: str | None = None
    delay_s: float = 0.0
    fail: Exception | None = None


ReplySource = FakeReply | Callable[[ChatRequest], FakeReply]


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def _flatten(content: Any) -> str:
    if isinstance(content, str):
        return content
    parts: list[str] = []
    for block in content or []:
        if isinstance(block, dict) and block.get("type") == "text":
            parts.append(str(block.get("text", "")))
    return "\n".join(parts)


def last_person_text(request: ChatRequest) -> str:
    for msg in reversed(request.messages):
        if msg.get("role") == "user":
            return _flatten(msg.get("content"))
    return ""


def system_text(request: ChatRequest) -> str:
    return "\n".join(str(b.get("text", "")) for b in request.system)


def local_fallback(request: ChatRequest) -> FakeReply:
    """Antwort für lokale Läufe ohne Sprachmodell: kurz, ruhig, mit einer Frage."""
    du = "Anrede im Gespräch: Du" in system_text(request)
    said = last_person_text(request)
    if re.search(r"\b(tschüss|auf wiedersehen|ende|beenden)\b", said, re.IGNORECASE):
        return FakeReply(
            text="Danke für das Gespräch. Ich wünsche dir einen guten Abend." if du
            else "Danke für das Gespräch. Ich wünsche Ihnen einen guten Abend.",
            tool_calls=[("end_conversation", {"reason": "person_beendet"})],
        )
    return FakeReply(
        text="Danke, das hilft mir weiter. Magst du mir noch etwas mehr dazu erzählen?" if du
        else "Danke, das hilft mir weiter. Mögen Sie mir noch etwas mehr dazu erzählen?"
    )


class FakeChatModel:
    """Spielt vorbereitete Antworten ab und merkt sich jede Anfrage (Kopie) für Prüfungen."""

    def __init__(
        self,
        replies: Iterable[ReplySource] = (),
        *,
        fallback: Callable[[ChatRequest], FakeReply] | None = local_fallback,
        json_replies: Iterable[dict[str, Any] | Callable[[JsonRequest], dict[str, Any] | None] | None] = (),
        chunk_chars: int = 12,
        cache_read_ratio: float = 0.0,
    ) -> None:
        self._replies = list(replies)
        self._fallback = fallback
        self._json = list(json_replies)
        self._chunk = chunk_chars
        self._ids = itertools.count(1)
        self._cache_ratio = cache_read_ratio
        self.requests: list[ChatRequest] = []
        self.json_requests: list[JsonRequest] = []

    def _next(self, request: ChatRequest) -> FakeReply:
        if self._replies:
            src = self._replies.pop(0)
            return src(request) if callable(src) else src
        if self._fallback is None:
            raise AssertionError("FakeChatModel: keine Antwort mehr im Drehbuch")
        return self._fallback(request)

    async def stream_turn(self, request: ChatRequest) -> AsyncIterator[StreamItem]:
        self.requests.append(
            ChatRequest(
                model=request.model,
                system=copy.deepcopy(request.system),
                messages=copy.deepcopy(request.messages),
                tools=copy.deepcopy(request.tools),
                max_tokens=request.max_tokens,
                effort=request.effort,
                thinking=request.thinking,
            )
        )
        reply = self._next(request)
        if reply.fail is not None:
            raise reply.fail
        if reply.delay_s:
            await asyncio.sleep(reply.delay_s)
        for i in range(0, len(reply.text), self._chunk):
            yield TextDelta(reply.text[i : i + self._chunk])
            await asyncio.sleep(0)
        tool_uses = [ToolUse(id=f"toolu_fake_{next(self._ids)}", name=n, input=dict(inp)) for n, inp in reply.tool_calls]
        content: list[dict[str, Any]] = []
        if reply.text:
            content.append({"type": "text", "text": reply.text})
        content.extend({"type": "tool_use", "id": t.id, "name": t.name, "input": t.input} for t in tool_uses)
        prompt_tokens = _estimate_tokens(system_text(request) + str(request.messages))
        cached = int(prompt_tokens * self._cache_ratio)
        stop = reply.stop_reason or ("refusal" if reply.refusal else "tool_use" if tool_uses else "end_turn")
        yield TurnDone(
            TurnResult(
                text=reply.text,
                tool_uses=tool_uses,
                stop_reason=stop,
                usage=Usage(
                    input_tokens=prompt_tokens - cached,
                    output_tokens=_estimate_tokens(reply.text) + 20 * len(tool_uses),
                    cache_read_tokens=cached,
                ),
                content=content,
                ttft_ms=reply.delay_s * 1000,
                refusal_category=reply.refusal,
            )
        )

    async def complete_json(self, request: JsonRequest) -> JsonResult:
        self.json_requests.append(request)
        if not self._json:
            return JsonResult(data=None, stop_reason="no_fake_reply")
        src = self._json.pop(0)
        data = src(request) if callable(src) else src
        return JsonResult(
            data=copy.deepcopy(data),
            usage=Usage(input_tokens=_estimate_tokens(request.system + request.user), output_tokens=300),
        )
