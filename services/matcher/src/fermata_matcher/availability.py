"""Gemeinsame Zeitfenster und freie Plätze in Lokalen.

`shared_windows` rechnet genau wie die Datenbankfunktion app.shared_windows(a, b, period, min_minutes):
für jedes Paar sich überlappender Fenster der Schnitt (späterer Beginn, früheres Ende), wenn er mindestens
`min_minutes` lang ist, sortiert nach Beginn. Der Job rechnet das im Speicher, weil er Hunderttausende Paare
prüft; tests/test_db_filters.py vergleicht beide Wege auf denselben Daten.
"""

from __future__ import annotations

import bisect
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

BERLIN = ZoneInfo("Europe/Berlin")


def shared_windows(wa: list[tuple[int, int]], wb: list[tuple[int, int]], min_seconds: int) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    for a_start, a_end in wa:
        for b_start, b_end in wb:
            if a_start < b_end and b_start < a_end:
                s, e = max(a_start, b_start), min(a_end, b_end)
                if e - s >= min_seconds:
                    out.append((s, e))
    out.sort()
    return out


def local_date(ts: int) -> date:
    return datetime.fromtimestamp(ts, tz=UTC).astimezone(BERLIN).date()


def distinct_days(windows: list[tuple[int, int]]) -> int:
    """Anzahl verschiedener Kalendertage (Europe/Berlin), an denen ein gemeinsames Fenster beginnt."""
    return len({local_date(s) for s, _ in windows})


def day_mask(windows: list[tuple[int, int]], min_seconds: int, first_day: date, n_days: int) -> int:
    """Bitmaske der Tage, die ein Fenster mit mindestens `min_seconds` berührt (notwendige Bedingung)."""
    if n_days > 63:
        return (1 << 63) - 1  # zu langer Zeitraum: keine Vorfilterung
    mask = 0
    for s, e in windows:
        if e - s < min_seconds:
            continue
        d0 = (local_date(s) - first_day).days
        d1 = (local_date(e) - first_day).days
        for d in range(max(d0, 0), min(d1, n_days - 1) + 1):
            mask |= 1 << d
    return mask


def earliest_slot_in_windows(
    slot_starts: list[int], windows: list[tuple[int, int]], duration_seconds: int
) -> int | None:
    """Index des frühesten Platzes, dessen Abend vollständig in einem der Fenster liegt (oder None).

    `slot_starts` ist aufsteigend sortiert. Ein Platz passt, wenn Beginn ≥ Fensterbeginn und
    Beginn + Dauer ≤ Fensterende.
    """
    best: int | None = None
    for w_start, w_end in windows:
        latest = w_end - duration_seconds
        if latest < w_start:
            continue
        k = bisect.bisect_left(slot_starts, w_start)
        if k < len(slot_starts) and slot_starts[k] <= latest and (best is None or k < best):
            best = k
    return best


def slots_in_windows(slot_starts: list[int], windows: list[tuple[int, int]], duration_seconds: int) -> list[int]:
    """Alle Indizes passender Plätze (aufsteigend)."""
    found: set[int] = set()
    for w_start, w_end in windows:
        latest = w_end - duration_seconds
        if latest < w_start:
            continue
        k = bisect.bisect_left(slot_starts, w_start)
        while k < len(slot_starts) and slot_starts[k] <= latest:
            found.add(k)
            k += 1
    return sorted(found)
