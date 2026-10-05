"""Konfiguration aus Umgebungsvariablen (Referenz: services/viola/.env.example).

Fachliche Werte (Modell-ID, Zeitlimits, Preise, Stimme) kommen pro Gespräch aus der Datenbank
(ops.app_settings über api.agent_session_context). Hier steht nur, was den Betrieb betrifft:
Anbieter, Zugänge, Adressen. Ohne Zugänge läuft alles mit Attrappen (fake).
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Literal

LlmProvider = Literal["bedrock", "anthropic", "fake"]
BackendKind = Literal["http", "memory"]
NoticeStyle = Literal["system_message", "user_text"]


def _get(env: Mapping[str, str], key: str, default: str = "") -> str:
    value = env.get(key, "")
    return value if value != "" else default


def _bool(env: Mapping[str, str], key: str, default: bool) -> bool:
    value = env.get(key, "")
    if value == "":
        return default
    return value.strip().lower() in {"1", "true", "ja", "yes", "on"}


@dataclass(frozen=True, slots=True)
class Config:
    env: str = "local"
    # Rückweg in die Datenbank: nur über die Edge Function interview-agent
    backend: BackendKind = "memory"
    agent_url: str = ""
    agent_secret: str = field(default="", repr=False)
    # Sprachmodell
    llm_provider: LlmProvider = "fake"
    aws_region: str = "eu-central-1"
    llm_model_override: str = ""
    analysis_model_override: str = ""
    llm_max_tokens: int = 2048
    analysis_max_tokens: int = 16000
    notice_style: NoticeStyle = "system_message"
    eager_tool_streaming: bool = False
    # Stimme und Spracherkennung
    tts_provider_override: str = ""
    tts_voice_override: str = ""
    tts_enterprise_eu: bool = False
    google_tts_endpoint: str = "eu-texttospeech.googleapis.com"
    cartesia_api_key: str = field(default="", repr=False)
    cartesia_base_url: str = "https://api.cartesia.ai"
    cartesia_voice_id: str = ""
    elevenlabs_api_key: str = field(default="", repr=False)
    elevenlabs_base_url: str = "https://api.elevenlabs.io"
    elevenlabs_voice_id: str = ""
    deepgram_api_key: str = field(default="", repr=False)
    deepgram_url: str = "https://api.eu.deepgram.com/v1/listen"
    stt_gate: bool = True
    # LiveKit (Weg A, B oder C – der Code ist für alle gleich, nur URL und Schlüssel ändern sich)
    livekit_url: str = ""
    livekit_api_key: str = ""
    livekit_api_secret: str = field(default="", repr=False)
    livekit_agent_name: str = "viola"
    livekit_path_override: str = ""
    # Textmodus
    text_token_secret: str = field(default="", repr=False)
    text_allowed_origins: tuple[str, ...] = ("http://localhost:3000",)
    text_host: str = "0.0.0.0"
    text_port: int = 8352
    # Transkript: Art.-9-Sätze vor dem Speichern ersetzen (Standard aus der Datenbank, hier nur Notschalter)
    log_level: str = "INFO"

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> Config:
        e: Mapping[str, str] = os.environ if env is None else env
        provider = _get(e, "VIOLA_LLM_PROVIDER", "fake")
        if provider not in ("bedrock", "anthropic", "fake"):
            raise ValueError(f"VIOLA_LLM_PROVIDER unbekannt: {provider}")
        backend = _get(e, "VIOLA_BACKEND", "memory")
        if backend not in ("http", "memory"):
            raise ValueError(f"VIOLA_BACKEND unbekannt: {backend}")
        notice_style = _get(e, "VIOLA_SYSTEM_NOTICES", "system_message")
        if notice_style not in ("system_message", "user_text"):
            raise ValueError(f"VIOLA_SYSTEM_NOTICES unbekannt: {notice_style}")
        cfg = cls(
            env=_get(e, "VIOLA_ENV", "local"),
            backend=backend,  # type: ignore[arg-type]
            agent_url=_get(e, "INTERVIEW_AGENT_URL"),
            agent_secret=_get(e, "INTERVIEW_AGENT_SECRET"),
            llm_provider=provider,  # type: ignore[arg-type]
            aws_region=_get(e, "VIOLA_AWS_REGION", _get(e, "AWS_REGION", "eu-central-1")),
            llm_model_override=_get(e, "VIOLA_LLM_MODEL_ID"),
            analysis_model_override=_get(e, "VIOLA_ANALYSIS_MODEL_ID"),
            llm_max_tokens=int(_get(e, "VIOLA_LLM_MAX_TOKENS", "2048")),
            analysis_max_tokens=int(_get(e, "VIOLA_ANALYSIS_MAX_TOKENS", "16000")),
            notice_style=notice_style,  # type: ignore[arg-type]
            eager_tool_streaming=_bool(e, "VIOLA_EAGER_TOOL_STREAMING", False),
            tts_provider_override=_get(e, "VIOLA_TTS_PROVIDER"),
            tts_voice_override=_get(e, "VIOLA_TTS_VOICE"),
            tts_enterprise_eu=_bool(e, "VIOLA_TTS_ENTERPRISE_EU", False),
            google_tts_endpoint=_get(e, "GOOGLE_TTS_ENDPOINT", "eu-texttospeech.googleapis.com"),
            cartesia_api_key=_get(e, "CARTESIA_API_KEY"),
            cartesia_base_url=_get(e, "CARTESIA_BASE_URL", "https://api.cartesia.ai"),
            cartesia_voice_id=_get(e, "CARTESIA_VOICE_ID"),
            elevenlabs_api_key=_get(e, "ELEVENLABS_API_KEY"),
            elevenlabs_base_url=_get(e, "ELEVENLABS_BASE_URL", "https://api.elevenlabs.io"),
            elevenlabs_voice_id=_get(e, "ELEVENLABS_VOICE_ID"),
            deepgram_api_key=_get(e, "DEEPGRAM_API_KEY"),
            deepgram_url=_get(e, "DEEPGRAM_URL", "https://api.eu.deepgram.com/v1/listen"),
            stt_gate=_bool(e, "VIOLA_STT_GATE", True),
            livekit_url=_get(e, "LIVEKIT_URL"),
            livekit_api_key=_get(e, "LIVEKIT_API_KEY"),
            livekit_api_secret=_get(e, "LIVEKIT_API_SECRET"),
            livekit_agent_name=_get(e, "LIVEKIT_AGENT_NAME", "viola"),
            livekit_path_override=_get(e, "VIOLA_LIVEKIT_PATH"),
            text_token_secret=_get(e, "VIOLA_TEXT_TOKEN_SECRET"),
            text_allowed_origins=tuple(
                o.strip() for o in _get(e, "VIOLA_TEXT_ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()
            ),
            text_host=_get(e, "VIOLA_TEXT_HOST", "0.0.0.0"),
            text_port=int(_get(e, "VIOLA_TEXT_PORT", "8352")),
            log_level=_get(e, "VIOLA_LOG_LEVEL", "INFO"),
        )
        cfg.validate()
        return cfg

    def validate(self) -> None:
        """Harte Regeln für den Betrieb: in Produktion keine Attrappen, Geheimnisse lang genug."""
        problems: list[str] = []
        if self.backend == "http":
            if not self.agent_url:
                problems.append("INTERVIEW_AGENT_URL fehlt")
            if len(self.agent_secret) < 32:
                problems.append("INTERVIEW_AGENT_SECRET fehlt oder ist kürzer als 32 Zeichen")
        if self.env == "production":
            if self.backend != "http":
                problems.append("In Produktion muss VIOLA_BACKEND=http sein")
            if self.llm_provider != "bedrock":
                problems.append("In Produktion muss VIOLA_LLM_PROVIDER=bedrock sein (EU-Datenweg)")
            if "eu.deepgram.com" not in self.deepgram_url:
                problems.append("DEEPGRAM_URL muss der EU-Endpunkt sein")
            if not self.aws_region.startswith("eu-"):
                problems.append("VIOLA_AWS_REGION muss eine EU-Region sein")
        if problems:
            raise ValueError("Konfiguration unvollständig: " + "; ".join(problems))
