"""Schnittstelle zum Sprachmodell, unabhängig vom Anbieter.

Die Gesprächslogik (viola.engine) kennt nur ``ChatModel``. Umsetzungen: ``AnthropicChatModel``
(Claude Sonnet 5.5 über Amazon Bedrock EU oder die Claude API für die Entwicklung) und ``FakeChatModel``
(Drehbuch für Tests, ohne Netz).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol


@dataclass(slots=True)
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0

    def add(self, other: Usage) -> None:
        self.input_tokens += other.input_tokens
        self.output_tokens += other.output_tokens
        self.cache_read_tokens += other.cache_read_tokens
        self.cache_write_tokens += other.cache_write_tokens


@dataclass(frozen=True, slots=True)
class ToolUse:
    id: str
    name: str
    input: dict[str, Any]


ThinkingMode = Literal["between_tools", "adaptive"]


@dataclass(slots=True)
class ChatRequest:
    """Eine Anfrage im Gespräch. ``messages`` wird nur angehängt, nie verändert (preserved thinking)."""

    model: str
    system: list[dict[str, Any]]
    messages: list[dict[str, Any]]
    tools: list[dict[str, Any]]
    max_tokens: int = 2048
    effort: str = "low"
    thinking: ThinkingMode = "between_tools"


@dataclass(slots=True)
class TurnResult:
    """Ergebnis einer Anfrage. ``content`` sind die rohen Inhaltsblöcke (inkl. thinking) für den Verlauf."""

    text: str
    tool_uses: list[ToolUse]
    stop_reason: str
    usage: Usage
    content: list[dict[str, Any]]
    ttft_ms: float | None = None
    refusal_category: str | None = None


@dataclass(frozen=True, slots=True)
class TextDelta:
    text: str


@dataclass(frozen=True, slots=True)
class TurnDone:
    result: TurnResult


StreamItem = TextDelta | TurnDone


@dataclass(slots=True)
class JsonRequest:
    """Auswertung mit festem JSON-Schema (structured outputs)."""

    model: str
    system: str
    user: str
    schema: dict[str, Any]
    max_tokens: int = 16000
    effort: str = "medium"


@dataclass(slots=True)
class JsonResult:
    data: dict[str, Any] | None
    usage: Usage = field(default_factory=Usage)
    stop_reason: str = "end_turn"


class ChatModel(Protocol):
    def stream_turn(self, request: ChatRequest) -> AsyncIterator[StreamItem]:
        """Liefert Textstücke, sobald sie da sind, und zum Schluss genau ein ``TurnDone``."""
        ...

    async def complete_json(self, request: JsonRequest) -> JsonResult: ...


class LlmUnavailable(RuntimeError):
    """Das Sprachmodell ist nicht erreichbar oder hat einen Fehler gemeldet."""
