"""Claude Sonnet 5.5 über Amazon Bedrock (EU) oder die Claude API (nur Entwicklung).

Regeln für Sonnet 5.5 (PLAN 5.1, Anthropic-Migrationsleitfaden):
- ``thinking`` lässt sich nicht abschalten (``disabled`` ergibt 400). Viola nutzt die niedrigste Stufe
  ``{"type": "between_tools"}`` mit ``effort`` ``low`` (Einstellungen voice.llm_thinking, voice.llm_effort).
- Kein ``temperature``, ``top_p``, ``top_k`` – werden hier nie gesendet.
- ``tool_choice`` nur ``auto``; Werkzeuge mit ``strict: true`` und ``additionalProperties: false``.
- Verlauf nur anhängen, thinking-Blöcke unverändert zurückgeben (preserved thinking).
- Prompt-Caching: fester Systemtext mit Breakpoint, dazu automatisches Caching des Verlaufs.
- ``stop_reason == "refusal"`` wird behandelt (Viola antwortet mit einem festen, ruhigen Satz).
- Bedrock: Client ``AsyncAnthropicBedrockMantle`` in eu-central-1, Modell-ID aus den Einstellungen
  (EU-Geo-Profil ``eu.anthropic.claude-sonnet-5-5``). Auf Bedrock gibt es kein serverseitiges ``fallbacks``.
"""

from __future__ import annotations

import json
import time
from collections.abc import AsyncIterator
from typing import Any

import anthropic

from viola.llm.base import (
    ChatRequest,
    JsonRequest,
    JsonResult,
    LlmUnavailable,
    StreamItem,
    TextDelta,
    ToolUse,
    TurnDone,
    TurnResult,
    Usage,
)

FIRST_PARTY_PREFIXES = ("eu.anthropic.", "us.anthropic.", "global.anthropic.", "anthropic.")


def model_for_provider(model_id: str, provider: str) -> str:
    """Bedrock nutzt die ID aus den Einstellungen (mit Präfix), die Claude API die ID ohne Präfix."""
    if provider == "anthropic":
        for prefix in FIRST_PARTY_PREFIXES:
            if model_id.startswith(prefix):
                return model_id[len(prefix) :]
    return model_id


def _usage(raw: Any) -> Usage:
    if raw is None:
        return Usage()
    return Usage(
        input_tokens=int(getattr(raw, "input_tokens", 0) or 0),
        output_tokens=int(getattr(raw, "output_tokens", 0) or 0),
        cache_read_tokens=int(getattr(raw, "cache_read_input_tokens", 0) or 0),
        cache_write_tokens=int(getattr(raw, "cache_creation_input_tokens", 0) or 0),
    )


def _thinking(mode: str) -> dict[str, Any]:
    if mode == "between_tools":
        return {"type": "between_tools"}
    return {"type": "adaptive"}


class AnthropicChatModel:
    def __init__(self, client: Any, *, provider: str = "bedrock", eager_tool_streaming: bool = False) -> None:
        self._client = client
        self._provider = provider
        self._eager = eager_tool_streaming

    @classmethod
    def for_bedrock(cls, region: str, **kwargs: Any) -> AnthropicChatModel:
        if not region.startswith("eu-"):
            raise ValueError("Bedrock nur in einer EU-Region (PLAN 2.2)")
        return cls(anthropic.AsyncAnthropicBedrockMantle(aws_region=region), provider="bedrock", **kwargs)

    @classmethod
    def for_first_party(cls, **kwargs: Any) -> AnthropicChatModel:
        return cls(anthropic.AsyncAnthropic(), provider="anthropic", **kwargs)

    def build_params(self, request: ChatRequest) -> dict[str, Any]:
        tools = []
        for tool in request.tools:
            t = dict(tool)
            if self._eager:
                t["eager_input_streaming"] = True
            tools.append(t)
        params: dict[str, Any] = {
            "model": model_for_provider(request.model, self._provider),
            "max_tokens": request.max_tokens,
            "system": request.system,
            "messages": request.messages,
            "thinking": _thinking(request.thinking),
            "output_config": {"effort": request.effort},
            "cache_control": {"type": "ephemeral"},
        }
        if tools:
            params["tools"] = tools
            params["tool_choice"] = {"type": "auto"}
        return params

    async def stream_turn(self, request: ChatRequest) -> AsyncIterator[StreamItem]:
        params = self.build_params(request)
        started = time.perf_counter()
        ttft: float | None = None
        try:
            async with self._client.messages.stream(**params) as stream:
                async for event in stream:
                    if event.type == "text" and event.text:
                        if ttft is None:
                            ttft = (time.perf_counter() - started) * 1000
                        yield TextDelta(event.text)
                final = await stream.get_final_message()
        except (anthropic.APIConnectionError, anthropic.APIStatusError) as err:
            raise LlmUnavailable(f"Sprachmodell nicht erreichbar: {type(err).__name__}") from err

        content = [block.to_dict() for block in final.content]
        text = "".join(b.text for b in final.content if b.type == "text")
        tool_uses = [ToolUse(id=b.id, name=b.name, input=dict(b.input)) for b in final.content if b.type == "tool_use"]
        refusal = None
        if final.stop_reason == "refusal":
            details = getattr(final, "stop_details", None)
            refusal = getattr(details, "category", None) or "unbekannt"
        yield TurnDone(
            TurnResult(
                text=text,
                tool_uses=tool_uses,
                stop_reason=str(final.stop_reason),
                usage=_usage(final.usage),
                content=content,
                ttft_ms=ttft,
                refusal_category=refusal,
            )
        )

    async def complete_json(self, request: JsonRequest) -> JsonResult:
        params: dict[str, Any] = {
            "model": model_for_provider(request.model, self._provider),
            "max_tokens": request.max_tokens,
            "system": [{"type": "text", "text": request.system, "cache_control": {"type": "ephemeral"}}],
            "messages": [{"role": "user", "content": request.user}],
            "thinking": {"type": "adaptive"},
            "output_config": {"effort": request.effort, "format": {"type": "json_schema", "schema": request.schema}},
        }
        try:
            response = await self._client.messages.create(**params)
        except (anthropic.APIConnectionError, anthropic.APIStatusError) as err:
            raise LlmUnavailable(f"Sprachmodell nicht erreichbar: {type(err).__name__}") from err
        usage = _usage(response.usage)
        if response.stop_reason in ("refusal", "max_tokens"):
            return JsonResult(data=None, usage=usage, stop_reason=str(response.stop_reason))
        text = next((b.text for b in response.content if b.type == "text"), "")
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            return JsonResult(data=None, usage=usage, stop_reason="invalid_json")
        return JsonResult(data=data if isinstance(data, dict) else None, usage=usage, stop_reason=str(response.stop_reason))
