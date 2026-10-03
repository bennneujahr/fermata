"""Gesprächskontext aus api.agent_session_context (über die Edge Function interview-agent).

Enthält nur, was Viola für dieses eine Gespräch braucht: Art, Stufe, Anrede, Einstellungen,
bisheriges Profil (ohne Art.-9-Daten) und bei Fortsetzungen die Zusammenfassung der letzten Sitzung.
Nie Daten anderer Mitglieder.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from viola.domain import AddressForm, Block, Kind, Mode, Tier, Turn


@dataclass(frozen=True, slots=True)
class TierDepth:
    target_minutes: int = 20
    min_turns_per_block: int = 2
    max_turns_per_block: int = 3

    @classmethod
    def from_json(cls, data: dict[str, Any] | None) -> TierDepth:
        if not data:
            return cls()
        turns = data.get("turns_per_block") or [2, 3]
        return cls(
            target_minutes=int(data.get("target_minutes", 20)),
            min_turns_per_block=int(turns[0]),
            max_turns_per_block=int(turns[1]),
        )


DEFAULT_PRICES: dict[str, Any] = {
    "usd_to_eur": 0.86,
    "stt_usd_per_minute": 0.0077,
    "llm_usd_per_mtok": {"input": 2.2, "output": 11.0, "cache_read": 0.22, "cache_write": 2.75},
    "tts_usd_per_million_chars": {"polly": 30.0, "google": 30.0, "cartesia": 40.0, "elevenlabs": 100.0, "fake": 0.0},
    "media_usd_per_minute": {"A": 0.01, "B": 0.01, "C": 0.001},
}

DEFAULT_CRISIS_LINES: dict[str, Any] = {
    "telefonseelsorge": ["0800 1110111", "0800 1110222", "116 123"],
    "notruf": "112",
}


@dataclass(frozen=True, slots=True)
class SessionSettings:
    llm_model_id: str = "eu.anthropic.claude-sonnet-5-5"
    llm_effort: str = "low"
    llm_thinking: str = "between_tools"
    analysis_model_id: str = "eu.anthropic.claude-sonnet-5-5"
    analysis_effort: str = "medium"
    stt_model: str = "nova-3"
    stt_language: str = "de"
    tts_provider: str = "polly"
    tts_voice: str = "Vicki"
    wrapup_minutes: int = 4
    grace_minutes: int = 2
    silence_prompt_seconds: int = 15
    max_silence_prompts: int = 2
    max_sentences: int = 3
    latency_target_ms_p90: int = 2000
    target_cost_eur_per_hour: float = 2.0
    livekit_path: str = "C"
    prices: dict[str, Any] = field(default_factory=lambda: dict(DEFAULT_PRICES))
    tier_depth: TierDepth = field(default_factory=TierDepth)
    redact_art9_in_transcripts: bool = True
    transcript_retention_days: int = 30
    ai_notice_version: str = "2026-10-03"
    crisis_lines: dict[str, Any] = field(default_factory=lambda: dict(DEFAULT_CRISIS_LINES))

    @classmethod
    def from_json(cls, data: dict[str, Any] | None) -> SessionSettings:
        d = data or {}
        base = cls()

        def pick(key: str, default: Any) -> Any:
            value = d.get(key)
            return default if value is None else value

        return cls(
            llm_model_id=str(pick("llm_model_id", base.llm_model_id)),
            llm_effort=str(pick("llm_effort", base.llm_effort)),
            llm_thinking=str(pick("llm_thinking", base.llm_thinking)),
            analysis_model_id=str(pick("analysis_model_id", base.analysis_model_id)),
            analysis_effort=str(pick("analysis_effort", base.analysis_effort)),
            stt_model=str(pick("stt_model", base.stt_model)),
            stt_language=str(pick("stt_language", base.stt_language)),
            tts_provider=str(pick("tts_provider", base.tts_provider)),
            tts_voice=str(pick("tts_voice", base.tts_voice)),
            wrapup_minutes=int(pick("wrapup_minutes", base.wrapup_minutes)),
            grace_minutes=int(pick("grace_minutes", base.grace_minutes)),
            silence_prompt_seconds=int(pick("silence_prompt_seconds", base.silence_prompt_seconds)),
            max_silence_prompts=int(pick("max_silence_prompts", base.max_silence_prompts)),
            max_sentences=int(pick("max_sentences", base.max_sentences)),
            latency_target_ms_p90=int(pick("latency_target_ms_p90", base.latency_target_ms_p90)),
            target_cost_eur_per_hour=float(pick("target_cost_eur_per_hour", base.target_cost_eur_per_hour)),
            livekit_path=str(pick("livekit_path", base.livekit_path)),
            prices=dict(pick("prices", base.prices)),
            tier_depth=TierDepth.from_json(d.get("tier_depth")),
            redact_art9_in_transcripts=bool(pick("redact_art9_in_transcripts", True)),
            transcript_retention_days=int(pick("transcript_retention_days", 30)),
            ai_notice_version=str(pick("ai_notice_version", base.ai_notice_version)),
            crisis_lines=dict(pick("crisis_lines", base.crisis_lines)),
        )


@dataclass(frozen=True, slots=True)
class PreviousSession:
    session_id: str
    summary_draft: str | None
    covered_blocks: tuple[Block, ...]


@dataclass(frozen=True, slots=True)
class SessionContext:
    session_id: str
    user_id: str
    kind: Kind
    mode: Mode
    status: str
    address_form: AddressForm
    tier: Tier
    max_minutes: int
    settings: SessionSettings
    display_name: str | None = None
    profile: dict[str, Any] | None = None
    previous: PreviousSession | None = None
    evening: dict[str, Any] | None = None
    turns: tuple[Turn, ...] = ()
    covered_blocks: tuple[Block, ...] = ()
    ai_notice_at: datetime | None = None

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> SessionContext:
        s = data["session"]
        prev = data.get("previous")
        turns_raw = data.get("turns") or []
        turns = tuple(
            Turn(
                role="viola" if t.get("role") == "viola" else "person",
                text=str(t.get("text", "")),
                at=datetime.fromisoformat(str(t["at"])) if t.get("at") else datetime.fromisoformat("1970-01-01T00:00:00+00:00"),
                mode=Mode(t.get("mode", "voice")),
            )
            for t in turns_raw
            if t.get("text")
        )
        return cls(
            session_id=str(s["id"]),
            user_id=str(s.get("user_id", "")),
            kind=Kind(s["kind"]),
            mode=Mode(s["mode"]),
            status=str(s.get("status", "requested")),
            address_form=AddressForm(s["address_form"]),
            tier=Tier(s["tier_depth"]),
            max_minutes=int(s.get("max_minutes") or 30),
            settings=SessionSettings.from_json(data.get("settings")),
            display_name=(data.get("person") or {}).get("display_name"),
            profile=data.get("profile"),
            previous=PreviousSession(
                session_id=str(prev["session_id"]),
                summary_draft=prev.get("summary_draft"),
                covered_blocks=tuple(Block(b) for b in prev.get("covered_blocks") or []),
            )
            if prev
            else None,
            evening=data.get("evening"),
            turns=turns,
            covered_blocks=tuple(Block(b) for b in s.get("covered_blocks") or []),
            ai_notice_at=datetime.fromisoformat(s["ai_notice_at"]) if s.get("ai_notice_at") else None,
        )
