"""Begriffe des Gesprächs: Gesprächsarten, Stufen, Phasen, Themenblöcke, Gründe für das Ende."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Literal


class Kind(StrEnum):
    ERSTGESPRAECH = "erstgespraech"
    VERTIEFUNG = "vertiefung"
    NACHBESPRECHUNG = "nachbesprechung"
    KORREKTUR = "korrektur"


class Mode(StrEnum):
    VOICE = "voice"
    TEXT = "text"


class AddressForm(StrEnum):
    SIE = "sie"
    DU = "du"


class Tier(StrEnum):
    AUFTAKT = "auftakt"
    ANDANTE = "andante"
    LOGE = "loge"


class Phase(StrEnum):
    BEGRUESSUNG = "begruessung"
    THEMEN = "themen"
    ZUSAMMENFASSUNG = "zusammenfassung"
    ABSCHLUSS = "abschluss"
    BEENDET = "beendet"


class EndReason(StrEnum):
    FERTIG = "fertig"
    PERSON_BEENDET = "person_beendet"
    ZEITLIMIT = "zeitlimit"
    TECHNIK = "technik"
    KRISE = "krise"
    MINDERJAEHRIG = "minderjaehrig"
    MISSBRAUCH = "missbrauch"


# Bei diesen Gründen entsteht kein Profil (keine Auswertung, keine Zusammenfassung).
SAFETY_END_REASONS = frozenset({EndReason.KRISE, EndReason.MINDERJAEHRIG, EndReason.MISSBRAUCH})


class Block(StrEnum):
    PERSOENLICHKEIT = "persoenlichkeit"
    WERTE = "werte"
    WUENSCHE = "wuensche"
    LEBENSUMSTAENDE = "lebensumstaende"
    FAHRBEREITSCHAFT = "fahrbereitschaft"
    ZEITEN = "zeiten"
    ABEND_EINDRUCK = "abend_eindruck"
    ABEND_PASSUNG = "abend_passung"
    ABEND_AUSBLICK = "abend_ausblick"
    KORREKTUR = "korrektur"


BLOCK_TITLES: dict[Block, str] = {
    Block.PERSOENLICHKEIT: "Persönlichkeit",
    Block.WERTE: "Werte",
    Block.WUENSCHE: "Wünsche an das Gegenüber",
    Block.LEBENSUMSTAENDE: "Lebensumstände",
    Block.FAHRBEREITSCHAFT: "Fahrbereitschaft",
    Block.ZEITEN: "Freie Zeiten",
    Block.ABEND_EINDRUCK: "Eindruck vom Abend",
    Block.ABEND_PASSUNG: "Was gepasst hat und was nicht",
    Block.ABEND_AUSBLICK: "Was beim nächsten Vorschlag anders sein soll",
    Block.KORREKTUR: "Korrektur der Zusammenfassung",
}

BLOCKS_BY_KIND: dict[Kind, tuple[Block, ...]] = {
    Kind.ERSTGESPRAECH: (
        Block.PERSOENLICHKEIT,
        Block.WERTE,
        Block.WUENSCHE,
        Block.LEBENSUMSTAENDE,
        Block.FAHRBEREITSCHAFT,
        Block.ZEITEN,
    ),
    Kind.VERTIEFUNG: (Block.WERTE, Block.WUENSCHE, Block.PERSOENLICHKEIT, Block.LEBENSUMSTAENDE),
    Kind.NACHBESPRECHUNG: (Block.ABEND_EINDRUCK, Block.ABEND_PASSUNG, Block.ABEND_AUSBLICK),
    Kind.KORREKTUR: (Block.KORREKTUR,),
}


class SafetyKind(StrEnum):
    KRISE = "krise"
    MINDERJAEHRIG = "minderjaehrig"
    GEWALT = "gewalt"
    BELAESTIGUNG = "belaestigung"
    SONSTIGES = "sonstiges"


class Severity(StrEnum):
    NIEDRIG = "niedrig"
    MITTEL = "mittel"
    HOCH = "hoch"
    AKUT = "akut"

    @property
    def rank(self) -> int:
        return ["niedrig", "mittel", "hoch", "akut"].index(self.value)


Role = Literal["viola", "person"]


def utcnow() -> datetime:
    return datetime.now(UTC)


@dataclass(slots=True)
class Turn:
    """Ein Gesprächsbeitrag als Text. Audio gibt es in diesem Dienst nicht als Datenobjekt."""

    role: Role
    text: str
    at: datetime = field(default_factory=utcnow)
    mode: Mode = Mode.VOICE

    def to_json(self) -> dict[str, str]:
        return {"role": self.role, "text": self.text, "at": self.at.isoformat(), "mode": self.mode.value}
