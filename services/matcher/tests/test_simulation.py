"""Simulation: kleiner End-to-End-Lauf (immer) und Lasttest mit 5.000 Profilen (nur mit FERMATA_LOADTEST=1)."""

from __future__ import annotations

import json
import os

import psycopg
import pytest

from fermata_matcher.simulate import SIM_DOMAIN, generate_people, reset_simulation, simulate

from conftest import DB_URL, db_problem

pytestmark = pytest.mark.db


@pytest.fixture
def sim_db():
    problem = db_problem()
    if problem:
        pytest.skip(problem)
    yield DB_URL
    with psycopg.connect(DB_URL, autocommit=True) as c:
        reset_simulation(c)


def test_generator_is_realistic_and_deterministic():
    from datetime import UTC, date, datetime

    people = generate_people(400, 7, datetime(2026, 10, 3, tzinfo=UTC), date(2026, 10, 10), 14)
    again = generate_people(400, 7, datetime(2026, 10, 3, tzinfo=UTC), date(2026, 10, 10), 14)
    assert [p.id for p in people] == [p.id for p in again]
    assert all(25 <= p.age <= 65 for p in people)
    assert all(p.email.endswith("@" + SIM_DOMAIN) for p in people)
    genders = {p.gender for p in people}
    assert genders == {"frau", "mann", "nichtbinaer"}
    assert any(p.gender in p.seeking for p in people)  # gleichgeschlechtlich
    assert any(len(p.seeking) > 1 for p in people)
    assert all(p.plz[:2] in ("18", "19", "20", "21", "22", "23") for p in people)
    assert any(p.dealbreakers for p in people) and any(p.flags for p in people)
    assert all(p.windows for p in people)


def test_small_simulation_end_to_end(sim_db):
    result = simulate(sim_db, profiles=80, seed=11, approve=True, log=lambda *a: None)
    run = result.runs[0]
    assert run.status == "review"
    rep = run.report
    assert rep["pool"]["konten"] == 80 and rep["pool"]["im_pool"] < 80
    assert rep["ergebnis"]["vorschlaege"] >= 1
    approval = result.approvals[0]
    assert approval["abende"] == approval["freigegeben"] >= 1
    assert approval["abschluss"]["status"] in ("approved", "partially_approved")
    json.dumps(rep, default=str)


@pytest.mark.slow
@pytest.mark.skipif(os.environ.get("FERMATA_LOADTEST") != "1", reason="Lasttest nur mit FERMATA_LOADTEST=1")
def test_load_5000(sim_db):
    result = simulate(sim_db, profiles=5000, seed=5000, log=print)
    rep = result.runs[0].report
    print(
        json.dumps(
            {
                "seed_s": result.seed_seconds,
                "laufzeit": rep["laufzeit_sekunden"],
                "zuordnung": rep["zuordnung"],
                "ergebnis": rep["ergebnis"],
                "filter": rep["filter"],
                "llm": rep["llm"],
            },
            ensure_ascii=False,
            indent=1,
        )
    )
    assert rep["ergebnis"]["vorschlaege"] > 1000
