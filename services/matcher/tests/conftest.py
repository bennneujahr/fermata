"""Gemeinsame Hilfen für die Tests.

DB-Tests laufen gegen die Test-Datenbank (scripts/db.sh, Standard-Port 54362) und jeweils in einer Transaktion, die
am Ende zurückgerollt wird. Ist die Datenbank nicht erreichbar, werden sie übersprungen.
"""

from __future__ import annotations

import json
import os
import uuid
from collections.abc import Iterator
from datetime import date, datetime, timedelta
from typing import Any

import psycopg
import pytest

from fermata_matcher.availability import BERLIN
from fermata_matcher.config import MatchSettings
from fermata_matcher.models import Person, Venue

DB_URL = os.environ.get(
    "FERMATA_TEST_DB_URL",
    f"postgresql://postgres:{os.environ.get('DB_PASSWORD', 'postgres')}@localhost:{os.environ.get('DB_PORT', '54362')}/postgres",
)


def _db_available() -> str | None:
    try:
        with psycopg.connect(DB_URL, connect_timeout=3) as c:
            env = c.execute("select ops.environment()").fetchone()[0]
            if env not in ("test", "local", "ci"):
                return f"Datenbank ist nicht in der Testumgebung ({env})"
            if not c.execute("select to_regclass('app.match_run_members')").fetchone()[0]:
                return "Migration 20261003000410_matcher.sql fehlt"
    except psycopg.Error as e:
        return f"Test-Datenbank nicht erreichbar: {e}"
    return None


_DB_PROBLEM: str | bool | None = False


def db_problem() -> str | None:
    global _DB_PROBLEM
    if _DB_PROBLEM is False:
        _DB_PROBLEM = _db_available()
    return _DB_PROBLEM  # type: ignore[return-value]


@pytest.fixture
def db() -> Iterator[psycopg.Connection]:
    """Verbindung als postgres in einer Transaktion, die am Ende zurückgerollt wird."""
    problem = db_problem()
    if problem:
        pytest.skip(problem)
    conn = psycopg.connect(DB_URL, autocommit=True)
    try:
        with conn.transaction(force_rollback=True):
            yield conn
    finally:
        conn.close()


@pytest.fixture
def settings() -> MatchSettings:
    return MatchSettings()


# ---------------------------------------------------------------------------- Personen ohne Datenbank
SCHWERIN = (53.628, 11.411)
WISMAR = (53.893, 11.465)
HAMBURG = (53.551, 10.000)


def local(d: date, hour: int, minute: int = 0) -> datetime:
    return datetime(d.year, d.month, d.day, hour, minute, tzinfo=BERLIN)


def ts(d: date, hour: int, minute: int = 0) -> int:
    return int(local(d, hour, minute).timestamp())


PERIOD_START = date(2030, 3, 4)  # ein Montag


def make_person(uid: str | None = None, **kw: Any) -> Person:
    d = PERIOD_START
    base: dict[str, Any] = {
        "user_id": uid or str(uuid.uuid4()),
        "address_form": "sie",
        "display_name": "Anna",
        "birth_year": 1990,
        "age": 40,
        "summary_text": "Sie wandern gern und kochen mit Freunden.",
        "personality": {"offenheit": 0.7, "extraversion": 0.5, "vertraeglichkeit": 0.8},
        "values_profile": {"werte": {"familie": 0.8, "natur": 0.9}, "gegenueber": {"extraversion": 0.5}},
        "life": {"lebensstil": {"aktiv": 0.7}, "interessen": ["Wandern", "Kochen"], "arbeitszeiten": "tagsueber"},
        "age_min": 30,
        "age_max": 50,
        "smoking": "nein",
        "has_children": False,
        "wants_children": "offen",
        "lat": SCHWERIN[0],
        "lon": SCHWERIN[1],
        "windows": [(ts(d, 18), ts(d, 23)), (ts(d + timedelta(days=2), 18), ts(d + timedelta(days=2), 23))],
    }
    base.update(kw)
    return Person(**base)


def make_venue(
    name: str = "Café", lat: float = SCHWERIN[0], lon: float = SCHWERIN[1], slots: list[tuple[int, int]] | None = None
) -> Venue:
    d = PERIOD_START
    raw = slots or [(ts(d, 19), 2), (ts(d + timedelta(days=2), 19), 2)]
    return Venue(str(uuid.uuid4()), name, "Schwerin", lat, lon, [(s, str(uuid.uuid4()), t) for s, t in raw])


# ---------------------------------------------------------------------------- Datenbank-Seeder
class Seeder:
    """Legt vollständige, poolfähige Personen und Lokale an (als postgres, in der Test-Transaktion)."""

    def __init__(self, conn: psycopg.Connection):
        self.conn = conn
        now = conn.execute("select app.now()").fetchone()[0]
        self.now = now
        self.start = now.astimezone(BERLIN).date() + timedelta(days=40)

    def day(self, k: int) -> date:
        return self.start + timedelta(days=k)

    def period(self, start_offset: int = 0, days: int = 14, answered: bool = True) -> str:
        s = self.day(start_offset)
        return self.conn.execute(
            """insert into app.availability_periods (starts_on, ends_on, ask_at, answer_until)
               values (%s, %s, %s, %s) returning id::text""",
            (
                s,
                s + timedelta(days=days - 1),
                self.now - timedelta(days=7),
                self.now - timedelta(hours=1) if answered else self.now + timedelta(days=1),
            ),
        ).fetchone()[0]

    def venue(
        self,
        name: str = "Testlokal",
        lat: float = SCHWERIN[0],
        lon: float = SCHWERIN[1],
        days: tuple[int, ...] = (0, 1, 2, 3),
        hours: tuple[int, ...] = (19,),
        tables: int = 3,
        active: bool = True,
    ) -> str:
        vid = self.conn.execute(
            """insert into app.venues (name, street, postal_code, city, lat, lon, active)
               values (%s, 'Teststraße 1', '19053', 'Schwerin', %s, %s, %s) returning id::text""",
            (name, lat, lon, active),
        ).fetchone()[0]
        for k in days:
            for h in hours:
                self.conn.execute(
                    "insert into app.venue_slots (venue_id, starts_at, tables) values (%s, %s, %s)",
                    (vid, local(self.day(k), h), tables),
                )
        return vid

    def user(
        self,
        period_id: str | None,
        *,
        gender: str = "frau",
        seeking: tuple[str, ...] = ("mann",),
        name: str = "Anna",
        birth_year: int | None = None,
        lat: float = SCHWERIN[0],
        lon: float = SCHWERIN[1],
        address_form: str = "sie",
        windows: list[tuple[int, int, int]] | None = None,
        profile: dict[str, Any] | None = None,
        religion: tuple[str, bool] | None = None,
        consents: tuple[str, ...] = ("gespraech", "art9_profile"),
        verified: bool = True,
        evenings: int = 1,
        status: str = "active",
        confirmed: bool = True,
        ready: bool = True,
        geo: bool = True,
        dealbreakers: list[tuple[str, dict[str, Any], str | None]] | None = None,
        wants: list[tuple[str, str, int]] | None = None,
        uid: str | None = None,
    ) -> str:
        c = self.conn
        uid = uid or str(uuid.uuid4())
        year = self.now.astimezone(BERLIN).year
        by = birth_year if birth_year is not None else year - 40
        c.execute(
            """insert into auth.users (id, email, aud, role, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
               values (%s, %s, 'authenticated', 'authenticated', now(), now(), '{}', '{}')""",
            (uid, f"{uid[:8]}@pytest.fermata.test"),
        )
        c.execute(
            "insert into app.accounts (user_id, status, address_form) values (%s, %s, %s)", (uid, status, address_form)
        )
        if verified:
            c.execute(
                """insert into app.verifications (user_id, status, is_adult, birth_year, name_match, birth_date_match)
                   values (%s, 'approved', true, %s, true, true)""",
                (uid, by),
            )
        for kind in consents:
            c.execute(
                "insert into app.consents (user_id, kind, action, document_version) values (%s, %s, 'granted', 'v1')",
                (uid, kind),
            )
        c.execute(
            "insert into sensitive.profile_identity (user_id, gender_enc, seeking_genders_enc) values (%s, sensitive.enc(%s), sensitive.enc(%s))",
            (uid, gender, ",".join(seeking)),
        )
        if religion is not None:
            c.execute(
                """insert into sensitive.profile_sensitive (user_id, religion_enc, religion_must_match)
                   values (%s, sensitive.enc(%s), %s)""",
                (uid, religion[0], religion[1]),
            )
        prof: dict[str, Any] = {
            "personality": {"offenheit": 0.7, "extraversion": 0.5, "vertraeglichkeit": 0.8, "humor": 0.7},
            "values_profile": {
                "werte": {"familie": 0.8, "natur": 0.9, "ehrlichkeit": 0.9},
                "gegenueber": {"vertraeglichkeit": 0.8},
            },
            "life": {
                "lebensstil": {"aktiv": 0.7, "ruhig": 0.5},
                "interessen": ["Wandern", "Kochen", "Jazz"],
                "arbeitszeiten": "tagsueber",
            },
            "age_min": None,
            "age_max": None,
            "travel_max_km": None,
            "smoking": "nein",
            "has_children": False,
            "wants_children": "offen",
            "summary": f"{name}, Sie wandern gern und kochen mit Freunden. Ehrlichkeit ist Ihnen wichtig.",
        }
        prof.update(profile or {})
        c.execute(
            """insert into app.profile_core (user_id, display_name, birth_year, summary_text, summary_version, summary_confirmed_at,
                 personality, values_profile, life_circumstances, age_min, age_max, travel_max_km, smoking, has_children,
                 wants_children, ready_for_matching)
               values (%s, %s, %s, %s, 1, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s, %s, %s, %s, %s, %s)""",
            (
                uid,
                name,
                by,
                prof["summary"],
                self.now if confirmed else None,
                json.dumps(prof["personality"]),
                json.dumps(prof["values_profile"]),
                json.dumps(prof["life"]),
                prof["age_min"],
                prof["age_max"],
                prof["travel_max_km"],
                prof["smoking"],
                prof["has_children"],
                prof["wants_children"],
                ready,
            ),
        )
        if geo:
            c.execute(
                "insert into app.geo (user_id, postal_code, lat, lon) values (%s, '19053', %s, %s)", (uid, lat, lon)
            )
        if period_id:
            for k, h0, h1 in windows if windows is not None else [(0, 18, 23), (2, 18, 23)]:
                c.execute(
                    "insert into app.availability_windows (user_id, period_id, starts_at, ends_at) values (%s, %s, %s, %s)",
                    (uid, period_id, local(self.day(k), h0), local(self.day(k), h1)),
                )
        if evenings:
            c.execute(
                "insert into billing.evening_ledger (user_id, kind, amount) values (%s, 'free_grant', %s)",
                (uid, evenings),
            )
        for kind, value, text in dealbreakers or []:
            c.execute(
                "insert into app.dealbreakers (user_id, kind, value, text) values (%s, %s, %s::jsonb, %s)",
                (uid, kind, json.dumps(value), text),
            )
        for cat, text, imp in wants or []:
            c.execute(
                "insert into app.wants (user_id, category, text, importance) values (%s, %s, %s, %s)",
                (uid, cat, text, imp),
            )
        return uid


@pytest.fixture
def seeder(db: psycopg.Connection) -> Seeder:
    return Seeder(db)


def act_as_matcher(conn: psycopg.Connection) -> None:
    conn.execute("set role fermata_matcher")


def reset_role(conn: psycopg.Connection) -> None:
    conn.execute("reset role")


def act_as_admin(conn: psycopg.Connection, aal: str = "aal2") -> str:
    uid = str(uuid.uuid4())
    conn.execute(
        """insert into auth.users (id, email, aud, role, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
           values (%s, %s, 'authenticated', 'authenticated', now(), now(), '{}', '{}')""",
        (uid, f"admin-{uid[:8]}@pytest.fermata.test"),
    )
    conn.execute("insert into app.admin_users (user_id, display_name) values (%s, 'Benn (Test)')", (uid,))
    conn.execute(
        "select set_config('request.jwt.claims', %s, true)",
        (json.dumps({"sub": uid, "role": "authenticated", "aal": aal}),),
    )
    conn.execute("set role authenticated")
    return uid
