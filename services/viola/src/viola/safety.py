"""Sicherheits-Agent: erkennt Krisen, Minderjährigkeit, Gewalt und Belästigung.

Zwei Stufen wie beim Art.-9-Filter:
- ``SafetyDetector`` (Regeln) prüft jeden Beitrag der Person sofort, damit Viola im selben Zug reagieren kann
  (Krisen-Leitfaden, Grenze setzen, Gespräch beenden).
- ``SafetyAgent`` (Sprachmodell) liest nach dem Gespräch alle Beiträge der Person und meldet, was die Regeln
  übersehen haben. Ergebnis: Einträge in ``safety.safety_flags`` über die Agent-Function, ohne Freitext.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from viola.domain import SafetyKind, Severity, Turn
from viola.llm.base import ChatModel, JsonRequest, LlmUnavailable, Usage
from viola.prompts import load_prompt


@dataclass(frozen=True, slots=True)
class SafetyHit:
    kind: SafetyKind
    severity: Severity
    rule: str


@dataclass(frozen=True, slots=True)
class _Rule:
    name: str
    kind: SafetyKind
    severity: Severity
    regex: re.Pattern[str]


def _r(pattern: str) -> re.Pattern[str]:
    return re.compile(pattern, re.IGNORECASE)


_AGE_WORDS = "zwölf|dreizehn|vierzehn|fünfzehn|sechzehn|siebzehn"

RULES: tuple[_Rule, ...] = (
    # Krise: ausdrückliche Absicht → akut, Gedanken und Hoffnungslosigkeit → hoch
    _Rule(
        "suizid_absicht",
        SafetyKind.KRISE,
        Severity.AKUT,
        _r(
            r"\b(ich (will|werde|möchte) (mich|mir) (umbringen|töten|das leben nehmen|etwas antun))"
            r"|\b(mich|mir) (heute|jetzt|bald) (umbringen|das leben nehmen)"
            r"|\bhabe? (schon )?(tabletten|einen strick|einen plan)\b.{0,40}\b(sterben|umbringen|ende)"
        ),
    ),
    _Rule(
        "suizid_gedanken",
        SafetyKind.KRISE,
        Severity.HOCH,
        _r(
            r"\b(suizid\w*|selbstmord\w*|lebensmüde|nicht mehr leben|will sterben|möchte sterben|"
            r"wäre lieber tot|alles beenden|keinen sinn mehr|kein ausweg|(mich|mir) (etwas|was) antun)\b"
        ),
    ),
    _Rule(
        "selbstverletzung",
        SafetyKind.KRISE,
        Severity.HOCH,
        _r(r"\b(ritze mich|mich ritzen|selbstverletz\w*|verletze mich selbst|schneide mich)\b"),
    ),
    # Minderjährig
    _Rule(
        "alter_unter_18",
        SafetyKind.MINDERJAEHRIG,
        Severity.HOCH,
        _r(
            rf"\bich bin (erst |gerade |noch )?(1[0-7]|{_AGE_WORDS})"
            r"(?!\s+(jahre?\s+(verheiratet|zusammen|dabei|lang|her|getrennt)|monate|kilo|uhr|minuten|km))( jahre)?( alt)?\b"
        ),
    ),
    _Rule(
        "minderjaehrig_wort",
        SafetyKind.MINDERJAEHRIG,
        Severity.HOCH,
        _r(r"\b(noch minderjährig|nicht volljährig|bin minderjährig|noch keine 18|noch nicht 18|werde erst 18)\b"),
    ),
    _Rule(
        "schulklasse",
        SafetyKind.MINDERJAEHRIG,
        Severity.MITTEL,
        _r(
            r"\b(gehe|bin) (in die|in der) ([5-9]|1[0-2]|fünfte|sechste|siebte|achte|neunte|zehnte|elfte|zwölfte)\.? klasse\b"
            r"|\bmeine (eltern|mama|mutter|papa|vater) (erlauben|erlaubt|dürfen|darf) (das|es) nicht\b"
        ),
    ),
    # Gewalt und Bedrohung
    _Rule(
        "bedrohung",
        SafetyKind.GEWALT,
        Severity.HOCH,
        _r(
            r"\b(ich (bring|bringe|werde) (dich|sie|ihn|euch) (um|umbringen|abstechen|erschießen|fertigmachen))"
            r"|\b(abstechen|erschießen|abknallen)\b"
        ),
    ),
    _Rule(
        "gewalt_erlebt",
        SafetyKind.GEWALT,
        Severity.HOCH,
        _r(r"\b(vergewaltig\w*|er schlägt mich|sie schlägt mich|werde geschlagen|habe angst vor (ihm|ihr|meinem|meiner))\b"),
    ),
    _Rule("waffe", SafetyKind.GEWALT, Severity.MITTEL, _r(r"\b(waffe|messer dabei|pistole)\b")),
    # Belästigung von Viola
    _Rule(
        "beleidigung",
        SafetyKind.BELAESTIGUNG,
        Severity.MITTEL,
        _r(
            r"\b(schlampe|fotze|hure|wichser|arschloch|missgeburt|hurensohn|drecksau|dumme kuh|blöde kuh|"
            r"halt die fresse|halt's maul|halts maul|verpiss dich|fick dich)\b"
        ),
    ),
    _Rule(
        "sexuell_uebergriffig",
        SafetyKind.BELAESTIGUNG,
        Severity.MITTEL,
        _r(
            r"\b(zieh dich aus|bist du nackt|nacktbild\w*|sex mit dir|titten|geil auf dich|blas mir|ficken|"
            r"was hast du an|stöhn\w*)\b"
        ),
    ),
)


class SafetyDetector:
    """Regelbasierte Prüfung eines einzelnen Beitrags der Person (schnell, ohne Netz)."""

    def scan(self, text: str) -> list[SafetyHit]:
        hits: dict[SafetyKind, SafetyHit] = {}
        for rule in RULES:
            if rule.regex.search(text):
                current = hits.get(rule.kind)
                if current is None or rule.severity.rank > current.severity.rank:
                    hits[rule.kind] = SafetyHit(rule.kind, rule.severity, rule.name)
        return sorted(hits.values(), key=lambda h: -h.severity.rank)


SAFETY_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "flags": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "kind": {"type": "string", "enum": [k.value for k in SafetyKind]},
                    "severity": {"type": "string", "enum": [s.value for s in Severity]},
                    "turn_index": {"type": "integer"},
                },
                "required": ["kind", "severity", "turn_index"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["flags"],
    "additionalProperties": False,
}


@dataclass(frozen=True, slots=True)
class AgentFlag:
    kind: SafetyKind
    severity: Severity
    turn_index: int


class SafetyAgent:
    """Gegenprüfung nach dem Gespräch durch das Sprachmodell (Modell aus analysis.llm_model_id)."""

    def __init__(self, model: ChatModel, model_id: str, effort: str = "medium") -> None:
        self._model = model
        self._model_id = model_id
        self._effort = effort
        self.usage = Usage()

    async def review(self, turns: list[Turn]) -> list[AgentFlag]:
        person = [(i, t.text) for i, t in enumerate(turns) if t.role == "person"]
        if not person:
            return []
        listing = "\n".join(f"[{i}] {text}" for i, text in person)
        try:
            result = await self._model.complete_json(
                JsonRequest(
                    model=self._model_id,
                    system=load_prompt("sicherheit"),
                    user=f"<beitraege>\n{listing}\n</beitraege>",
                    schema=SAFETY_SCHEMA,
                    max_tokens=4000,
                    effort=self._effort,
                )
            )
        except LlmUnavailable:
            return []
        self.usage.add(result.usage)
        if not result.data:
            return []
        valid_indices = {i for i, _ in person}
        flags: list[AgentFlag] = []
        for f in result.data.get("flags", []):
            try:
                flag = AgentFlag(SafetyKind(f["kind"]), Severity(f["severity"]), int(f["turn_index"]))
            except (KeyError, ValueError, TypeError):
                continue
            if flag.turn_index in valid_indices:
                flags.append(flag)
        return flags
