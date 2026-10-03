"""Art.-9-Filter (PLAN 5.7): Sensible Angaben gelangen nie in Profil, Zusammenfassung oder Wünsche.

Zwei Stufen:
1. Regeln (Schlüsselwörter, reguläre Ausdrücke aus ``art9_patterns.json``) – schnell, deterministisch,
   dieselbe Liste prüft die Datenbank noch einmal beim Speichern (``app.art9_categories``).
2. Gegenprüfung durch das Sprachmodell (``Art9LlmChecker``) für Umschreibungen, die keine Regel fängt
   (z. B. „geht freitags in die Moschee“ wird erkannt, „fastet im Ramadan“ auch, „sonntags im Gottesdienst“ auch,
   aber „trinkt seit zwei Jahren keinen Tropfen mehr“ nur durch das Modell).

Grundsatz „immer auf Nummer sicher“: Im Zweifel wird ein Satz entfernt. Fundstellen werden nie protokolliert,
nur Kategorien und Anzahl.
"""

from __future__ import annotations

import json
import re
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass, field
from functools import cache
from importlib import resources
from typing import Any

REDACTED = "[geschützte Angabe entfernt]"


@dataclass(frozen=True, slots=True)
class Pattern:
    category: str
    fragment: str
    prefix: bool
    anywhere: bool
    regex: re.Pattern[str]


@dataclass(frozen=True, slots=True)
class PatternSet:
    version: int
    letters: str
    categories: dict[str, str]
    patterns: tuple[Pattern, ...]


def build_regex(fragment: str, *, prefix: bool, anywhere: bool, letters: str = "a-zäöüß0-9") -> str:
    """Gleiche Bildungsregel wie die generierte Spalte ``ops.art9_patterns.regex`` in der Migration."""
    start = "" if anywhere else f"(?<![{letters}])"
    end = "" if prefix else f"(?![{letters}])"
    return f"{start}(?:{fragment}){end}"


@cache
def load_patterns() -> PatternSet:
    raw = json.loads(resources.files("viola").joinpath("art9_patterns.json").read_text(encoding="utf-8"))
    letters = raw.get("letters", "a-zäöüß0-9")
    patterns = tuple(
        Pattern(
            category=p["c"],
            fragment=p["p"],
            prefix=bool(p["prefix"]),
            anywhere=bool(p["anywhere"]),
            regex=re.compile(build_regex(p["p"], prefix=bool(p["prefix"]), anywhere=bool(p["anywhere"]), letters=letters)),
        )
        for p in raw["patterns"]
    )
    return PatternSet(version=int(raw["version"]), letters=letters, categories=dict(raw["categories"]), patterns=patterns)


def normalize(text: str) -> str:
    return unicodedata.normalize("NFC", text).lower()


def categories(text: str | None) -> set[str]:
    """Kategorien, die im Text vorkommen (leer = unauffällig)."""
    if not text:
        return set()
    t = normalize(text)
    return {p.category for p in load_patterns().patterns if p.regex.search(t)}


def contains_art9(text: str | None) -> bool:
    return bool(categories(text))


_SENTENCE_SPLIT = re.compile(r"(?<=[.!?…])\s+|\n+")


def split_sentences(text: str) -> list[str]:
    return [s for s in _SENTENCE_SPLIT.split(text.strip()) if s.strip()]


@dataclass(slots=True)
class RedactResult:
    text: str
    removed_sentences: int = 0
    categories: set[str] = field(default_factory=set)

    @property
    def changed(self) -> bool:
        return self.removed_sentences > 0


def drop_sentences(text: str, extra_flagged: Iterable[int] = ()) -> RedactResult:
    """Entfernt Sätze mit Art.-9-Inhalt ganz (für Zusammenfassungen und Profiltexte)."""
    flagged = set(extra_flagged)
    kept: list[str] = []
    result = RedactResult(text="")
    for i, sentence in enumerate(split_sentences(text)):
        cats = categories(sentence)
        if cats or i in flagged:
            result.removed_sentences += 1
            result.categories |= cats or {"modell"}
            continue
        kept.append(sentence)
    result.text = " ".join(kept)
    return result


def redact_sentences(text: str, marker: str = REDACTED) -> RedactResult:
    """Ersetzt Sätze mit Art.-9-Inhalt durch eine Markierung (für Transkripte)."""
    out: list[str] = []
    result = RedactResult(text="")
    last_was_marker = False
    for sentence in split_sentences(text):
        cats = categories(sentence)
        if cats:
            result.removed_sentences += 1
            result.categories |= cats
            if not last_was_marker:
                out.append(marker)
            last_was_marker = True
        else:
            out.append(sentence)
            last_was_marker = False
    result.text = " ".join(out)
    return result


def clean_strings(value: Any) -> tuple[Any, set[str]]:
    """Entfernt in einer JSON-Struktur alle Zeichenketten mit Art.-9-Inhalt.

    Listen verlieren betroffene Einträge, Objekte betroffene Felder (bzw. Sätze in längeren Texten).
    Liefert die bereinigte Struktur und die gefundenen Kategorien.
    """
    found: set[str] = set()

    def walk(v: Any) -> Any:
        if isinstance(v, str):
            cats = categories(v)
            if not cats:
                return v
            found.update(cats)
            reduced = drop_sentences(v)
            return reduced.text if reduced.text and not contains_art9(reduced.text) else None
        if isinstance(v, list):
            items = [walk(x) for x in v]
            return [x for x in items if x is not None and x != ""]
        if isinstance(v, dict):
            out: dict[str, Any] = {}
            for k, x in v.items():
                w = walk(x)
                if w is None and isinstance(x, str):
                    continue
                out[k] = w
            return out
        return v

    return walk(value), found
