"""Stimme: Sprach-Tor vor der Erkennung, TTS-Brücke, Agent-Verdrahtung mit LiveKit (ohne Raum, mit Attrappen),
und die Zusicherung „kein Audio wird gespeichert“."""

from __future__ import annotations

import ast
import math
import os
import struct
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pytest
from livekit import rtc
from livekit.agents import AgentSession

from viola.backend import MemoryBackend
from viola.config import Config
from viola.domain import Mode
from viola.engine import EngineOptions
from viola.llm.fake import FakeChatModel, FakeReply
from viola.tts import FakeTts
from viola.voice.agent import EngineLLM, ViolaAgent, gated_recognition, last_user_text
from viola.voice.gate import FLUSH, EnergyDetector, SpeechGate
from viola.voice.livekit_tts import ProviderTTS
from viola.voice.worker import SESSION_OPTIONS, START_OPTIONS, build_session, build_stt, make_gate_factory, prepare

SRC = Path(__file__).resolve().parents[1] / "src" / "viola"


def frame(seconds: float = 0.1, *, speech: bool) -> rtc.AudioFrame:
    n = int(16000 * seconds)
    amp = 3000 if speech else 0
    data = b"".join(struct.pack("<h", int(amp * math.sin(2 * math.pi * 220 * i / 16000))) for i in range(n))
    return rtc.AudioFrame(data=data, sample_rate=16000, num_channels=1, samples_per_channel=n)


async def frames(pattern: list[bool]) -> AsyncIterator[rtc.AudioFrame]:
    for speech in pattern:
        yield frame(speech=speech)


async def test_gate_sends_only_speech_with_preroll_and_hangover() -> None:
    forwarded: list[float] = []
    gate = SpeechGate(EnergyDetector(), preroll_s=0.2, hangover_s=0.3, on_forward=forwarded.append)
    pattern = [False] * 30 + [True] * 10 + [False] * 30  # 3 s Stille, 1 s Sprache, 3 s Stille
    out = [item async for item in gate.process(frames(pattern))]
    sent = [f for f in out if f is not FLUSH]
    assert sum(1 for f in out if f is FLUSH) == 1
    assert out[-1] is FLUSH
    assert len(sent) == 2 + 10 + 3  # Vorlauf 0,2 s, Sprache 1 s, Nachlauf 0,3 s
    assert gate.forwarded_s == pytest.approx(1.5)
    assert sum(forwarded) == pytest.approx(1.5)
    assert gate.total_s == pytest.approx(7.0)


async def test_gate_without_speech_sends_nothing() -> None:
    gate = SpeechGate(EnergyDetector())
    assert [x async for x in gate.process(frames([False] * 50))] == []
    assert gate.forwarded_s == 0


class FakeRecognizeStream:
    def __init__(self) -> None:
        self.pushed: list[Any] = []
        self.flushes = 0
        self.ended = False

    async def __aenter__(self) -> FakeRecognizeStream:
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    def push_frame(self, f: Any) -> None:
        self.pushed.append(f)

    def flush(self) -> None:
        self.flushes += 1

    def end_input(self) -> None:
        self.ended = True

    def __aiter__(self) -> FakeRecognizeStream:
        return self

    async def __anext__(self) -> Any:
        import asyncio

        for _ in range(100):
            if self.ended:
                raise StopAsyncIteration
            await asyncio.sleep(0)
        raise StopAsyncIteration


class FakeSTT:
    def __init__(self) -> None:
        self.stream_obj = FakeRecognizeStream()

    def stream(self, **_kw: Any) -> FakeRecognizeStream:
        return self.stream_obj


async def test_gated_recognition_pushes_speech_and_finalizes() -> None:
    stt = FakeSTT()
    gate = SpeechGate(EnergyDetector(), preroll_s=0.0, hangover_s=0.0)
    _ = [ev async for ev in gated_recognition(stt, frames([False, True, True, False, False]), gate)]  # type: ignore[arg-type]
    assert len(stt.stream_obj.pushed) == 2
    assert stt.stream_obj.flushes == 1 and stt.stream_obj.ended


async def test_provider_tts_bridge_counts_characters_and_first_audio() -> None:
    chars: list[int] = []
    firsts: list[bool] = []
    bridge = ProviderTTS(FakeTts(chars_per_second=20), on_characters=chars.append, on_first_audio=lambda: firsts.append(True))
    assert bridge.provider == "fake" and bridge.sample_rate == 16000
    audio_frames = []
    async with bridge.synthesize("Guten Tag.") as stream:
        async for ev in stream:
            audio_frames.append(ev.frame)
    assert chars == [10] and firsts == [True]
    duration = sum(f.samples_per_channel for f in audio_frames) / 16000
    assert duration == pytest.approx(0.5, abs=0.05)


def test_session_options_disable_recording_and_preemptive_generation() -> None:
    assert START_OPTIONS == {"record": False}
    assert SESSION_OPTIONS["turn_handling"]["preemptive_generation"] == {"enabled": False}
    assert SESSION_OPTIONS["turn_handling"]["interruption"]["mode"] == "vad"


def test_deepgram_stt_uses_eu_endpoint_german_and_mip_opt_out() -> None:
    from viola.context import SessionSettings

    cfg = Config.from_env({"DEEPGRAM_API_KEY": "dg-test"})
    stt = build_stt(cfg, SessionSettings())
    opts = stt._opts
    assert opts.model == "nova-3" and opts.language == "de"
    assert opts.mip_opt_out is True
    assert "api.eu.deepgram.com" in opts.endpoint_url
    with pytest.raises(RuntimeError, match="DEEPGRAM_API_KEY"):
        build_stt(Config.from_env({}), SessionSettings())


async def voice_parts(backend: MemoryBackend, replies: list[FakeReply]) -> Any:
    sid = backend.create_session(mode=Mode.VOICE)
    parts = await prepare(Config.from_env({}), backend, FakeChatModel(replies), sid, EngineOptions(), tts_provider=FakeTts())
    return sid, parts


async def test_prepare_opens_conversation_with_voice_greeting() -> None:
    backend = MemoryBackend()
    _sid, parts = await voice_parts(backend, [])
    assert parts.greeting.startswith("Guten Tag. Ich bin Viola, eine künstliche Intelligenz")
    assert "Ihre Stimme wird nicht aufgezeichnet" in parts.greeting
    assert parts.conv.options.record_latency is False, "Antwortzeit misst in der Stimme der Agent bis zum ersten Ton"
    session = build_session(Config.from_env({}), parts, stt=None, vad=None)
    assert isinstance(session, AgentSession)
    assert session.tts is parts.tts
    text_sid = backend.create_session(mode=Mode.TEXT)
    with pytest.raises(RuntimeError):
        await prepare(Config.from_env({}), backend, FakeChatModel(), text_sid, EngineOptions(), tts_provider=FakeTts())


async def test_gate_factory_counts_stt_seconds() -> None:
    backend = MemoryBackend()
    _sid, parts = await voice_parts(backend, [])
    factory = make_gate_factory(Config.from_env({}), parts, vad=None)
    gate = factory()
    _ = [x async for x in gate.process(frames([True] * 5))]
    assert parts.conv.meter.stt_seconds == pytest.approx(0.5)
    assert make_gate_factory(Config.from_env({"VIOLA_STT_GATE": "false"}), parts, vad=None) is None


async def test_agent_in_livekit_session_answers_from_engine() -> None:
    backend = MemoryBackend()
    sid, parts = await voice_parts(backend, [FakeReply("Schön, dass Sie da sind. Was machen Sie gern?")])
    published: list[dict[str, Any]] = []

    async def publish(payload: dict[str, Any]) -> None:
        published.append(payload)

    agent = ViolaAgent(parts.conv, parts.greeting, publish=publish)
    async with AgentSession(llm=EngineLLM("eu.anthropic.claude-sonnet-5-5")) as session:
        await session.start(agent, record=False)
        result = await session.run(user_input="Hallo Viola, ich bin bereit.")
        result.expect.contains_message(role="assistant")
    texts = [t.text for t in parts.conv.turns]
    assert texts == ["Hallo Viola, ich bin bereit.", "Schön, dass Sie da sind. Was machen Sie gern?"]
    await parts.conv.flush()
    calls = [c[0] for c in backend.calls]
    assert calls.index("ai_notice") < calls.index("append_turns"), "KI-Hinweis vor dem ersten gespeicherten Beitrag"
    assert {"type": "ai_notice", "spoken": True} in published
    assert backend.sessions[sid].turns[0]["text"] == parts.greeting


def test_last_user_text_reads_latest_user_message() -> None:
    from livekit.agents.llm import ChatContext

    ctx = ChatContext.empty()
    ctx.add_message(role="user", content="erste")
    ctx.add_message(role="assistant", content="antwort")
    ctx.add_message(role="user", content="  zweite  ")
    assert last_user_text(ctx) == "zweite"
    assert last_user_text(ChatContext.empty()) == ""


# --------------------------------------------------------------------------- kein Audio gespeichert
FORBIDDEN_CALLS = {
    "wave.open",
    "soundfile.write",
    "sf.write",
    "np.save",
    "numpy.save",
    "tofile",
    "write_bytes",
    "tempfile.NamedTemporaryFile",
    "tempfile.mkstemp",
    "start_room_composite_egress",
    "start_track_egress",
    "start_participant_egress",
    "RoomCompositeEgressRequest",
    "TrackEgressRequest",
}


def _calls(tree: ast.AST) -> list[str]:
    names = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            f = node.func
            if isinstance(f, ast.Attribute):
                base = f.value.id if isinstance(f.value, ast.Name) else ""
                names.append(f"{base}.{f.attr}" if base else f.attr)
                names.append(f.attr)
            elif isinstance(f, ast.Name):
                names.append(f.id)
    return names


def test_code_review_no_audio_is_written_anywhere() -> None:
    """Statische Prüfung des Dienstes: keine Datei-Schreibzugriffe, keine Aufnahme (Egress) im Code."""
    offenders = []
    for path in SRC.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for name in _calls(tree):
            if name in FORBIDDEN_CALLS:
                offenders.append(f"{path.name}: {name}")
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "open":
                mode = node.args[1].value if len(node.args) > 1 and isinstance(node.args[1], ast.Constant) else "r"
                if any(m in str(mode) for m in "wax+"):
                    offenders.append(f"{path.name}: open({mode!r})")
    assert offenders == []
    worker = (SRC / "voice" / "worker.py").read_text(encoding="utf-8")
    assert '"record": False' in worker


async def test_no_audio_reaches_disk_or_database(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Ein ganzer Zug mit Stimme (Attrappen): danach keine neue Datei, und die Datenbank enthält nur Text."""
    monkeypatch.chdir(tmp_path)
    before = set(os.listdir(tmp_path))
    backend = MemoryBackend()
    sid, parts = await voice_parts(backend, [FakeReply("Gut. Was ist Ihnen wichtig?")])
    async with AgentSession(llm=EngineLLM("m")) as session:
        await session.start(ViolaAgent(parts.conv, parts.greeting), record=False)
        await session.run(user_input="Ich wandere gern.")
    audio_bytes = 0
    async with parts.tts.synthesize("Gut. Was ist Ihnen wichtig?") as stream:
        async for ev in stream:
            audio_bytes += len(ev.frame.data)
    assert audio_bytes > 0
    await parts.conv.end_by_person()
    await parts.conv.finish(analyze=False)
    assert set(os.listdir(tmp_path)) == before

    def no_bytes(value: Any) -> None:
        assert not isinstance(value, (bytes, bytearray, memoryview))
        if isinstance(value, dict):
            for v in value.values():
                no_bytes(v)
        elif isinstance(value, list):
            for v in value:
                no_bytes(v)

    s = backend.sessions[sid]
    no_bytes(s.turns)
    no_bytes(s.costs)
    assert all(set(t) == {"role", "text", "at", "mode"} for t in s.turns)
    assert s.costs[0]["tts_characters"] > 0 and s.costs[0]["details"]["mode"] == "voice"
