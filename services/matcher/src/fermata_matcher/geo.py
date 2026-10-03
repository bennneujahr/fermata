"""Entfernungen zwischen PLZ-Mittelpunkten (Luftlinie, Haversine) und Fahrbereitschaft."""

from __future__ import annotations

import math

import numpy as np

EARTH_RADIUS_KM = 6371.0088

# Durchschnittliche Reisegeschwindigkeit je Verkehrsmittel in km je Minute (Weg, nicht Luftlinie).
SPEED_KM_PER_MIN: dict[str, float] = {"auto": 50 / 60, "oepnv": 30 / 60, "rad": 15 / 60, "zu_fuss": 4.5 / 60}
# Umwegfaktor: Straßen- bzw. Bahnweg ist im Mittel etwa 1,3-mal so lang wie die Luftlinie.
DETOUR_FACTOR = 1.3


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


def haversine_many(lat1: float, lon1: float, lat2: np.ndarray, lon2: np.ndarray) -> np.ndarray:
    """Entfernung eines Punktes zu vielen Punkten (vektorisiert)."""
    p1 = math.radians(lat1)
    p2 = np.radians(lat2)
    dphi = p2 - p1
    dlmb = np.radians(lon2 - lon1)
    a = np.sin(dphi / 2) ** 2 + math.cos(p1) * np.cos(p2) * np.sin(dlmb / 2) ** 2
    return 2 * EARTH_RADIUS_KM * np.arcsin(np.minimum(1.0, np.sqrt(a)))


def travel_limit_km(
    travel_max_km: float | None,
    travel_max_minutes: float | None,
    travel_modes: list[str] | None,
    default_km: float,
) -> float:
    """Größte Luftlinien-Entfernung, die eine Person fahren mag.

    - Angabe in km: gilt direkt.
    - Angabe in Minuten: Minuten × Geschwindigkeit des schnellsten genannten Verkehrsmittels ÷ Umwegfaktor
      (ohne Verkehrsmittel: ÖPNV).
    - Beides: das Kleinere. Nichts: matching.max_distance_km.
    """
    limits: list[float] = []
    if travel_max_km is not None:
        limits.append(float(travel_max_km))
    if travel_max_minutes is not None:
        modes = [m for m in (travel_modes or []) if m in SPEED_KM_PER_MIN] or ["oepnv"]
        speed = max(SPEED_KM_PER_MIN[m] for m in modes)
        limits.append(float(travel_max_minutes) * speed / DETOUR_FACTOR)
    return min(limits) if limits else float(default_km)
