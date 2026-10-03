"""Datenbank: Art.-9-Prüffunktionen (alle Orientierungs-Kombinationen), Rollenrechte, gemeinsame Fenster,
k-Anonymität, Aufbewahrung, Zeitplan."""

from __future__ import annotations

import itertools
import json
import random
from datetime import timedelta

import psycopg
import pytest

from fermata_matcher.availability import shared_windows

from conftest import act_as_matcher, local, reset_role

pytestmark = pytest.mark.db

GENDERS = ("frau", "mann", "nichtbinaer")
SEEKING = [tuple(c) for r in (1, 2, 3) for c in itertools.combinations(GENDERS, r)]


def test_all_orientation_combinations(db, seeder):
    people = []
    for g in GENDERS:
        for s in SEEKING:
            people.append((seeder.user(None, gender=g, seeking=s), g, s))
    pairs = list(itertools.combinations(people, 2))
    a = [p[0][0] for p in pairs]
    b = [p[1][0] for p in pairs]
    expected = {(x[0], y[0]): (y[1] in x[2]) and (x[1] in y[2]) for x, y in pairs}

    act_as_matcher(db)
    single = {
        (x, y): ok
        for x, y, ok in db.execute(
            "select x.a::text, x.b::text, sensitive.gender_compatible(x.a, x.b) from unnest(%s::uuid[], %s::uuid[]) as x (a, b)",
            (a, b),
        )
    }
    batch = {
        (x, y): ok
        for x, y, ok in db.execute(
            "select user_a::text, user_b::text, compatible from sensitive.gender_compatible_pairs(%s::uuid[], %s::uuid[])",
            (a, b),
        )
    }
    reset_role(db)
    assert len(expected) == 210
    assert single == expected
    assert batch == expected
    # Beispiele: gleichgeschlechtlich, nichtbinär, einseitig
    by = {(g, s): uid for uid, g, s in people}
    fm, mf = by[("frau", ("mann",))], by[("mann", ("frau",))]
    ff = by[("frau", ("frau",))]
    nb_all = by[("nichtbinaer", ("frau", "mann", "nichtbinaer"))]
    f_nb = by[("frau", ("nichtbinaer",))]
    assert expected[tuple(sorted((fm, mf), key=lambda u: [p[0] for p in people].index(u)))]
    assert expected.get((ff, by[("frau", ("frau", "mann"))])) is True
    pair = (nb_all, f_nb) if (nb_all, f_nb) in expected else (f_nb, nb_all)
    assert expected[pair] is True


def test_missing_identity_is_incompatible(db, seeder):
    with_identity = seeder.user(None)
    without = seeder.user(None)
    db.execute("delete from sensitive.profile_identity where user_id = %s", (without,))
    act_as_matcher(db)
    row = db.execute(
        "select compatible from sensitive.gender_compatible_pairs(%s::uuid[], %s::uuid[])", ([with_identity], [without])
    ).fetchone()
    assert row[0] is False
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        db.execute("select * from sensitive.gender_compatible_pairs(%s::uuid[], %s::uuid[])", ([with_identity], []))


def test_religion_combinations(db, seeder):
    variants = [
        None,
        ("christlich", False),
        ("christlich", True),
        ("Christlich ", True),
        ("muslimisch", True),
        ("muslimisch", False),
        ("", True),
    ]
    users = []
    for v in variants:
        uid = seeder.user(None, religion=None if v is None else (v[0] or None, v[1]))
        users.append((uid, v))
    pairs = list(itertools.combinations(users, 2))
    a = [x[0] for x, _ in pairs]
    b = [y[0] for _, y in pairs]
    act_as_matcher(db)
    single = dict(
        ((x, y), ok)
        for x, y, ok in db.execute(
            "select x.a::text, x.b::text, sensitive.religion_compatible(x.a, x.b) from unnest(%s::uuid[], %s::uuid[]) as x (a, b)",
            (a, b),
        )
    )
    batch = dict(
        ((x, y), ok)
        for x, y, ok in db.execute(
            "select user_a::text, user_b::text, compatible from sensitive.religion_compatible_pairs(%s::uuid[], %s::uuid[])",
            (a, b),
        )
    )
    reset_role(db)
    assert single == batch
    lookup = {v: uid for uid, v in users}

    def ok(v1, v2):
        k = (lookup[v1], lookup[v2])
        return single.get(k, single.get((k[1], k[0])))

    assert ok(None, ("christlich", False)) is True  # niemand verlangt Gleichheit
    assert ok(("christlich", True), ("Christlich ", True)) is True  # Groß-/Kleinschreibung, Leerzeichen
    assert ok(("christlich", True), ("muslimisch", False)) is False
    assert ok(None, ("muslimisch", True)) is False


def test_check_functions_are_not_for_members(db, seeder):
    uid = seeder.user(None)
    db.execute(
        "select set_config('request.jwt.claims', %s, true)", (json.dumps({"sub": uid, "role": "authenticated"}),)
    )
    db.execute("set role authenticated")
    for fn in ("sensitive.gender_compatible_pairs", "sensitive.religion_compatible_pairs"):
        with pytest.raises(psycopg.errors.InsufficientPrivilege), db.transaction():
            db.execute(f"select * from {fn}(%s::uuid[], %s::uuid[])", ([uid], [uid]))
    with pytest.raises(psycopg.errors.InsufficientPrivilege), db.transaction():
        db.execute("select sensitive.match_run_fairness(gen_random_uuid())")
    reset_role(db)


@pytest.mark.parametrize(
    "table",
    [
        "private.account_facts",
        "sensitive.profile_identity",
        "sensitive.profile_sensitive",
        "safety.reports",
        "safety.sanctions",
        "safety.blocklist",
        "billing.evening_ledger",
        "billing.memberships",
        "app.evenings",
        "app.interview_transcripts",
        "app.feedback",
        "ops.app_settings",
        "ops.audit_log",
        "app.contact_shares",
    ],
)
def test_matcher_role_cannot_read_private_tables(db, table):
    act_as_matcher(db)
    with pytest.raises(psycopg.errors.InsufficientPrivilege), db.transaction():
        db.execute(f"select 1 from {table} limit 1")
    reset_role(db)


def test_matcher_role_cannot_decrypt_or_write_outside_its_tables(db, seeder):
    uid = seeder.user(None)
    act_as_matcher(db)
    with pytest.raises(psycopg.errors.InsufficientPrivilege), db.transaction():
        db.execute("select sensitive.dec(gender_enc) from sensitive.profile_identity")
    with pytest.raises(psycopg.errors.InsufficientPrivilege), db.transaction():
        db.execute("select sensitive.key()")
    with pytest.raises(psycopg.errors.InsufficientPrivilege), db.transaction():
        db.execute("update app.profile_core set ready_for_matching = false where user_id = %s", (uid,))
    with pytest.raises(psycopg.errors.InsufficientPrivilege), db.transaction():
        db.execute(
            "insert into app.evenings (pairing_id, user_a, user_b) values (gen_random_uuid(), %s, %s)", (uid, uid)
        )
    # erlaubt: Prüffunktionen, Einstellungen über ops.setting, eigene Tabellen
    assert float(db.execute("select ops.setting_num('matching.min_score')").fetchone()[0]) == pytest.approx(0.6)
    assert db.execute("select app.has_open_evening(%s)", (uid,)).fetchone()[0] is False
    assert db.execute("select billing.available_evenings(%s)", (uid,)).fetchone()[0] == 1
    reset_role(db)


def test_shared_windows_equivalent_to_db(db, seeder):
    period = seeder.period()
    rnd = random.Random(3)
    for _ in range(15):
        wins = []
        for _who in range(2):
            w = []
            for _ in range(rnd.randint(0, 4)):
                k = rnd.randint(0, 4)
                h0 = rnd.randint(10, 20)
                m0 = rnd.choice([0, 15, 30, 45])
                dur = rnd.randint(1, 7)
                s = local(seeder.day(k), h0, m0)
                w.append((s, s + timedelta(hours=dur)))
            wins.append(w)
        a = seeder.user(period, windows=[])
        b = seeder.user(period, windows=[])
        for uid, w in ((a, wins[0]), (b, wins[1])):
            for s, e in w:
                db.execute(
                    "insert into app.availability_windows (user_id, period_id, starts_at, ends_at) values (%s, %s, %s, %s)",
                    (uid, period, s, e),
                )
        for minutes in (60, 120, 180):
            db_rows = [
                (int(s.timestamp()), int(e.timestamp()))
                for s, e in db.execute("select * from app.shared_windows(%s, %s, %s, %s)", (a, b, period, minutes))
            ]
            py = shared_windows(
                [(int(s.timestamp()), int(e.timestamp())) for s, e in wins[0]],
                [(int(s.timestamp()), int(e.timestamp())) for s, e in wins[1]],
                minutes * 60,
            )
            assert db_rows == py


def k_anon(db, groups, k=5):
    return db.execute("select ops.k_anonymous_groups(%s::jsonb, %s)", (json.dumps(groups), k)).fetchone()[0]


def test_k_anonymity_primary_and_secondary_suppression(db):
    out = k_anon(
        db,
        [
            {"gruppe": "a", "im_pool": 3, "vorgeschlagen": 1},
            {"gruppe": "b", "im_pool": 40, "vorgeschlagen": 20},
            {"gruppe": "c", "im_pool": 50, "vorgeschlagen": 30},
        ],
    )
    names = [g["gruppe"] for g in out["gruppen"]]
    assert names == ["c"]  # a < 5, b mit unterdrückt, sonst wäre a = Gesamt − b − c rückrechenbar
    assert out["unterdrueckt"] == {"anzahl_gruppen": 2, "im_pool": 43, "hinweis": out["unterdrueckt"]["hinweis"]}
    assert out["gruppen"][0]["vorgeschlagen"] == 30 and out["gruppen"][0]["anteil"] == 0.6

    out = k_anon(
        db,
        [
            {"gruppe": "a", "im_pool": 2, "vorgeschlagen": 0},
            {"gruppe": "b", "im_pool": 3, "vorgeschlagen": 1},
            {"gruppe": "c", "im_pool": 50, "vorgeschlagen": 3},
        ],
    )
    assert [g["gruppe"] for g in out["gruppen"]] == ["c"]
    assert out["unterdrueckt"]["im_pool"] == 5
    assert out["gruppen"][0]["vorgeschlagen"] is None and out["gruppen"][0]["hinweis"]  # 3 Vorschläge < k

    out = k_anon(
        db,
        [
            {"gruppe": "a", "im_pool": 1, "vorgeschlagen": 0},
            {"gruppe": "b", "im_pool": 2, "vorgeschlagen": 1},
            {"gruppe": "c", "im_pool": 9, "vorgeschlagen": 6},
        ],
    )
    assert out["gruppen"] == []  # unterdrückte Summe 3 < 5 → auch c ausblenden
    for g in k_anon(db, [{"gruppe": "x", "im_pool": 30, "vorgeschlagen": 27}])["gruppen"]:
        assert g["vorgeschlagen"] is None  # nur 3 ohne Vorschlag < k
    assert k_anon(db, [], 5)["gruppen"] == []
    assert k_anon(db, [{"gruppe": "a", "im_pool": 3, "vorgeschlagen": 0}], 2)["k"] == 5  # k mindestens 5


def test_fairness_function_reports_only_aggregates(db, seeder):
    period = seeder.period()
    run = db.execute(
        "insert into app.match_runs (period_id, scheduled_for, started_at, status) values (%s, now(), now(), 'review') returning id",
        (period,),
    ).fetchone()[0]
    for k in range(14):
        uid = seeder.user(period, gender="frau" if k < 8 else ("mann" if k < 13 else "nichtbinaer"))
        db.execute(
            "insert into app.match_run_members (run_id, user_id, outcome) values (%s, %s, %s)",
            (run, uid, "matched" if k % 2 == 0 else "unmatched"),
        )
    act_as_matcher(db)
    report = db.execute("select sensitive.match_run_fairness(%s)", (run,)).fetchone()[0]
    reset_role(db)
    assert report["im_pool"] == 14
    gender = report["nach_geschlecht"]
    assert [g["gruppe"] for g in gender["gruppen"]] == ["frau"]  # mann (5) mit nichtbinaer (1) unterdrückt
    assert gender["unterdrueckt"]["anzahl_gruppen"] == 2 and gender["unterdrueckt"]["im_pool"] == 6
    text = json.dumps(report)
    assert "user" not in text and "@" not in text


def test_purge_old_scores(db, seeder):
    period = seeder.period()
    u1, u2 = seeder.user(period), seeder.user(period)
    a, b = sorted([u1, u2])
    old = db.execute(
        """insert into app.match_runs (period_id, scheduled_for, started_at, finished_at, status)
                        values (%s, now() - interval '14 months', now() - interval '14 months', now() - interval '13 months', 'approved')
                        returning id""",
        (period,),
    ).fetchone()[0]
    new = db.execute(
        """insert into app.match_runs (period_id, scheduled_for, started_at, finished_at, status)
                        values (%s, now(), now(), now(), 'review') returning id""",
        (period,),
    ).fetchone()[0]
    for run in (old, new):
        db.execute(
            "insert into app.pair_candidates (run_id, user_a, user_b, rule_score, subscores) values (%s, %s, %s, 0.7, '{\"werte\": 0.7}')",
            (run, a, b),
        )
        db.execute("insert into app.match_run_members (run_id, user_id) values (%s, %s)", (run, a))
    out = db.execute("select ops.purge_match_scores()").fetchone()[0]
    assert out["pair_candidates"] == 1 and out["match_run_members"] == 1
    assert db.execute("select count(*) from app.pair_candidates where run_id = %s", (new,)).fetchone()[0] == 1
    assert db.execute("select count(*) from app.match_runs where id = %s", (old,)).fetchone()[0] == 1  # Bericht bleibt


def test_schedule_due_runs_once_per_period(db, seeder):
    due = seeder.period(start_offset=100)
    open_period = seeder.period(start_offset=120, answered=False)
    n = db.execute("select app.schedule_due_match_runs()").fetchone()[0]
    assert n >= 1
    rows = db.execute(
        "select period_id::text, status from app.match_runs where period_id in (%s, %s)", (due, open_period)
    ).fetchall()
    assert rows == [(due, "scheduled")]
    assert db.execute("select app.schedule_due_match_runs()").fetchone()[0] == 0


def test_age_band(db):
    rows = db.execute(
        """select app.age_band(y, date '2026-10-03') from unnest(array[2008, 2001, 1992, 1982, 1972, 1962, 1950]) y"""
    ).fetchall()
    assert [r[0] for r in rows] == ["18–24", "25–34", "25–34", "35–44", "45–54", "55–64", "65+"]
    assert db.execute("select app.age_band(null)").fetchone()[0] == "unbekannt"
