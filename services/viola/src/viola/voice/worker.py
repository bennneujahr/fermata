"""LiveKit-Worker für Viola (Stimme). Läuft mit LiveKit Cloud (Weg A/B) und selbst betrieben (Weg C) gleich.

Ablauf je Gespräch (Raumname = Sitzungs-ID, Auftrag über die Raumkonfiguration im Token von interview-token):
1. Kontext über interview-agent laden, Sitzung starten, Begrüßung mit KI-Hinweis sprechen.
2. Person spricht → Silero-VAD → Sprach-Tor → Deepgram Nova-3 (de, EU-Endpunkt, mip_opt_out) → Gesprächskern
   → Satz für Satz → TtsProvider (Polly Frankfurt als Platzhalter) → LiveKit.
3. Ende → Auswertung, Sicherheits-Agent, Kostenprotokoll im Hintergrund.

Datenschutz: ``record=False`` (keine Aufnahme von Audio, Transkript, Traces oder Logs bei LiveKit),
keine Egress-Aufträge, keine Dateien. Text gelangt nur über interview-agent in die Datenbank.
"""

from __future__ import annotations

import asyncio
import contextlib
import dataclasses
import json
import logging
from dataclasses import dataclass
from typing import Any

from livekit.agents import AgentSession, JobContext

from viola.backend import Backend
from viola.config import Config
from viola.context import SessionContext, SessionSettings
from viola.domain import Mode
from viola.engine import Conversation, EngineOptions
from viola.llm.base import ChatModel
from viola.tts import TtsProvider, build_tts
from viola.voice.agent import DATA_TOPIC, EngineLLM, ViolaAgent, data_message
from viola.voice.gate import EnergyDetector, SileroDetector, SpeechGate
from viola.voice.livekit_tts import ProviderTTS

log = logging.getLogger("viola.worker")

TICK_SECONDS = 5.0

# Feste Einstellungen der LiveKit-Sitzung (Tests prüfen sie):
SESSION_OPTIONS: dict[str, Any] = {
    "turn_handling": {
        # Keine vorgezogenen Antworten: Der Gesprächskern darf erst nach dem Ende der Äußerung laufen.
        "preemptive_generation": {"enabled": False},
        # Unterbrechungen nur über die lokale VAD (keine Erkennung über einen Cloud-Dienst).
        "interruption": {"enabled": True, "mode": "vad"},
        "endpointing": {"mode": "fixed", "min_delay": 0.5},
    },
}
START_OPTIONS: dict[str, Any] = {"record": False}


def build_stt(cfg: Config, settings: SessionSettings) -> Any:
    """Deepgram Nova-3, einsprachig Deutsch, EU-Endpunkt, ohne Teilnahme am Modell-Verbesserungsprogramm."""
    if not cfg.deepgram_api_key:
        raise RuntimeError("DEEPGRAM_API_KEY fehlt – ohne Spracherkennung kein Sprachgespräch (Textmodus geht)")
    from livekit.plugins import deepgram

    return deepgram.STT(
        model=settings.stt_model,
        language=settings.stt_language,
        api_key=cfg.deepgram_api_key,
        base_url=cfg.deepgram_url,
        mip_opt_out=True,
        punctuate=True,
        smart_format=False,
        interim_results=True,
        filler_words=True,
        keyterm=["Fermata", "Viola"],
    )


def load_vad() -> Any:
    from livekit.plugins import silero

    return silero.VAD.load(min_silence_duration=0.55, prefix_padding_duration=0.5)


@dataclass
class VoiceParts:
    conv: Conversation
    greeting: str
    tts: ProviderTTS
    provider: TtsProvider


async def prepare(
    cfg: Config,
    backend: Backend,
    model: ChatModel,
    session_id: str,
    options: EngineOptions,
    tts_provider: TtsProvider | None = None,
) -> VoiceParts:
    """Kontext laden, Gespräch öffnen, Stimme wählen. Ohne LiveKit testbar."""
    ctx = SessionContext.from_json(await backend.context(session_id))
    if ctx.mode is not Mode.VOICE:
        raise RuntimeError("Sitzung ist nicht für Stimme angefragt")
    # Stimme: Antwortzeit bis zum ersten Ton misst der Agent (ProviderTTS), nicht der Gesprächskern.
    conv = Conversation(ctx, model, backend, options=dataclasses.replace(options, record_latency=False))
    provider = tts_provider or build_tts(
        cfg.tts_provider_override or ctx.settings.tts_provider, cfg.tts_voice_override or ctx.settings.tts_voice, cfg
    )
    greeting = await conv.open()

    def add_chars(n: int) -> None:
        conv.meter.tts_characters += n

    tts = ProviderTTS(provider, on_characters=add_chars)
    return VoiceParts(conv=conv, greeting=greeting, tts=tts, provider=provider)


def build_session(cfg: Config, parts: VoiceParts, *, stt: Any, vad: Any) -> AgentSession:
    s = parts.conv.settings
    return AgentSession(
        stt=stt,
        vad=vad,
        tts=parts.tts,
        llm=EngineLLM(s.llm_model_id),
        user_away_timeout=float(s.silence_prompt_seconds),
        **SESSION_OPTIONS,
    )


def make_gate_factory(cfg: Config, parts: VoiceParts, vad: Any) -> Any:
    if not cfg.stt_gate:
        return None

    def on_forward(seconds: float) -> None:
        parts.conv.meter.stt_seconds += seconds

    def factory() -> SpeechGate:
        detector = SileroDetector(vad) if vad is not None else EnergyDetector()
        return SpeechGate(detector, on_forward=on_forward)

    return factory


async def run_job(ctx: JobContext, cfg: Config, backend: Backend, model: ChatModel, options: EngineOptions) -> None:
    metadata: dict[str, Any] = {}
    with contextlib.suppress(ValueError, TypeError):
        metadata = json.loads(ctx.job.metadata or "{}")
    session_id = str(metadata.get("session_id") or ctx.room.name)
    parts = await prepare(cfg, backend, model, session_id, options)
    conv = parts.conv
    vad = load_vad()
    session = build_session(cfg, parts, stt=build_stt(cfg, conv.settings), vad=vad)
    finished = asyncio.Event()

    async def publish(payload: dict[str, Any]) -> None:
        await ctx.room.local_participant.publish_data(data_message(payload), reliable=True, topic=DATA_TOPIC)

    async def on_finished() -> None:
        if finished.is_set():
            return
        finished.set()

    agent = ViolaAgent(
        conv, parts.greeting, publish=publish, gate_factory=make_gate_factory(cfg, parts, vad), on_finished=on_finished
    )
    parts.tts.on_first_audio = agent.first_audio

    @session.on("user_state_changed")
    def _away(ev: Any) -> None:
        if getattr(ev, "new_state", None) == "away" and not conv.ended:
            asyncio.get_running_loop().create_task(_silence())

    async def _silence() -> None:
        text = await conv.on_silence()
        if text:
            session.say(text, allow_interruptions=True)
        if conv.ended:
            await agent.flush_events()
            agent.schedule_close()

    @session.on("conversation_item_added")
    def _item(ev: Any) -> None:
        item = getattr(ev, "item", None)
        if getattr(item, "role", None) == "assistant" and getattr(item, "interrupted", False):
            conv.note_interruption(item.text_content or "")  # type: ignore[union-attr]

    @ctx.room.on("participant_disconnected")
    def _left(_p: Any) -> None:
        if not conv.ended:
            asyncio.get_running_loop().create_task(_lost())

    async def _lost() -> None:
        await conv.end_by_technical_problem()
        finished.set()

    async def ticker() -> None:
        while not finished.is_set():
            await asyncio.sleep(TICK_SECONDS)
            text = await conv.tick()
            if text:
                session.say(text, allow_interruptions=False)
                await agent.flush_events()
                agent.schedule_close()

    await ctx.connect()
    await session.start(agent=agent, room=ctx.room, **START_OPTIONS)
    tick_task = asyncio.create_task(ticker(), name="viola-tick")
    try:
        await finished.wait()
    finally:
        tick_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await tick_task
        if conv.mode is Mode.TEXT and not conv.ended:
            # Wechsel zu Text: Die Sitzung läuft im Textmodus weiter; hier nur auflegen.
            log.info("Sitzung wechselt zu Text")
        else:
            await conv.finish()
        await session.aclose()
        ctx.shutdown(reason="viola_fertig")


def build_server(cfg: Config | None = None) -> Any:
    """AgentServer mit Agent-Namen für den Auftrag aus dem Token (agent dispatch)."""
    from livekit.agents import AgentServer

    from viola.factory import build_backend, build_model, engine_options

    c = cfg or Config.from_env()
    server = AgentServer(ws_url=c.livekit_url or None, api_key=c.livekit_api_key or None, api_secret=c.livekit_api_secret or None)
    options = engine_options(c)

    async def entrypoint(ctx: JobContext) -> None:
        backend = build_backend(c)
        model = build_model(c)
        await run_job(ctx, c, backend, model, options)

    server.rtc_session(entrypoint, agent_name=c.livekit_agent_name)
    return server
