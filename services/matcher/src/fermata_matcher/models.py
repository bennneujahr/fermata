"""Datenklassen des Auswahl-Jobs. Enthalten nie Art.-9-Daten (die liegen nur im Schema sensitive)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

SMOKING_CODES = {"nein": 0, "gelegentlich": 1, "ja": 2}
WANTS_CHILDREN_VALUES = ("ja", "nein", "offen", "vielleicht")


@dataclass
class Want:
    category: str
    text: str
    importance: int = 2


@dataclass
class Dealbreaker:
    kind: str
    value: dict[str, Any] = field(default_factory=dict)
    text: str | None = None


@dataclass
class Person:
    """Eine Person im Pool eines Laufs (nur Daten ohne Art.-9-Bezug)."""

    user_id: str
    address_form: str = "sie"
    display_name: str | None = None
    birth_year: int | None = None
    age: int | None = None
    summary_text: str = ""
    summary_version: int = 0
    personality: dict[str, Any] = field(default_factory=dict)
    values_profile: dict[str, Any] = field(default_factory=dict)
    life: dict[str, Any] = field(default_factory=dict)
    age_min: int | None = None
    age_max: int | None = None
    travel_modes: list[str] = field(default_factory=list)
    travel_max_minutes: int | None = None
    travel_max_km: int | None = None
    languages: list[str] = field(default_factory=lambda: ["de"])
    smoking: str | None = None
    has_children: bool | None = None
    wants_children: str | None = None
    lat: float = 0.0
    lon: float = 0.0
    wants: list[Want] = field(default_factory=list)
    dealbreakers: list[Dealbreaker] = field(default_factory=list)
    personal_weights: dict[str, float] | None = None
    # Freie Fenster im Zeitraum als (Beginn, Ende) in Unix-Sekunden
    windows: list[tuple[int, int]] = field(default_factory=list)
    wait_rounds: int = 0
    has_embedding: bool = False

    def dealbreaker(self, kind: str) -> list[Dealbreaker]:
        return [d for d in self.dealbreakers if d.kind == kind]


@dataclass
class Venue:
    id: str
    name: str
    city: str
    lat: float
    lon: float
    # freie Plätze: (Beginn in Unix-Sekunden, slot_id, freie Tische)
    slots: list[tuple[int, str, int]] = field(default_factory=list)


@dataclass
class Period:
    id: str
    starts_on: date
    ends_on: date


@dataclass
class PairInfo:
    """Ergebnis der harten Filter für ein Paar (Indizes i < j in der Pool-Liste)."""

    i: int
    j: int
    distance_km: float
    shared_windows: list[tuple[int, int]]
    shared_days: int
    # mögliche Lokale: (Index des Lokals, Anfahrt i in km, Anfahrt j in km)
    venues: list[tuple[int, float, float]] = field(default_factory=list)
