"""Harte Filter je Paar (ohne die Art.-9-Prüfungen, die nur die Datenbank beantwortet).

Reihenfolge (für die Zählung „verworfen wegen …“ zählt der erste nicht erfüllte Filter):
 1. entfernung            PLZ-Mittelpunkte weiter auseinander als die kleinere Fahrbereitschaft
 2. alter                 Alter liegt nicht im Wunschbereich beider Personen
 3. sprache               keine gemeinsame Sprache
 4. dealbreaker_raucht / _hat_kinder / _will_kinder / _will_keine_kinder / _alter / _entfernung
 5. schon_vorgeschlagen   app.already_paired: das Paar wurde schon einmal vorgeschlagen
 6. blockiert             app.is_blocked: eine Person hat die andere blockiert
 7. kuerzlich_abgelehnt   Benn hat das Paar innerhalb von matching.rejected_pair_cooldown_days abgelehnt
 8. keine_gemeinsame_zeit kein gemeinsames Fenster ≥ evening.default_duration_minutes
 9. kein_lokal            kein aktives Lokal in Reichweite beider mit freiem Platz in einem gemeinsamen Fenster
Danach in der Datenbank: geschlecht (sensitive.gender_compatible), religion (sensitive.religion_compatible).

Schritte 1–7 laufen je Person vektorisiert über alle späteren Personen (numpy), 8–9 nur für die Übrigen.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field

import numpy as np

from .availability import day_mask, distinct_days, earliest_slot_in_windows, shared_windows
from .config import MatchSettings
from .geo import haversine_many, travel_limit_km
from .models import PairInfo, Period, Person, Venue

REASON_ORDER = (
    "entfernung",
    "alter",
    "sprache",
    "dealbreaker_raucht",
    "dealbreaker_hat_kinder",
    "dealbreaker_will_kinder",
    "dealbreaker_will_keine_kinder",
    "dealbreaker_alter",
    "dealbreaker_entfernung",
    "schon_vorgeschlagen",
    "blockiert",
    "kuerzlich_abgelehnt",
    "keine_gemeinsame_zeit",
    "kein_lokal",
    "geschlecht",
    "religion",
)

_WANTS = {"ja": 1, "nein": 2}
_SMOKE = {"nein": 0, "gelegentlich": 1, "ja": 2}


def age_range(p: Person, settings: MatchSettings) -> tuple[int, int]:
    """Wunschbereich fürs Alter des Gegenübers. Ohne Angaben: eigenes Alter ± matching.default_age_window_years."""
    if p.age_min is None and p.age_max is None:
        w = settings.default_age_window_years
        age = p.age if p.age is not None else 40
        lo, hi = age - w, age + w
    else:
        lo = p.age_min if p.age_min is not None else 18
        hi = p.age_max if p.age_max is not None else 99
    return max(18, lo), min(99, hi)


def dealbreaker_age(p: Person) -> tuple[int, int]:
    lo, hi = 0, 200
    for d in p.dealbreaker("alter"):
        v = d.value or {}
        if isinstance(v.get("min"), int | float):
            lo = max(lo, int(v["min"]))
        if isinstance(v.get("max"), int | float):
            hi = min(hi, int(v["max"]))
    return lo, hi


def dealbreaker_distance(p: Person) -> float:
    limit = float("inf")
    for d in p.dealbreaker("entfernung"):
        v = (d.value or {}).get("max_km")
        if isinstance(v, int | float):
            limit = min(limit, float(v))
    return limit


def dealbreaker_smoking(p: Person) -> int:
    """0 = kein Deal-Breaker, 1 = schließt „ja“ aus, 2 = schließt auch „gelegentlich“ aus (Standard)."""
    level = 0
    for d in p.dealbreaker("raucht"):
        level = max(level, 1 if (d.value or {}).get("gelegentlich_ok") else 2)
    return level


@dataclass
class PoolArrays:
    n: int
    lat: np.ndarray
    lon: np.ndarray
    limit: np.ndarray
    age: np.ndarray
    age_lo: np.ndarray
    age_hi: np.ndarray
    lang: np.ndarray
    smoke: np.ndarray
    db_smoke: np.ndarray
    has_children: np.ndarray
    db_kids: np.ndarray
    wants: np.ndarray
    db_wants_yes: np.ndarray
    db_wants_no: np.ndarray
    db_age_lo: np.ndarray
    db_age_hi: np.ndarray
    db_dist: np.ndarray
    days: np.ndarray
    venue_mask: np.ndarray  # (n, W) uint64
    venue_dist: np.ndarray  # (n, V)


def build_arrays(
    people: list[Person], venues: list[Venue], settings: MatchSettings, period: Period, min_seconds: int
) -> PoolArrays:
    n = len(people)
    lat = np.array([p.lat for p in people], dtype=np.float64)
    lon = np.array([p.lon for p in people], dtype=np.float64)
    limit = np.array(
        [
            travel_limit_km(p.travel_max_km, p.travel_max_minutes, p.travel_modes, settings.max_distance_km)
            for p in people
        ]
    )
    ages = np.array([p.age if p.age is not None else -1 for p in people], dtype=np.int64)
    ranges = [age_range(p, settings) for p in people]
    langs_all = sorted({lang for p in people for lang in (p.languages or ["de"])})
    lang_bit = {lang: 1 << k for k, lang in enumerate(langs_all[:62])}
    lang = np.array([sum(lang_bit.get(x, 0) for x in set(p.languages or ["de"])) or 1 for p in people], dtype=np.int64)
    db_ages = [dealbreaker_age(p) for p in people]
    n_days = (period.ends_on - period.starts_on).days + 1
    days = np.array([day_mask(p.windows, min_seconds, period.starts_on, n_days) for p in people], dtype=np.int64)

    v = len(venues)
    words = max(1, (v + 63) // 64)
    venue_dist = np.zeros((n, v), dtype=np.float64)
    venue_mask = np.zeros((n, words), dtype=np.uint64)
    has_slots = [bool(ven.slots) for ven in venues]
    for k, ven in enumerate(venues):
        venue_dist[:, k] = haversine_many(ven.lat, ven.lon, lat, lon)
        if not has_slots[k]:
            continue
        reach = venue_dist[:, k] <= limit
        venue_mask[reach, k // 64] |= np.uint64(1 << (k % 64))

    return PoolArrays(
        n=n,
        lat=lat,
        lon=lon,
        limit=limit,
        age=ages,
        age_lo=np.array([r[0] for r in ranges], dtype=np.int64),
        age_hi=np.array([r[1] for r in ranges], dtype=np.int64),
        lang=lang,
        smoke=np.array([_SMOKE.get(p.smoking or "", -1) for p in people], dtype=np.int64),
        db_smoke=np.array([dealbreaker_smoking(p) for p in people], dtype=np.int64),
        has_children=np.array([-1 if p.has_children is None else int(p.has_children) for p in people], dtype=np.int64),
        db_kids=np.array([bool(p.dealbreaker("hat_kinder")) for p in people], dtype=bool),
        wants=np.array([_WANTS.get(p.wants_children or "", 0) for p in people], dtype=np.int64),
        db_wants_yes=np.array([bool(p.dealbreaker("will_kinder")) for p in people], dtype=bool),
        db_wants_no=np.array([bool(p.dealbreaker("will_keine_kinder")) for p in people], dtype=bool),
        db_age_lo=np.array([r[0] for r in db_ages], dtype=np.int64),
        db_age_hi=np.array([r[1] for r in db_ages], dtype=np.int64),
        db_dist=np.array([dealbreaker_distance(p) for p in people], dtype=np.float64),
        days=days,
        venue_mask=venue_mask,
        venue_dist=venue_dist,
    )


@dataclass
class FilterResult:
    pairs: dict[tuple[int, int], PairInfo] = field(default_factory=dict)
    drops: Counter = field(default_factory=Counter)
    checked_pairs: int = 0


def _apply(mask: np.ndarray, fail: np.ndarray, reason: str, drops: Counter) -> None:
    hit = mask & fail
    k = int(hit.sum())
    if k:
        drops[reason] += k
        mask &= ~fail


def hard_filter(
    people: list[Person],
    venues: list[Venue],
    settings: MatchSettings,
    period: Period,
    excluded: dict[tuple[int, int], str] | None = None,
) -> FilterResult:
    """Alle harten Filter außer Geschlecht und Religion. `excluded` bildet Paare (i < j) auf einen Grund ab
    (schon_vorgeschlagen, blockiert, kuerzlich_abgelehnt)."""
    min_seconds = settings.evening_duration_minutes * 60
    arr = build_arrays(people, venues, settings, period, min_seconds)
    excluded = excluded or {}
    by_i: dict[int, list[tuple[int, str]]] = {}
    for (i, j), reason in excluded.items():
        by_i.setdefault(min(i, j), []).append((max(i, j), reason))
    excl_rank = {"schon_vorgeschlagen": 0, "blockiert": 1, "kuerzlich_abgelehnt": 2}

    venue_slot_starts = [[s[0] for s in v.slots if s[2] > 0] for v in venues]
    result = FilterResult()
    n = arr.n
    result.checked_pairs = n * (n - 1) // 2
    drops = result.drops

    for i in range(n - 1):
        js = np.arange(i + 1, n)
        mask = np.ones(js.shape[0], dtype=bool)
        d = haversine_many(arr.lat[i], arr.lon[i], arr.lat[js], arr.lon[js])

        _apply(mask, d > np.minimum(arr.limit[i], arr.limit[js]), "entfernung", drops)
        age_fail = (
            (arr.age[js] < arr.age_lo[i])
            | (arr.age[js] > arr.age_hi[i])
            | (arr.age[i] < arr.age_lo[js])
            | (arr.age[i] > arr.age_hi[js])
        )
        _apply(mask, age_fail, "alter", drops)
        _apply(mask, (arr.lang[i] & arr.lang[js]) == 0, "sprache", drops)

        smoke_fail = (
            ((arr.db_smoke[i] >= 1) & (arr.smoke[js] == 2))
            | ((arr.db_smoke[i] == 2) & (arr.smoke[js] == 1))
            | ((arr.db_smoke[js] >= 1) & (arr.smoke[i] == 2))
            | ((arr.db_smoke[js] == 2) & (arr.smoke[i] == 1))
        )
        _apply(mask, smoke_fail, "dealbreaker_raucht", drops)
        kids_fail = (arr.db_kids[i] & (arr.has_children[js] == 1)) | (arr.db_kids[js] & (arr.has_children[i] == 1))
        _apply(mask, kids_fail, "dealbreaker_hat_kinder", drops)
        wy_fail = (arr.db_wants_yes[i] & (arr.wants[js] == 1)) | (arr.db_wants_yes[js] & (arr.wants[i] == 1))
        _apply(mask, wy_fail, "dealbreaker_will_kinder", drops)
        wn_fail = (arr.db_wants_no[i] & (arr.wants[js] == 2)) | (arr.db_wants_no[js] & (arr.wants[i] == 2))
        _apply(mask, wn_fail, "dealbreaker_will_keine_kinder", drops)
        dba_fail = (
            (arr.age[js] < arr.db_age_lo[i])
            | (arr.age[js] > arr.db_age_hi[i])
            | (arr.age[i] < arr.db_age_lo[js])
            | (arr.age[i] > arr.db_age_hi[js])
        )
        _apply(mask, dba_fail, "dealbreaker_alter", drops)
        _apply(mask, d > np.minimum(arr.db_dist[i], arr.db_dist[js]), "dealbreaker_entfernung", drops)

        for j, reason in sorted(by_i.get(i, []), key=lambda x: excl_rank.get(x[1], 9)):
            k = j - i - 1
            if mask[k]:
                mask[k] = False
                drops[reason] += 1

        _apply(mask, (arr.days[i] & arr.days[js]) == 0, "keine_gemeinsame_zeit", drops)
        venue_overlap = np.any((arr.venue_mask[i] & arr.venue_mask[js]) != 0, axis=1)
        _apply(mask, ~venue_overlap, "kein_lokal", drops)

        for k in np.nonzero(mask)[0]:
            j = int(js[k])
            sw = shared_windows(people[i].windows, people[j].windows, min_seconds)
            if not sw:
                drops["keine_gemeinsame_zeit"] += 1
                continue
            feasible: list[tuple[int, float, float]] = []
            common = arr.venue_mask[i] & arr.venue_mask[j]
            for w_idx, word in enumerate(common):
                word = int(word)
                while word:
                    bit = word & -word
                    v_idx = w_idx * 64 + bit.bit_length() - 1
                    word ^= bit
                    if earliest_slot_in_windows(venue_slot_starts[v_idx], sw, min_seconds) is not None:
                        feasible.append((v_idx, float(arr.venue_dist[i, v_idx]), float(arr.venue_dist[j, v_idx])))
            if not feasible:
                drops["kein_lokal"] += 1
                continue
            result.pairs[(i, j)] = PairInfo(
                i=i, j=j, distance_km=float(d[k]), shared_windows=sw, shared_days=distinct_days(sw), venues=feasible
            )
    return result


def pair_limit_km(people: list[Person], i: int, j: int, settings: MatchSettings) -> float:
    a, b = people[i], people[j]
    return min(
        travel_limit_km(a.travel_max_km, a.travel_max_minutes, a.travel_modes, settings.max_distance_km),
        travel_limit_km(b.travel_max_km, b.travel_max_minutes, b.travel_modes, settings.max_distance_km),
    )
