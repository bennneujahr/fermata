"""Werkzeuge für Viola (höchstens fünf, strenge JSON-Schemas, ``tool_choice: auto``).

Die Schemas sind ``strict`` (``additionalProperties: false``, alle Felder Pflicht). Zusätzlich prüft
:func:`validate` jede Eingabe noch einmal selbst – strenge Schemas garantieren die Form, nicht den Inhalt
(Länge, Art.-9-Inhalte). Die Reihenfolge der Liste ist fest: Sie ist Teil des gecachten Präfixes.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from viola.domain import EndReason, SafetyKind, Severity

FACT_CATEGORIES = (
    "persoenlichkeit",
    "werte",
    "wuensche",
    "dealbreaker",
    "lebensumstaende",
    "fahrbereitschaft",
    "zeiten",
    "abend",
)

NOTE_PROFILE_FACT: dict[str, Any] = {
    "name": "note_profile_fact",
    "description": (
        "Notiert eine kurze Tatsache über die Person für ihr Profil, sobald sie etwas Neues und Relevantes erzählt hat "
        "(Persönlichkeit, Werte, Wünsche an das Gegenüber, Deal-Breaker, Lebensumstände, Fahrbereitschaft, freie Zeiten, "
        "bei Nachbesprechungen der Abend). Formuliere einen sachlichen Satz in der dritten Person, geschlechtsneutral "
        "(„die Person“, „das Gegenüber“). Nie für geschützte Angaben wie Gesundheit, Religion, Politik, Herkunft, "
        "Sexualität, Geschlecht, Gewerkschaft oder Straftaten – solche Angaben werden nicht notiert. "
        "Rufe das Werkzeug am Ende deiner Antwort auf, nachdem du der Person geantwortet hast."
    ),
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {
            "category": {"type": "string", "enum": list(FACT_CATEGORIES)},
            "fact": {"type": "string", "description": "Ein Satz, höchstens 200 Zeichen."},
            "importance": {"type": "integer", "enum": [1, 2, 3], "description": "1 = Nebensache, 3 = sehr wichtig"},
        },
        "required": ["category", "fact", "importance"],
        "additionalProperties": False,
    },
}

PROPOSE_SUMMARY: dict[str, Any] = {
    "name": "propose_summary",
    "description": (
        "Legt der Person eine Zusammenfassung zum Bestätigen vor, wenn die Themen besprochen sind oder die Zeit "
        "knapp wird. Die Zusammenfassung ist in der Anrede des Gesprächs geschrieben (Sie oder Du), drei bis "
        "sechs Sätze, geschlechtsneutral, ohne geschützte Angaben. Sage der Person vorher in ein bis zwei Sätzen, "
        "was du zusammengefasst hast, und frage, ob es so stimmt. is_partial ist true, wenn das Gespräch in "
        "einer weiteren Sitzung fortgesetzt werden soll."
    ),
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {
            "summary": {"type": "string", "description": "Höchstens 1200 Zeichen."},
            "is_partial": {"type": "boolean"},
        },
        "required": ["summary", "is_partial"],
        "additionalProperties": False,
    },
}

FLAG_SAFETY: dict[str, Any] = {
    "name": "flag_safety",
    "description": (
        "Meldet Benn still einen Sicherheitsfall: krise (Suizidgedanken, akute Not), minderjaehrig (die Person ist "
        "jünger als 18), gewalt (Bedrohung oder Gewalt), belaestigung (Beleidigung, sexuelle Übergriffigkeit), "
        "sonstiges. Kein Freitext; Benn liest bei Bedarf das Transkript. Rufe es zusätzlich zu deiner ruhigen Antwort auf."
    ),
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {
            "kind": {"type": "string", "enum": [k.value for k in SafetyKind]},
            "severity": {"type": "string", "enum": [s.value for s in Severity]},
        },
        "required": ["kind", "severity"],
        "additionalProperties": False,
    },
}

END_CONVERSATION: dict[str, Any] = {
    "name": "end_conversation",
    "description": (
        "Beendet das Gespräch, nachdem du dich verabschiedet hast. Gründe: fertig (alles besprochen und "
        "bestätigt), person_beendet (die Person möchte aufhören), zeitlimit, technik, krise, minderjaehrig, missbrauch."
    ),
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {"reason": {"type": "string", "enum": [r.value for r in EndReason]}},
        "required": ["reason"],
        "additionalProperties": False,
    },
}

SWITCH_TO_TEXT: dict[str, Any] = {
    "name": "switch_to_text",
    "description": (
        "Wechselt vom Sprechen zum Schreiben („Text statt Stimme“), wenn die Person lieber schreiben möchte oder "
        "die Verbindung schlecht ist. Sage vorher, dass es im Textfeld weitergeht."
    ),
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {"reason": {"type": "string", "enum": ["wunsch_der_person", "technik"]}},
        "required": ["reason"],
        "additionalProperties": False,
    },
}

ALL_TOOLS: tuple[dict[str, Any], ...] = (NOTE_PROFILE_FACT, PROPOSE_SUMMARY, FLAG_SAFETY, END_CONVERSATION, SWITCH_TO_TEXT)
TOOL_NAMES = tuple(t["name"] for t in ALL_TOOLS)

LIMITS = {"fact": 200, "summary": 1200}


class ToolInputError(ValueError):
    """Ungültige Werkzeug-Eingabe; der Text geht als ``is_error``-Ergebnis an das Modell zurück."""


@dataclass(frozen=True, slots=True)
class ValidatedCall:
    name: str
    args: dict[str, Any]


def tools_for(voice: bool) -> list[dict[str, Any]]:
    """Werkzeuge für die Anfrage. Im Textmodus gibt es nichts zu wechseln, die Liste bleibt trotzdem gleich
    (eine wechselnde Werkzeugliste würde den Cache und die thinking-Blöcke ungültig machen)."""
    return [dict(t) for t in ALL_TOOLS]


def _check_schema(schema: dict[str, Any], args: dict[str, Any]) -> None:
    props: dict[str, Any] = schema["properties"]
    missing = [k for k in schema["required"] if k not in args]
    if missing:
        raise ToolInputError(f"Pflichtfeld fehlt: {', '.join(missing)}")
    extra = [k for k in args if k not in props]
    if extra:
        raise ToolInputError(f"Unbekanntes Feld: {', '.join(extra)}")
    for key, spec in props.items():
        value = args[key]
        expected = spec["type"]
        if expected == "string" and not isinstance(value, str):
            raise ToolInputError(f"{key} muss Text sein")
        if expected == "integer" and (not isinstance(value, int) or isinstance(value, bool)):
            raise ToolInputError(f"{key} muss eine ganze Zahl sein")
        if expected == "boolean" and not isinstance(value, bool):
            raise ToolInputError(f"{key} muss true oder false sein")
        if "enum" in spec and value not in spec["enum"]:
            raise ToolInputError(f"{key} hat einen unerlaubten Wert")


def validate(name: str, args: Any) -> ValidatedCall:
    """Prüft Name und Eingabe. Akzeptiert Namen mit abweichender Groß-/Kleinschreibung (Sonnet-5.5-Hinweis)."""
    canonical = next((n for n in TOOL_NAMES if n.lower() == str(name).lower()), None)
    if canonical is None:
        raise ToolInputError(f"Unbekanntes Werkzeug {name!r}. Erlaubt: {', '.join(TOOL_NAMES)}")
    if not isinstance(args, dict):
        raise ToolInputError("Eingabe muss ein JSON-Objekt sein")
    schema = next(t for t in ALL_TOOLS if t["name"] == canonical)["input_schema"]
    _check_schema(schema, args)
    clean = dict(args)
    for key, limit in LIMITS.items():
        if key in clean:
            text = str(clean[key]).strip()
            if not text:
                raise ToolInputError(f"{key} ist leer")
            clean[key] = text[:limit]
    return ValidatedCall(name=canonical, args=clean)
