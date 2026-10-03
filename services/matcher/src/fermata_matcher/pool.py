"""Pool eines Laufs: wer kann in diesem Zeitraum einen Vorschlag bekommen?

Bedingungen (in dieser Reihenfolge gezählt, der erste nicht erfüllte Grund zählt):
 nicht_aktiv, loeschung_beantragt, nicht_verifiziert (app.is_verified), einwilligung_gespraech,
 einwilligung_art9 (app.has_consent), kein_profil, zusammenfassung_unbestaetigt (summary_confirmed_at),
 nicht_bereit (ready_for_matching), kein_geburtsjahr, gesperrt (safety.is_suspended), keine_plz (app.geo),
 keine_zeiten (keine Fenster im Zeitraum), kein_abend_frei (billing.available_evenings ≤ 0),
 offener_abend (app.has_open_evening), offener_vorschlag (Vorschlag aus einem anderen Lauf noch in Prüfung).
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime
from typing import Any

import psycopg

from .models import Dealbreaker, Person, Want

POOL_REASONS = (
    "nicht_aktiv",
    "loeschung_beantragt",
    "nicht_verifiziert",
    "einwilligung_gespraech",
    "einwilligung_art9",
    "kein_profil",
    "zusammenfassung_unbestaetigt",
    "nicht_bereit",
    "kein_geburtsjahr",
    "gesperrt",
    "keine_plz",
    "keine_zeiten",
    "kein_abend_frei",
    "offener_abend",
    "offener_vorschlag",
)

_ELIGIBILITY_SQL = """
select a.user_id::text, a.status, a.deletion_requested_at is not null,
       case when a.status = 'active' then app.is_verified(a.user_id) end,
       case when a.status = 'active' then app.has_consent(a.user_id, 'gespraech') end,
       case when a.status = 'active' then app.has_consent(a.user_id, 'art9_profile') end,
       pc.user_id is not null,
       pc.summary_confirmed_at is not null,
       coalesce(pc.ready_for_matching, false),
       pc.birth_year,
       case when a.status = 'active' then safety.is_suspended(a.user_id) end,
       g.user_id is not null,
       exists (select 1 from app.availability_windows w where w.user_id = a.user_id and w.period_id = %(period)s),
       case when a.status = 'active' then billing.available_evenings(a.user_id) end,
       case when a.status = 'active' then app.has_open_evening(a.user_id) end
from app.accounts a
left join app.profile_core pc on pc.user_id = a.user_id
left join app.geo g on g.user_id = a.user_id
order by a.user_id
"""


def _first_reason(row: tuple[Any, ...], open_proposals: set[str]) -> str | None:
    (
        uid,
        status,
        deletion,
        verified,
        c_g,
        c_a,
        has_profile,
        confirmed,
        ready,
        birth_year,
        suspended,
        has_geo,
        has_windows,
        evenings,
        open_evening,
    ) = row
    checks = (
        ("nicht_aktiv", status != "active"),
        ("loeschung_beantragt", deletion),
        ("nicht_verifiziert", not verified),
        ("einwilligung_gespraech", not c_g),
        ("einwilligung_art9", not c_a),
        ("kein_profil", not has_profile),
        ("zusammenfassung_unbestaetigt", not confirmed),
        ("nicht_bereit", not ready),
        ("kein_geburtsjahr", birth_year is None),
        ("gesperrt", suspended),
        ("keine_plz", not has_geo),
        ("keine_zeiten", not has_windows),
        ("kein_abend_frei", (evenings or 0) <= 0),
        ("offener_abend", open_evening),
        ("offener_vorschlag", uid in open_proposals),
    )
    for reason, failed in checks:
        if failed:
            return reason
    return None


def eligible_user_ids(
    conn: psycopg.Connection, period_id: str, exclude_run: str | None = None
) -> tuple[list[str], Counter, int]:
    open_rows = conn.execute(
        """select user_a::text, user_b::text from app.pairings
           where status in ('pending_review', 'approved') and (%(run)s::uuid is null or run_id <> %(run)s::uuid)""",
        {"run": exclude_run},
    ).fetchall()
    open_proposals = {u for row in open_rows for u in row}
    rows = conn.execute(_ELIGIBILITY_SQL, {"period": period_id}).fetchall()
    excluded: Counter = Counter()
    eligible: list[str] = []
    for row in rows:
        reason = _first_reason(row, open_proposals)
        if reason:
            excluded[reason] += 1
        else:
            eligible.append(row[0])
    return eligible, excluded, len(rows)


def _epoch(dt: datetime) -> int:
    return int(dt.timestamp())


def load_people(conn: psycopg.Connection, user_ids: list[str], period_id: str, run_year: int) -> list[Person]:
    """Lädt die Angaben aller Pool-Personen (nur Tabellen ohne Art.-9-Daten)."""
    if not user_ids:
        return []
    rows = conn.execute(
        """
        select a.user_id::text, a.address_form, pc.display_name, pc.birth_year, coalesce(pc.summary_text, ''),
               pc.summary_version, pc.personality, pc.values_profile, pc.life_circumstances, pc.age_min, pc.age_max,
               pc.travel_modes, pc.travel_max_minutes, pc.travel_max_km, pc.languages, pc.smoking, pc.has_children,
               pc.wants_children, g.lat, g.lon, pw.weights, e.user_id is not null
        from app.accounts a
        join app.profile_core pc on pc.user_id = a.user_id
        join app.geo g on g.user_id = a.user_id
        left join app.personal_weights pw on pw.user_id = a.user_id
        left join app.profile_embeddings e on e.user_id = a.user_id
        where a.user_id = any(%s::uuid[])
        order by a.user_id
        """,
        (user_ids,),
    ).fetchall()
    people: dict[str, Person] = {}
    for r in rows:
        p = Person(
            user_id=r[0],
            address_form=r[1],
            display_name=r[2],
            birth_year=r[3],
            age=(run_year - r[3]) if r[3] is not None else None,
            summary_text=r[4],
            summary_version=r[5] or 0,
            personality=r[6] or {},
            values_profile=r[7] or {},
            life=r[8] or {},
            age_min=r[9],
            age_max=r[10],
            travel_modes=list(r[11] or []),
            travel_max_minutes=r[12],
            travel_max_km=r[13],
            languages=list(r[14] or ["de"]),
            smoking=r[15],
            has_children=r[16],
            wants_children=r[17],
            lat=float(r[18]),
            lon=float(r[19]),
            personal_weights=r[20] if isinstance(r[20], dict) else None,
            has_embedding=bool(r[21]),
        )
        people[p.user_id] = p
    for uid, cat, text, imp in conn.execute(
        "select user_id::text, category, text, importance from app.wants where user_id = any(%s::uuid[])", (user_ids,)
    ):
        if uid in people:
            people[uid].wants.append(Want(cat, text, imp))
    for uid, kind, value, text in conn.execute(
        "select user_id::text, kind, value, text from app.dealbreakers where user_id = any(%s::uuid[])", (user_ids,)
    ):
        if uid in people:
            people[uid].dealbreakers.append(Dealbreaker(kind, value or {}, text))
    for uid, s, e in conn.execute(
        """select user_id::text, starts_at, ends_at from app.availability_windows
           where period_id = %s and user_id = any(%s::uuid[]) order by user_id, starts_at""",
        (period_id, user_ids),
    ):
        if uid in people:
            people[uid].windows.append((_epoch(s), _epoch(e)))
    return [people[u] for u in sorted(people)]


def wait_rounds(conn: psycopg.Connection, user_ids: list[str], run_id: str) -> dict[str, int]:
    """Läufe seit dem letzten Vorschlag: abgeschlossene Läufe, in denen die Person im Pool war und danach keinen
    Vorschlag bekam (abgelehnte Vorschläge zählen nicht als Vorschlag)."""
    if not user_ids:
        return {}
    rows = conn.execute(
        """
        with last_prop as (
          select v.u, max(p.created_at) as at
          from app.pairings p
          cross join lateral (values (p.user_a), (p.user_b)) as v (u)
          where p.status not in ('pending_review', 'rejected') and v.u = any(%(ids)s::uuid[])
          group by v.u
        )
        select m.user_id::text, count(*)::int
        from app.match_run_members m
        join app.match_runs r on r.id = m.run_id
        left join last_prop lp on lp.u = m.user_id
        where m.user_id = any(%(ids)s::uuid[])
          and r.id <> %(run)s::uuid
          and r.status in ('review', 'approved', 'partially_approved', 'cancelled')
          and coalesce(r.started_at, r.created_at) > coalesce(lp.at, '-infinity'::timestamptz)
        group by m.user_id
        """,
        {"ids": user_ids, "run": run_id},
    ).fetchall()
    return {uid: n for uid, n in rows}


def pair_history(
    conn: psycopg.Connection, user_ids: list[str], now: datetime, cooldown_days: int
) -> tuple[set[tuple[str, str]], set[tuple[str, str]], set[tuple[str, str]]]:
    """(schon vorgeschlagen, blockiert, kürzlich abgelehnt) als Mengen von (user_a, user_b) mit user_a < user_b.

    Gleiche Bedeutung wie app.already_paired (alle Status außer rejected) und app.is_blocked.
    """
    ids = user_ids
    paired: set[tuple[str, str]] = set()
    rejected: set[tuple[str, str]] = set()
    for a, b, status, reviewed_at, created_at in conn.execute(
        """select user_a::text, user_b::text, status, reviewed_at, created_at from app.pairings
           where user_a = any(%(ids)s::uuid[]) and user_b = any(%(ids)s::uuid[])""",
        {"ids": ids},
    ):
        if status != "rejected":
            paired.add((a, b))
        elif (now - (reviewed_at or created_at)).days < cooldown_days:
            rejected.add((a, b))
    blocked: set[tuple[str, str]] = set()
    for x, y in conn.execute(
        """select blocker::text, blocked::text from app.blocks
           where blocker = any(%(ids)s::uuid[]) and blocked = any(%(ids)s::uuid[])""",
        {"ids": ids},
    ):
        blocked.add((min(x, y), max(x, y)))
    return paired, blocked, rejected
