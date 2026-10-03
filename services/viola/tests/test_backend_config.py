"""Rückweg über interview-agent (HTTP) und Konfiguration."""

from __future__ import annotations

import json

import httpx
import pytest

from viola.backend import BackendError, HttpBackend, MemoryBackend
from viola.config import Config

SECRET = "s" * 40


def make_backend(handler) -> HttpBackend:  # type: ignore[no-untyped-def]
    return HttpBackend("https://fermata.test/functions/v1/interview-agent", SECRET,
                       client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))


async def test_http_backend_sends_secret_and_action() -> None:
    seen: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        body = json.loads(req.content)
        if body["action"] == "append_turns":
            return httpx.Response(200, json={"total": 3})
        if body["action"] == "safety_flag":
            return httpx.Response(200, json={"flag_id": "f1"})
        return httpx.Response(200, json={"status": "active"})

    b = make_backend(handler)
    assert await b.append_turns("sid", [{"role": "person", "text": "Hallo"}]) == 3
    assert await b.flag_safety("sid", "krise", "hoch", "regel", 2) == "f1"
    await b.end("sid", "fertig", ["werte"])
    assert seen[0].headers["x-agent-secret"] == SECRET
    assert json.loads(seen[0].content) == {"action": "append_turns", "session_id": "sid", "turns": [{"role": "person", "text": "Hallo"}]}
    assert json.loads(seen[1].content)["turn_index"] == 2
    assert json.loads(seen[2].content) == {"action": "end", "session_id": "sid", "reason": "fertig", "covered_blocks": ["werte"]}
    await b.aclose()


async def test_http_backend_maps_errors() -> None:
    b = make_backend(lambda req: httpx.Response(422, json={"error": "art9_content", "message": "religion"}))
    with pytest.raises(BackendError) as exc:
        await b.save_summary_draft("sid", "Text", None)
    assert exc.value.status == 422 and exc.value.code == "art9_content" and exc.value.message == "religion"


async def test_no_binary_data_ever_leaves_the_service() -> None:
    called = False

    def handler(req: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(200, json={})

    b = make_backend(handler)
    with pytest.raises(TypeError, match="Binärdaten"):
        await b.append_turns("sid", [{"role": "person", "text": "x", "audio": b"\x00\x01"}])
    with pytest.raises(TypeError):
        await MemoryBackend().append_turns("sid", [{"role": "person", "text": "x", "audio": bytearray(4)}])
    assert not called


def test_short_secret_is_refused() -> None:
    with pytest.raises(ValueError):
        HttpBackend("https://x", "kurz")


async def test_memory_backend_enforces_ai_notice_and_art9() -> None:
    b = MemoryBackend()
    sid = b.create_session()
    await b.start(sid)
    with pytest.raises(BackendError, match="ai_notice_missing"):
        await b.append_turns(sid, [{"role": "person", "text": "Hallo"}])
    await b.mark_ai_notice(sid, "v1")
    assert await b.append_turns(sid, [{"role": "person", "text": "Hallo"}]) == 1
    with pytest.raises(BackendError, match="art9_content"):
        await b.save_summary_draft(sid, "Sie sind Muslima und gehen in die Moschee.", None)
    await b.end(sid, "minderjaehrig", None)
    with pytest.raises(BackendError, match="session_not_eligible"):
        await b.save_analysis(sid, {"wants": []})


def test_config_defaults_are_offline_fakes() -> None:
    cfg = Config.from_env({})
    assert cfg.llm_provider == "fake" and cfg.backend == "memory"
    assert cfg.deepgram_url == "https://api.eu.deepgram.com/v1/listen"
    assert cfg.aws_region == "eu-central-1"
    assert cfg.notice_style == "system_message"
    assert "agent_secret" not in repr(cfg) or SECRET not in repr(cfg)


def test_config_production_requires_eu_and_real_providers() -> None:
    with pytest.raises(ValueError, match="VIOLA_BACKEND=http"):
        Config.from_env({"VIOLA_ENV": "production"})
    with pytest.raises(ValueError, match="EU-Endpunkt"):
        Config.from_env({"VIOLA_ENV": "production", "VIOLA_BACKEND": "http", "INTERVIEW_AGENT_URL": "https://x",
                         "INTERVIEW_AGENT_SECRET": SECRET, "VIOLA_LLM_PROVIDER": "bedrock",
                         "DEEPGRAM_URL": "https://api.deepgram.com/v1/listen"})
    cfg = Config.from_env({"VIOLA_ENV": "production", "VIOLA_BACKEND": "http", "INTERVIEW_AGENT_URL": "https://x",
                           "INTERVIEW_AGENT_SECRET": SECRET, "VIOLA_LLM_PROVIDER": "bedrock"})
    assert cfg.llm_provider == "bedrock"
    assert SECRET not in repr(cfg)


def test_config_rejects_unknown_values() -> None:
    for env in ({"VIOLA_LLM_PROVIDER": "openai"}, {"VIOLA_BACKEND": "sql"}, {"VIOLA_SYSTEM_NOTICES": "laut"}):
        with pytest.raises(ValueError):
            Config.from_env(env)
    with pytest.raises(ValueError, match="INTERVIEW_AGENT_SECRET"):
        Config.from_env({"VIOLA_BACKEND": "http", "INTERVIEW_AGENT_URL": "https://x", "INTERVIEW_AGENT_SECRET": "kurz"})
