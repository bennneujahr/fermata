"""Textmodus über HTTP mit Attrappen (Sprachmodell, Datenbank)."""

from __future__ import annotations

import json
import time
from typing import Any

import httpx
import jwt
import pytest

from viola.backend import MemoryBackend
from viola.config import Config
from viola.domain import Mode
from viola.llm.fake import FakeChatModel, FakeReply
from viola.text_api import create_app

SECRET = "text-secret-for-tests-0123456789abcdef-xyz"
ASK = "Danke, das klingt schön. Was ist Ihnen wichtig?"


def token(sid: str, *, secret: str = SECRET, aud: str = "viola-text", exp_in: int = 600) -> str:
    now = int(time.time())
    return jwt.encode(
        {"iss": "fermata", "aud": aud, "sub": "user-1", "sid": sid, "iat": now, "exp": now + exp_in}, secret, algorithm="HS256"
    )


def setup(
    replies: list[FakeReply], json_replies: list[Any] | None = None, mode: Mode = Mode.TEXT
) -> tuple[httpx.AsyncClient, MemoryBackend, str, Any]:
    backend = MemoryBackend()
    sid = backend.create_session(mode=mode)
    model = FakeChatModel(replies, json_replies=json_replies or [])
    cfg = Config.from_env({"VIOLA_TEXT_TOKEN_SECRET": SECRET, "VIOLA_TEXT_ALLOWED_ORIGINS": "https://app.fermata.test"})
    app = create_app(cfg, backend=backend, model=model)
    client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://viola.test")
    return client, backend, sid, app


def auth(sid: str) -> dict[str, str]:
    return {"authorization": f"Bearer {token(sid)}"}


async def test_access_requires_valid_token_for_the_session() -> None:
    client, _backend, sid, _ = setup([])
    url = f"/v1/text/sessions/{sid}/start"
    assert (await client.post(url)).status_code == 401
    assert (await client.post(url, headers={"authorization": f"Bearer {token(sid, secret='x' * 40)}"})).json() == {
        "error": "invalid_token"
    }
    assert (await client.post(url, headers={"authorization": f"Bearer {token(sid, aud='andere')}"})).status_code == 401
    assert (await client.post(url, headers={"authorization": f"Bearer {token(sid, exp_in=-120)}"})).status_code == 401
    wrong = await client.post(url, headers={"authorization": f"Bearer {token('andere-sitzung')}"})
    assert wrong.status_code == 403 and wrong.json() == {"error": "wrong_session"}


async def test_start_returns_greeting_with_ai_notice_and_records_it() -> None:
    client, backend, sid, _ = setup([])
    r = await client.post(f"/v1/text/sessions/{sid}/start", headers=auth(sid))
    assert r.status_code == 200
    body = r.json()
    assert body["messages"][0]["text"].startswith(
        "Guten Tag. Ich bin Viola, eine künstliche Intelligenz von Fermata, kein Mensch."
    )
    assert body["ai_notice"] is True and body["resumed"] is False and body["phase"] == "themen"
    assert backend.sessions[sid].ai_notice_at is not None
    again = (await client.post(f"/v1/text/sessions/{sid}/start", headers=auth(sid))).json()
    assert again["resumed"] is True and again["messages"] == body["messages"]


async def test_message_before_start_is_rejected() -> None:
    client, _b, sid, _ = setup([])
    r = await client.post(f"/v1/text/sessions/{sid}/messages", headers=auth(sid), json={"text": "Hallo"})
    assert r.status_code == 409 and r.json() == {"error": "not_started"}


async def test_json_conversation_until_end_and_background_analysis() -> None:
    analysis = {
        "summary": "Sie sind ruhig und wandern gern. Humor ist Ihnen wichtig.",
        "personality": {"traits": ["ruhig"], "interests": ["Wandern"], "notes": ""},
        "values_profile": {"values": [], "relationship": [], "notes": ""},
        "life_circumstances": {"work": None, "living": None, "family": None, "free_evenings": [], "free_time_notes": None},
        "age_min": None,
        "age_max": None,
        "travel_modes": [],
        "travel_max_minutes": None,
        "travel_max_km": None,
        "smoking": None,
        "has_children": None,
        "wants_children": None,
        "wants": [{"category": "persoenlichkeit", "text": "Humor", "importance": 3}],
        "dealbreakers": [],
        "personal_weights": None,
    }
    client, backend, sid, app = setup(
        [
            FakeReply(ASK),
            FakeReply(
                "Ich fasse zusammen. Stimmt das so?",
                [("propose_summary", {"summary": "Sie sind ruhig und wandern gern.", "is_partial": False})],
            ),
            FakeReply("Danke, bis bald.", [("end_conversation", {"reason": "fertig"})]),
        ],
        json_replies=[analysis, {"flagged": []}, {"flagged": []}, {"flags": []}],
    )
    await client.post(f"/v1/text/sessions/{sid}/start", headers=auth(sid))
    r1 = (await client.post(f"/v1/text/sessions/{sid}/messages", headers=auth(sid), json={"text": "Ja, gern."})).json()
    assert r1["messages"] == [{"role": "viola", "text": ASK}] and r1["ended"] is False
    r2 = (await client.post(f"/v1/text/sessions/{sid}/messages", headers=auth(sid), json={"text": "Ich wandere."})).json()
    assert r2["events"] == [{"type": "summary_proposed", "text": "Sie sind ruhig und wandern gern.", "partial": False}]
    assert r2["phase"] == "zusammenfassung"
    r3 = (await client.post(f"/v1/text/sessions/{sid}/messages", headers=auth(sid), json={"text": "Ja, passt."})).json()
    assert r3["ended"] is True and r3["end_reason"] == "fertig"
    assert r3["events"] == [{"type": "ended", "reason": "fertig", "summary_pending": True}]
    await app.state.registry.drain()
    s = backend.sessions[sid]
    assert s.summary_draft == "Sie sind ruhig und wandern gern. Humor ist Ihnen wichtig."
    assert s.analysis_status == "saved" and s.costs
    after = await client.post(f"/v1/text/sessions/{sid}/messages", headers=auth(sid), json={"text": "Hallo?"})
    assert after.status_code == 409


async def test_streaming_with_server_sent_events() -> None:
    client, _b, sid, _ = setup([FakeReply("Erster Satz. Zweiter Satz? ")])
    await client.post(f"/v1/text/sessions/{sid}/start", headers=auth(sid))
    r = await client.post(
        f"/v1/text/sessions/{sid}/messages", headers={**auth(sid), "accept": "text/event-stream"}, json={"text": "Ja."}
    )
    assert r.headers["content-type"].startswith("text/event-stream")
    events = [
        (blk.split("\n")[0].removeprefix("event: "), json.loads(blk.split("\n")[1].removeprefix("data: ")))
        for blk in r.text.strip().split("\n\n")
    ]
    assert events[0] == ("sentence", {"text": "Erster Satz."})
    assert events[1] == ("sentence", {"text": "Zweiter Satz?"})
    assert events[-1][0] == "done" and events[-1][1]["ended"] is False


async def test_person_can_end_and_limits_apply() -> None:
    client, backend, sid, app = setup([FakeReply(ASK)])
    await client.post(f"/v1/text/sessions/{sid}/start", headers=auth(sid))
    too_long = await client.post(f"/v1/text/sessions/{sid}/messages", headers=auth(sid), json={"text": "x" * 2001})
    assert too_long.status_code == 422
    r = (await client.post(f"/v1/text/sessions/{sid}/end", headers=auth(sid))).json()
    assert r["ended"] is True and r["end_reason"] == "person_beendet"
    await app.state.registry.drain()
    assert backend.sessions[sid].status == "completed"
    assert backend.sessions[sid].analysis_status == "skipped"


async def test_voice_session_continues_as_text() -> None:
    client, backend, sid, _ = setup([FakeReply(ASK)], mode=Mode.VOICE)
    r = await client.post(f"/v1/text/sessions/{sid}/start", headers=auth(sid))
    assert r.status_code == 200
    assert backend.sessions[sid].mode == "text"
    assert "Der Text unseres Gesprächs" in r.json()["messages"][0]["text"]


async def test_cors_allows_only_the_web_app() -> None:
    client, _b, sid, _ = setup([])
    ok = await client.options(
        f"/v1/text/sessions/{sid}/start",
        headers={
            "origin": "https://app.fermata.test",
            "access-control-request-method": "POST",
            "access-control-request-headers": "authorization",
        },
    )
    assert ok.headers.get("access-control-allow-origin") == "https://app.fermata.test"
    bad = await client.options(
        f"/v1/text/sessions/{sid}/start", headers={"origin": "https://boese.example", "access-control-request-method": "POST"}
    )
    assert "access-control-allow-origin" not in bad.headers


async def test_health() -> None:
    client, _b, _sid, _ = setup([])
    assert (await client.get("/healthz")).json() == {"ok": True, "sessions": 0}


@pytest.mark.parametrize("secret", ["", "kurz"])
async def test_text_mode_without_secret_is_unavailable(secret: str) -> None:
    backend = MemoryBackend()
    sid = backend.create_session()
    app = create_app(Config.from_env({"VIOLA_TEXT_TOKEN_SECRET": secret}), backend=backend, model=FakeChatModel())
    client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://viola.test")
    r = await client.post(f"/v1/text/sessions/{sid}/start", headers=auth(sid))
    assert r.status_code == 503


async def test_idle_sessions_are_closed_and_analyzed() -> None:
    now = {"t": 1000.0}
    backend = MemoryBackend()
    sid = backend.create_session()
    cfg = Config.from_env({"VIOLA_TEXT_TOKEN_SECRET": SECRET})
    app = create_app(cfg, backend=backend, model=FakeChatModel(), clock=lambda: now["t"])
    client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://viola.test")
    await client.post(f"/v1/text/sessions/{sid}/start", headers=auth(sid))
    now["t"] += 21 * 60
    other = backend.create_session()
    await client.post(f"/v1/text/sessions/{other}/start", headers=auth(other))
    await app.state.registry.drain()
    assert backend.sessions[sid].status == "failed" and backend.sessions[sid].end_reason == "technik"
    assert backend.sessions[sid].costs, "Kostenprotokoll auch bei Abbruch"
    assert backend.sessions[other].status == "active"
