"""Ein ganzer Lauf in der Test-Datenbank mit den Rechten von fermata_matcher (Attrappen für LLM und Embeddings)."""

from __future__ import annotations

import json

import psycopg
import pytest

from fermata_matcher.art9 import check_reasons
from fermata_matcher.embeddings import FakeEmbedder
from fermata_matcher.llm.client import FakeLLM
from fermata_matcher.pool import eligible_user_ids
from fermata_matcher.runner import RunError, Runner, RunOptions

from conftest import SCHWERIN, act_as_matcher, reset_role

pytestmark = pytest.mark.db


def scenario(seeder):
    period = seeder.period()
    seeder.venue("Testlokal Mitte")
    users = {
        "anna": seeder.user(period, gender="frau", seeking=("mann",), name="Anna"),
        "ben": seeder.user(period, gender="mann", seeking=("frau",), name="Ben", address_form="du"),
        "cem": seeder.user(period, gender="mann", seeking=("mann",), name="Cem"),
        "dirk": seeder.user(period, gender="mann", seeking=("mann",), name="Dirk"),
        "eva": seeder.user(period, gender="frau", seeking=("frau",), name="Eva"),  # niemand passt
        "kim": seeder.user(
            period, gender="nichtbinaer", seeking=("frau", "nichtbinaer"), name="Kim", windows=[(5, 18, 23)]
        ),  # keine gemeinsame Zeit mit Eva
    }
    return period, users


def runner(db, llm=None, **kw):
    return Runner(db, RunOptions(llm=llm or FakeLLM(), embedder=FakeEmbedder(), **kw))


def pairings(db, run_id):
    return db.execute(
        """select user_a::text, user_b::text, status, venue_id, venue_reason, reasons_text, review_notes, total_score
           from app.pairings where run_id = %s order by total_score desc""",
        (run_id,),
    ).fetchall()


def test_full_run_as_matcher(db, seeder):
    period, u = scenario(seeder)
    act_as_matcher(db)
    assert db.execute("select current_user").fetchone()[0] == "fermata_matcher"
    out = runner(db).run(period_id=period)
    reset_role(db)

    run = db.execute(
        "select status, pool_size, candidate_pairs, proposed_pairs, cost_eur, report from app.match_runs where id = %s",
        (out.run_id,),
    ).fetchone()
    assert run[0] == "review" and run[1] == 6 and run[3] == 2
    rows = pairings(db, out.run_id)
    got = {frozenset((a, b)) for a, b, *_ in rows}
    assert got == {frozenset((u["anna"], u["ben"])), frozenset((u["cem"], u["dirk"]))}
    for _a, _b, status, venue, vreason, reasons, notes, total in rows:
        assert status == "pending_review" and venue is not None and "Testlokal Mitte" in vreason
        assert check_reasons(reasons, ["Anna", "Ben", "Cem", "Dirk"]).ok
        assert {"agent", "art9_filter", "hinweise", "ersatztext_verwendet", "version"} <= set(notes)
        assert 0.6 <= float(total) <= 1.2
    # gemischte Anrede (Anna: Sie, Ben: du) → Text ohne direkte Anrede
    mixed = next(r for r in rows if frozenset(r[:2]) == frozenset((u["anna"], u["ben"])))
    assert mixed[5].startswith("Beide")

    members = dict(
        db.execute(
            "select user_id::text, coalesce(unmatched_reason, outcome) from app.match_run_members where run_id = %s",
            (out.run_id,),
        ).fetchall()
    )
    assert members[u["anna"]] == "matched" and members[u["eva"]] == "keine_kandidaten"
    assert members[u["kim"]] == "keine_kandidaten"

    rep = run[5]
    for key in (
        "pool",
        "filter",
        "vorauswahl",
        "scores",
        "zuordnung",
        "ergebnis",
        "llm",
        "pruefung",
        "fairness",
        "laufzeit_sekunden",
        "embeddings",
        "eingaben_bereinigt",
    ):
        assert key in rep, key
    assert rep["filter"]["verworfen"]["geschlecht"] >= 1
    assert rep["filter"]["verworfen"]["keine_gemeinsame_zeit"] >= 1
    assert rep["ergebnis"]["ohne_vorschlag"] == {"keine_kandidaten": 2}
    assert rep["llm"]["aufrufe_bewertung"] >= 2 and rep["llm"]["aufrufe_pruef_agent"] == 2
    assert rep["eingaben_bereinigt"]["namen_ersetzt"] >= 6  # Namen stehen in den Zusammenfassungen
    assert set(rep["laufzeit_sekunden"]) >= {"pool", "filter", "llm", "zuordnung_und_lokal", "gesamt"}
    assert float(run[4]) > 0  # geschätzte Kosten

    cand = db.execute(
        "select subscores, rule_score, llm_score, input_hash, selected from app.pair_candidates where run_id = %s",
        (out.run_id,),
    ).fetchall()
    assert len(cand) == run[2] and sum(1 for c in cand if c[4]) == 2
    assert all(
        {"werte", "wuensche", "lebensumstaende", "persoenlichkeit", "zeiten", "gewichte"} <= set(c[0]) for c in cand
    )
    assert all(c[3] and len(c[3]) == 64 for c in cand)
    emb = db.execute(
        "select count(*) from app.profile_embeddings where user_id = any(%s::uuid[])", (list(u.values()),)
    ).fetchone()[0]
    assert emb == 6


def test_llm_prompts_contain_no_art9_or_names(db, seeder):
    period, u = scenario(seeder)
    db.execute(
        "update app.profile_core set summary_text = summary_text || ' Ihr Glaube gibt Ihnen Halt.' where user_id = %s",
        (u["anna"],),
    )
    fake = FakeLLM()
    act_as_matcher(db)
    runner(db, llm=fake).run(period_id=period)
    reset_role(db)
    assert fake.requests
    for req in fake.requests:
        user = req["user"]
        for word in ("Anna", "Ben", "Cem", "Dirk", "Glaube", "frau", "mann", "nichtbinaer", "19053", "lat", "user_id"):
            assert word not in user, word
        assert req["effort"] == "low"


def test_same_result_with_single_checks(db, seeder):
    period, _ = scenario(seeder)
    act_as_matcher(db)
    out = runner(db, art9_check="single").run(period_id=period)
    reset_role(db)
    assert len(pairings(db, out.run_id)) == 2


def test_reuse_and_wait_bonus_in_second_run(db, seeder):
    period, u = scenario(seeder)
    act_as_matcher(db)
    first = runner(db).run(period_id=period)
    reset_role(db)
    # Benn verwirft den Lauf (nur für den Test: Paare löschen, Lauf abbrechen)
    db.execute("delete from app.pairings where run_id = %s", (first.run_id,))
    db.execute("update app.match_runs set status = 'cancelled' where id = %s", (first.run_id,))
    fake = FakeLLM()
    act_as_matcher(db)
    second = runner(db, llm=fake).run(period_id=period)
    reset_role(db)
    llm = second.report["llm"]
    assert llm["wiederverwendet"] == llm["bewertungen_angefragt"] > 0
    assert llm["aufrufe_bewertung"] == 0
    assert fake.calls == llm["aufrufe_pruef_agent"]  # nur noch der Prüf-Agent fragt
    waits = dict(
        db.execute(
            "select user_id::text, wait_rounds from app.match_run_members where run_id = %s", (second.run_id,)
        ).fetchall()
    )
    assert waits[u["eva"]] == 1 and waits[u["anna"]] == 1
    bonus = db.execute(
        "select max(wait_bonus) from app.pair_candidates where run_id = %s", (second.run_id,)
    ).fetchone()[0]
    assert float(bonus) == pytest.approx(0.02)


def test_changed_summary_is_evaluated_again(db, seeder):
    period, u = scenario(seeder)
    act_as_matcher(db)
    first = runner(db).run(period_id=period)
    reset_role(db)
    db.execute("delete from app.pairings where run_id = %s", (first.run_id,))
    db.execute("update app.match_runs set status = 'cancelled' where id = %s", (first.run_id,))
    db.execute(
        "update app.profile_core set summary_text = 'Sie segeln gern auf der Ostsee.' where user_id = %s", (u["anna"],)
    )
    act_as_matcher(db)
    second = runner(db).run(period_id=period)
    reset_role(db)
    assert second.report["llm"]["aufrufe_bewertung"] >= 1  # Paar mit Anna neu bewertet
    assert second.report["embeddings"]["neu_berechnet"] == 1


def test_previous_proposals_block_and_cooldown(db, seeder):
    period, u = scenario(seeder)
    a, b = sorted([u["anna"], u["ben"]])
    old_run = db.execute(
        "insert into app.match_runs (scheduled_for, status) values (now(), 'approved') returning id"
    ).fetchone()[0]
    db.execute(
        """insert into app.pairings (run_id, user_a, user_b, total_score, status, reviewed_at)
                  values (%s, %s, %s, 0.8, 'rejected', now())""",
        (old_run, a, b),
    )
    c, d = sorted([u["cem"], u["dirk"]])
    db.execute("insert into app.blocks (blocker, blocked) values (%s, %s)", (c, d))
    act_as_matcher(db)
    out = runner(db).run(period_id=period)
    reset_role(db)
    assert pairings(db, out.run_id) == []
    v = out.report["filter"]["verworfen"]
    assert v["kuerzlich_abgelehnt"] == 1 and v["blockiert"] == 1


def test_pool_exclusions(db, seeder):
    period = seeder.period()
    cases = {
        "nicht_aktiv": dict(status="paused"),
        "nicht_verifiziert": dict(verified=False),
        "einwilligung_gespraech": dict(consents=("art9_profile",)),
        "einwilligung_art9": dict(consents=("gespraech",)),
        "zusammenfassung_unbestaetigt": dict(confirmed=False),
        "nicht_bereit": dict(ready=False),
        "keine_plz": dict(geo=False),
        "keine_zeiten": dict(windows=[]),
        "kein_abend_frei": dict(evenings=0),
    }
    ids = {reason: seeder.user(period, **kw) for reason, kw in cases.items()}
    ok = seeder.user(period)
    suspended = seeder.user(period)
    db.execute(
        "insert into safety.sanctions (user_id, kind, reason) values (%s, 'vorlaeufige_sperre', 'Test')", (suspended,)
    )
    revoked = seeder.user(period)
    db.execute(
        "insert into app.consents (user_id, kind, action, document_version) values (%s, 'gespraech', 'revoked', 'v1')",
        (revoked,),
    )
    deleting = seeder.user(period)
    db.execute("update app.accounts set deletion_requested_at = now() where user_id = %s", (deleting,))
    open_ev = seeder.user(period)
    partner = seeder.user(period)
    x, y = sorted([open_ev, partner])
    run = db.execute(
        "insert into app.match_runs (scheduled_for, status) values (now(), 'approved') returning id"
    ).fetchone()[0]
    pid = db.execute(
        "insert into app.pairings (run_id, user_a, user_b, total_score, status) values (%s, %s, %s, 0.8, 'proposed') returning id",
        (run, x, y),
    ).fetchone()[0]
    db.execute(
        "insert into app.evenings (pairing_id, user_a, user_b, state) values (%s, %s, %s, 'proposed')", (pid, x, y)
    )
    pending = seeder.user(period)
    other = seeder.user(period)
    p, q = sorted([pending, other])
    run2 = db.execute(
        "insert into app.match_runs (scheduled_for, status) values (now(), 'review') returning id"
    ).fetchone()[0]
    db.execute("insert into app.pairings (run_id, user_a, user_b, total_score) values (%s, %s, %s, 0.8)", (run2, p, q))

    act_as_matcher(db)
    eligible, excluded, _ = eligible_user_ids(db, period)
    reset_role(db)
    mine = set(ids.values()) | {ok, suspended, revoked, deleting, open_ev, partner, pending, other}
    assert set(eligible) & mine == {ok}
    for reason in cases:
        assert excluded[reason] >= 1, reason
    assert excluded["gesperrt"] >= 1 and excluded["loeschung_beantragt"] >= 1
    assert excluded["offener_abend"] >= 2 and excluded["offener_vorschlag"] >= 2
    assert excluded["einwilligung_gespraech"] >= 2  # fehlend und widerrufen


def test_failed_run_is_recorded(db, seeder):
    period, _ = scenario(seeder)

    class Broken(FakeLLM):
        def complete_json(self, **kw):
            raise RuntimeError("Bedrock nicht erreichbar")

    act_as_matcher(db)
    with pytest.raises(RuntimeError):
        runner(db, llm=Broken()).run(period_id=period)
    reset_role(db)
    status, error, report = db.execute(
        "select status, error, report from app.match_runs where period_id = %s order by created_at desc limit 1",
        (period,),
    ).fetchone()
    assert status == "failed" and "Bedrock nicht erreichbar" in error
    assert report["fehler"]["art"] == "RuntimeError" and "pool" in report


def test_no_second_active_run_per_period_and_next(db, seeder):
    period, _ = scenario(seeder)
    act_as_matcher(db)
    runner(db).run(period_id=period)
    with pytest.raises(RunError):
        runner(db).run(period_id=period)
    reset_role(db)
    db.execute("update app.match_runs set status = 'cancelled' where status = 'scheduled'")  # nur in dieser Transaktion
    sched = db.execute(
        "insert into app.match_runs (period_id, scheduled_for, status) values (%s, now(), 'scheduled') returning id::text",
        (seeder.period(start_offset=60),),
    ).fetchone()[0]
    act_as_matcher(db)
    out = runner(db).run(next_due=True)
    reset_role(db)
    assert out.run_id == sched


def test_llm_disabled_uses_rules_and_template(db, seeder):
    period, _ = scenario(seeder)
    db.execute("update ops.app_settings set value = 'false' where key = 'matching.llm_enabled'")
    act_as_matcher(db)
    out = runner(db).run(period_id=period)
    reset_role(db)
    assert out.report["llm"]["aktiv"] is False and out.report["llm"]["aufrufe_bewertung"] == 0
    rows = pairings(db, out.run_id)
    assert len(rows) == 2 and all(r[6]["agent"] is None for r in rows)
    assert all(check_reasons(r[5]).ok for r in rows)


def test_venue_capacity_limits_pairs(db, seeder):
    period = seeder.period()
    seeder.venue("Ein Tisch", days=(0,), tables=1)
    women = [seeder.user(period, gender="frau", seeking=("mann",), windows=[(0, 18, 23)]) for _ in range(2)]
    men = [seeder.user(period, gender="mann", seeking=("frau",), windows=[(0, 18, 23)]) for _ in range(2)]
    act_as_matcher(db)
    out = runner(db).run(period_id=period)
    reset_role(db)
    assert len(pairings(db, out.run_id)) == 1
    reasons = [
        r
        for (r,) in db.execute(
            "select unmatched_reason from app.match_run_members where run_id = %s and outcome = 'unmatched'",
            (out.run_id,),
        )
    ]
    assert reasons == ["kein_lokal", "kein_lokal"]
    assert len(women + men) == 4


def test_member_cannot_see_scores_or_candidates(db, seeder):
    period, u = scenario(seeder)
    act_as_matcher(db)
    out = runner(db).run(period_id=period)
    reset_role(db)
    db.execute("update app.pairings set status = 'proposed' where run_id = %s", (out.run_id,))
    db.execute(
        "select set_config('request.jwt.claims', %s, true)", (json.dumps({"sub": u["anna"], "role": "authenticated"}),)
    )
    db.execute("set role authenticated")
    rows = db.execute("select id, user_a, user_b, venue_id, reasons_text, status from app.pairings").fetchall()
    assert len(rows) == 1 and rows[0][4]
    for sql in (
        "select total_score from app.pairings",
        "select review_notes from app.pairings",
        "select venue_reason from app.pairings",
        "select * from app.pairings",
        "select * from app.pair_candidates",
        "select * from app.match_runs",
        "select * from app.match_run_members",
    ):
        with pytest.raises(psycopg.errors.InsufficientPrivilege), db.transaction():
            db.execute(sql)
    reset_role(db)


def test_geo_uses_only_centroid(db, seeder):
    """Der Job kennt nur den PLZ-Mittelpunkt; private.account_facts liest er nie (Rechte-Test oben)."""
    period = seeder.period()
    uid = seeder.user(period, lat=SCHWERIN[0], lon=SCHWERIN[1])
    act_as_matcher(db)
    assert db.execute("select lat, lon from app.geo where user_id = %s", (uid,)).fetchone() == SCHWERIN
    reset_role(db)
