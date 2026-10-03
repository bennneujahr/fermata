"""Produktionssperre (DSFA M-3): Der Auswahl-Job rechnet in Produktion nie mit Attrappen.

Wie Viola (services/viola/src/viola/config.py) verweigert der Job den Lauf, wenn FERMATA_ENV=production gesetzt ist
oder die Datenbank (ops.environment()) production meldet und FERMATA_LLM_BACKEND oder FERMATA_EMBEDDING_BACKEND
„fake“ ist. Kann die Datenbank ihre Umgebung nicht nennen, gilt das wie Produktion.
"""

from __future__ import annotations

import pytest

from fermata_matcher import cli
from fermata_matcher.config import ProductionGuardError, RuntimeConfig, ensure_production_safe, production_problems
from fermata_matcher.embeddings import FakeEmbedder
from fermata_matcher.llm.client import FakeLLM
from fermata_matcher.runner import Runner, RunOptions

from conftest import act_as_matcher, reset_role


@pytest.mark.parametrize(
    ("llm", "emb", "env", "db_env", "blocked"),
    [
        ("fake", "fake", None, "test", False),
        ("fake", "fake", "local", "local", False),
        ("fake", "titan", "production", "test", True),  # FERMATA_ENV genügt
        ("bedrock", "fake", None, "production", True),  # Datenbank genügt
        ("fake", "fake", None, None, True),  # Umgebung unbekannt: auf Nummer sicher
        ("bedrock", "titan", "production", "production", False),
        ("bedrock-mantle", "none", None, "production", False),  # „none“ (nur Regeln) bleibt erlaubt
        ("none", "none", "production", "production", False),
    ],
)
def test_production_problems(llm, emb, env, db_env, blocked):
    assert bool(production_problems(llm, emb, env, db_env)) is blocked


def test_message_names_the_variable():
    with pytest.raises(ProductionGuardError) as e:
        ensure_production_safe("fake", "fake", "production", "production")
    text = str(e.value)
    assert "FERMATA_LLM_BACKEND=fake" in text and "FERMATA_EMBEDDING_BACKEND=fake" in text


def test_runtime_config_reads_fermata_env():
    assert RuntimeConfig.from_env({"FERMATA_ENV": "Production"}).env == "production"
    assert RuntimeConfig.from_env({}).env is None
    # Der Standard bleibt fake (Entwicklung) – geschützt wird über die Umgebung.
    assert RuntimeConfig.from_env({}).llm_backend == "fake"


def test_runner_refuses_fakes_when_env_is_production(db):
    runner = Runner(db, RunOptions(llm=FakeLLM(), embedder=FakeEmbedder(), env="production"))
    with pytest.raises(ProductionGuardError):
        runner.run(next_due=True)


def test_runner_refuses_fake_instances_even_if_named_otherwise(db):
    """Der Name des Backends schützt nicht: entscheidend ist, was wirklich rechnet."""
    # Nur in der Transaktion des Tests (wird zurückgerollt); production lässt sich sonst nur als Superuser verlassen.
    db.execute("update ops.deployment set environment = 'production'")
    runner = Runner(
        db, RunOptions(llm=FakeLLM(), embedder=None, llm_backend_name="bedrock", embedding_backend_name="none")
    )
    with pytest.raises(ProductionGuardError):
        runner.run(next_due=True)
    assert db.execute("select count(*) from app.match_runs where status = 'running'").fetchone()[0] == 0


def test_database_production_blocks_as_matcher_role(db):
    db.execute("update ops.deployment set environment = 'production'")
    act_as_matcher(db)
    try:
        runner = Runner(db, RunOptions(llm=FakeLLM(), embedder=FakeEmbedder()))
        with pytest.raises(ProductionGuardError, match="Datenbank meldet production"):
            runner.run(next_due=True)
    finally:
        reset_role(db)


def test_database_test_env_allows_fakes_as_matcher_role(db):
    act_as_matcher(db)
    try:
        Runner(db, RunOptions(llm=FakeLLM(), embedder=FakeEmbedder())).ensure_production_safe()
    finally:
        reset_role(db)


def test_cli_exits_before_any_work(monkeypatch, capsys):
    class FakeConn:
        def execute(self, *_a, **_k):  # pragma: no cover - darf nicht aufgerufen werden
            raise AssertionError("Lauf hätte gar nicht beginnen dürfen")

    monkeypatch.setenv("FERMATA_ENV", "production")
    monkeypatch.setenv("FERMATA_LLM_BACKEND", "fake")
    monkeypatch.setenv("FERMATA_EMBEDDING_BACKEND", "titan")
    monkeypatch.setattr(cli, "connect", lambda *_a, **_k: FakeConn())
    monkeypatch.setattr(cli, "environment_or_none", lambda _c: "production")
    rc = cli.main(["run", "--next"])
    assert rc == 3
    assert "FERMATA_LLM_BACKEND=fake ist in Produktion verboten" in capsys.readouterr().err
