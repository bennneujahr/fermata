"""Befehle und lokale Attrappe (Ablauf ohne Netz)."""

from __future__ import annotations

import io

import pytest

from viola.backend import MemoryBackend
from viola.cli import main
from viola.config import Config
from viola.domain import EndReason
from viola.engine import Conversation
from viola.llm.fake import FakeChatModel
from viola.text_api import verify_text_token

from .conftest import make_context

SECRET = "x" * 40


def test_dev_token_is_accepted_by_text_api(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    monkeypatch.setenv("VIOLA_TEXT_TOKEN_SECRET", SECRET)
    assert main(["dev-token", "sitzung-1", "--minutes", "5"]) == 0
    token = capsys.readouterr().out.strip()
    claims = verify_text_token(token, SECRET, "sitzung-1")
    assert claims["aud"] == "viola-text" and claims["sid"] == "sitzung-1"


def test_dev_token_requires_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("VIOLA_TEXT_TOKEN_SECRET", raising=False)
    with pytest.raises(SystemExit):
        main(["dev-token", "sitzung-1"])


def test_demo_runs_offline(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    monkeypatch.setattr("sys.stdin", io.StringIO("Ja.\nIch bin 16 Jahre alt.\n"))
    assert main(["demo"]) == 0
    out = capsys.readouterr().out
    assert out.startswith("Viola: Guten Tag. Ich bin Viola, eine künstliche Intelligenz")
    assert "Ende: minderjaehrig" in out


async def test_local_fallback_walks_through_a_whole_conversation() -> None:
    """Ohne Drehbuch folgt die Attrappe den Hinweisen: Themenblöcke, Zusammenfassung, Abschluss."""
    backend = MemoryBackend()
    ctx = await make_context(backend)
    conv = Conversation(ctx, FakeChatModel(), backend)
    await conv.open()
    await conv.greeting_delivered()
    for i in range(40):
        if conv.ended:
            break
        _ = [s async for s in conv.respond(f"Antwort {i}.")]
    assert conv.end_reason is EndReason.FERTIG
    assert conv.proposed_summary
    assert [b.value for b in conv.state.covered_blocks()][:2] == ["persoenlichkeit", "werte"]


def test_config_from_env_is_used(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VIOLA_LLM_PROVIDER", "fake")
    assert Config.from_env().llm_provider == "fake"
