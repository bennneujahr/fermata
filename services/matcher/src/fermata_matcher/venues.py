"""Lokal-Wahl: möglichst in der Mitte (PLAN 1 Nr. 6).

Unter den aktiven Lokalen in Reichweite beider Personen mit freiem Platz in einem gemeinsamen Fenster gewinnt das
Lokal mit der kleinsten längeren Anfahrt (min max). Bedingung: längere ÷ kürzere Anfahrt ≤
matching.venue_max_detour_ratio, sobald die längere Anfahrt über matching.venue_ratio_min_km liegt (bei kurzen Wegen
ist ein Verhältnis wenig aussagekräftig). Erfüllt kein Lokal die Bedingung, wird trotzdem das Lokal mit der
kleinsten längeren Anfahrt gewählt und für Benn markiert. Gleichstand (auf 0,1 km) → früherer Platz.
Jeder Lauf zählt die Tische mit, damit ein Platz nicht mehr Paaren zugeteilt wird, als Tische frei sind.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from .availability import BERLIN, slots_in_windows
from .config import MatchSettings
from .models import PairInfo, Venue

WEEKDAYS = ("Mo", "Di", "Mi", "Do", "Fr", "Sa", "So")


@dataclass
class VenueChoice:
    venue_index: int
    slot_index: int
    distance_a_km: float
    distance_b_km: float
    ratio: float
    ratio_ok: bool
    reason: str


def format_local(ts: int) -> str:
    dt = datetime.fromtimestamp(ts, tz=UTC).astimezone(BERLIN)
    return f"{WEEKDAYS[dt.weekday()]} {dt:%d.%m.} {dt:%H:%M} Uhr"


def detour_ratio(da: float, db: float) -> float:
    longer, shorter = max(da, db), min(da, db)
    return longer / max(shorter, 0.1)


def choose_venue(
    info: PairInfo,
    venues: list[Venue],
    capacity: dict[tuple[int, int], int],
    settings: MatchSettings,
) -> VenueChoice | None:
    """Wählt Lokal und frühesten freien Platz. `capacity[(lokal, platz)]` = noch freie Tische in diesem Lauf."""
    duration = settings.evening_duration_minutes * 60
    options: list[tuple[bool, float, int, int, int, float, float, float]] = []
    for v_idx, da, db in info.venues:
        starts = [s[0] for s in venues[v_idx].slots]
        free = [k for k in slots_in_windows(starts, info.shared_windows, duration) if capacity.get((v_idx, k), 0) > 0]
        if not free:
            continue
        longer = max(da, db)
        ratio = detour_ratio(da, db)
        ratio_ok = longer <= settings.venue_ratio_min_km or ratio <= settings.venue_max_detour_ratio
        options.append((not ratio_ok, round(longer, 1), starts[free[0]], v_idx, free[0], da, db, ratio))
    if not options:
        return None
    options.sort()
    violated, _, start, v_idx, s_idx, da, db, ratio = options[0]
    venue = venues[v_idx]
    reason = (
        f"{venue.name} ({venue.city}): Anfahrt {da:.1f} km und {db:.1f} km Luftlinie, Verhältnis {ratio:.2f}; "
        f"frühester freier Platz {format_local(start)}."
    )
    if violated:
        reason += (
            f" Hinweis: Verhältnis über {settings.venue_max_detour_ratio:.2f}; "
            "kein Lokal näher an der Mitte hat einen freien Platz."
        )
    return VenueChoice(v_idx, s_idx, da, db, ratio, not violated, reason)


def initial_capacity(venues: list[Venue]) -> dict[tuple[int, int], int]:
    return {(v_idx, s_idx): slot[2] for v_idx, v in enumerate(venues) for s_idx, slot in enumerate(v.slots)}
