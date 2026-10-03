"""Hintergrund-Agent: Transkript → strukturiertes Profil + Entwurf der Zusammenfassung (in der Anrede der Person).

Ablauf nach jedem Gespräch (``Conversation.finish``):
1. Das Modell (``analysis.llm_model_id``) erstellt mit festem JSON-Schema das vollständige, aktuelle Profil.
2. ``Art9Guard`` entfernt geschützte Inhalte: erst Regeln, dann Gegenprüfung durch das Modell. Was die
   Gegenprüfung meldet, fällt ebenfalls weg. Fällt die Gegenprüfung aus, gilt im Zweifel: nur Regeln, aber
   zusätzlich alle Freitexte außer Zusammenfassung und Wünschen werden verworfen (sparsame Variante).
3. Werte werden geprüft und begrenzt (Alter 18–99, Fahrzeit 5–180 Minuten, Gewichte ergeben 1).
Gespeichert wird über die Agent-Function, die Art.-9-Inhalte in SQL noch einmal ablehnt.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from viola import art9
from viola.domain import AddressForm, Kind, Turn
from viola.llm.base import ChatModel, JsonRequest, LlmUnavailable, Usage
from viola.prompts import load_prompt

WANT_CATEGORIES = ["persoenlichkeit", "werte", "lebensstil", "beziehung", "sonstiges"]
DEALBREAKER_KINDS = ["raucht", "hat_kinder", "will_kinder", "will_keine_kinder", "entfernung", "alter", "sonstiges"]
TRAVEL_MODES = ["auto", "oepnv", "rad", "zu_fuss"]
WEIGHT_KEYS = ["werte", "wuensche", "lebensumstaende", "persoenlichkeit", "zeiten"]
WEEKDAYS = ["mo", "di", "mi", "do", "fr", "sa", "so"]


def _nullable(schema: dict[str, Any]) -> dict[str, Any]:
    return {"anyOf": [schema, {"type": "null"}]}


_STR_LIST = {"type": "array", "items": {"type": "string"}}

ANALYSIS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "personality": {
            "type": "object",
            "properties": {"traits": _STR_LIST, "interests": _STR_LIST, "notes": {"type": "string"}},
            "required": ["traits", "interests", "notes"],
            "additionalProperties": False,
        },
        "values_profile": {
            "type": "object",
            "properties": {"values": _STR_LIST, "relationship": _STR_LIST, "notes": {"type": "string"}},
            "required": ["values", "relationship", "notes"],
            "additionalProperties": False,
        },
        "life_circumstances": {
            "type": "object",
            "properties": {
                "work": _nullable({"type": "string"}),
                "living": _nullable({"type": "string"}),
                "family": _nullable({"type": "string"}),
                "free_evenings": {"type": "array", "items": {"type": "string", "enum": WEEKDAYS}},
                "free_time_notes": _nullable({"type": "string"}),
            },
            "required": ["work", "living", "family", "free_evenings", "free_time_notes"],
            "additionalProperties": False,
        },
        "age_min": _nullable({"type": "integer"}),
        "age_max": _nullable({"type": "integer"}),
        "travel_modes": {"type": "array", "items": {"type": "string", "enum": TRAVEL_MODES}},
        "travel_max_minutes": _nullable({"type": "integer"}),
        "travel_max_km": _nullable({"type": "integer"}),
        "smoking": _nullable({"type": "string", "enum": ["nein", "gelegentlich", "ja"]}),
        "has_children": _nullable({"type": "boolean"}),
        "wants_children": _nullable({"type": "string", "enum": ["ja", "nein", "offen", "vielleicht"]}),
        "wants": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "category": {"type": "string", "enum": WANT_CATEGORIES},
                    "text": {"type": "string"},
                    "importance": {"type": "integer", "enum": [1, 2, 3]},
                },
                "required": ["category", "text", "importance"],
                "additionalProperties": False,
            },
        },
        "dealbreakers": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"kind": {"type": "string", "enum": DEALBREAKER_KINDS}, "text": {"type": "string"}},
                "required": ["kind", "text"],
                "additionalProperties": False,
            },
        },
        "personal_weights": _nullable(
            {
                "type": "object",
                "properties": {k: {"type": "number"} for k in WEIGHT_KEYS},
                "required": WEIGHT_KEYS,
                "additionalProperties": False,
            }
        ),
    },
    "required": [
        "summary",
        "personality",
        "values_profile",
        "life_circumstances",
        "age_min",
        "age_max",
        "travel_modes",
        "travel_max_minutes",
        "travel_max_km",
        "smoking",
        "has_children",
        "wants_children",
        "wants",
        "dealbreakers",
        "personal_weights",
    ],
    "additionalProperties": False,
}

ART9_CHECK_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "flagged": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"id": {"type": "integer"}, "category": {"type": "string"}},
                "required": ["id", "category"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["flagged"],
    "additionalProperties": False,
}


@dataclass
class GuardReport:
    rule_categories: set[str] = field(default_factory=set)
    model_flagged: int = 0
    model_checked: bool = False


class Art9Guard:
    """Zweistufige Art.-9-Prüfung für Texte, die gespeichert werden sollen."""

    def __init__(self, model: ChatModel | None, model_id: str, effort: str = "low") -> None:
        self._model = model
        self._model_id = model_id
        self._effort = effort
        self.usage = Usage()

    async def model_flags(self, texts: list[str]) -> set[int] | None:
        """Indizes der Texte, die das Modell als geschützt meldet. None = Gegenprüfung nicht möglich."""
        if self._model is None or not texts:
            return set() if not texts else None
        listing = "\n".join(f"[{i}] {t}" for i, t in enumerate(texts))
        try:
            result = await self._model.complete_json(
                JsonRequest(
                    model=self._model_id,
                    system=load_prompt("art9_pruefung"),
                    user=f"<texte>\n{listing}\n</texte>",
                    schema=ART9_CHECK_SCHEMA,
                    max_tokens=4000,
                    effort=self._effort,
                )
            )
        except LlmUnavailable:
            return None
        self.usage.add(result.usage)
        if result.data is None:
            return None
        return {int(f["id"]) for f in result.data.get("flagged", []) if isinstance(f.get("id"), int)}

    async def clean_summary(self, text: str, report: GuardReport | None = None) -> str:
        """Zusammenfassung: Sätze mit Treffern (Regeln oder Modell) entfernen."""
        rep = report or GuardReport()
        by_rules = art9.drop_sentences(text)
        rep.rule_categories |= by_rules.categories
        sentences = art9.split_sentences(by_rules.text)
        flagged = await self.model_flags(sentences)
        if flagged is None:
            return by_rules.text
        rep.model_checked = True
        rep.model_flagged += len(flagged)
        return " ".join(s for i, s in enumerate(sentences) if i not in flagged)


def _clamp_int(value: Any, lo: int, hi: int) -> int | None:
    if not isinstance(value, int) or isinstance(value, bool):
        return None
    return value if lo <= value <= hi else None


def sanitize_analysis(raw: dict[str, Any]) -> dict[str, Any]:
    """Prüft Werte und lässt Unbekanntes weg (fehlender Schlüssel = bisheriger Wert bleibt in der Datenbank)."""
    out: dict[str, Any] = {}
    for key in ("personality", "values_profile", "life_circumstances"):
        if isinstance(raw.get(key), dict):
            out[key] = raw[key]
    age_min = _clamp_int(raw.get("age_min"), 18, 99)
    age_max = _clamp_int(raw.get("age_max"), 18, 99)
    if age_min is not None and age_max is not None and age_min > age_max:
        age_min, age_max = age_max, age_min
    if age_min is not None:
        out["age_min"] = age_min
    if age_max is not None:
        out["age_max"] = age_max
    modes = [m for m in raw.get("travel_modes") or [] if m in TRAVEL_MODES]
    if modes:
        out["travel_modes"] = sorted(set(modes))
    minutes = _clamp_int(raw.get("travel_max_minutes"), 5, 180)
    if minutes is not None:
        out["travel_max_minutes"] = minutes
    km = _clamp_int(raw.get("travel_max_km"), 1, 300)
    if km is not None:
        out["travel_max_km"] = km
    if raw.get("smoking") in ("nein", "gelegentlich", "ja"):
        out["smoking"] = raw["smoking"]
    if isinstance(raw.get("has_children"), bool):
        out["has_children"] = raw["has_children"]
    if raw.get("wants_children") in ("ja", "nein", "offen", "vielleicht"):
        out["wants_children"] = raw["wants_children"]
    wants = []
    for w in raw.get("wants") or []:
        text = str(w.get("text", "")).strip()[:400]
        if w.get("category") in WANT_CATEGORIES and len(text) >= 2:
            imp = w.get("importance") if w.get("importance") in (1, 2, 3) else 2
            wants.append({"category": w["category"], "text": text, "importance": imp})
    out["wants"] = wants[:30]
    deal = []
    for d in raw.get("dealbreakers") or []:
        if d.get("kind") in DEALBREAKER_KINDS:
            deal.append({"kind": d["kind"], "text": (str(d.get("text") or "").strip()[:400] or None)})
    out["dealbreakers"] = deal[:15]
    weights = raw.get("personal_weights")
    if isinstance(weights, dict) and all(isinstance(weights.get(k), (int, float)) for k in WEIGHT_KEYS):
        vals = {k: max(0.0, float(weights[k])) for k in WEIGHT_KEYS}
        total = sum(vals.values())
        if total > 0:
            normalized = {k: round(v / total, 4) for k, v in vals.items()}
            drift = round(1 - sum(normalized.values()), 4)
            normalized[max(normalized, key=lambda k: normalized[k])] += drift
            out["personal_weights"] = normalized
    return out


@dataclass
class AnalysisResult:
    analysis: dict[str, Any] | None
    summary: str | None
    report: GuardReport
    usage: Usage


class AnalysisAgent:
    def __init__(self, model: ChatModel, model_id: str, effort: str = "medium", max_tokens: int = 16000) -> None:
        self._model = model
        self._model_id = model_id
        self._effort = effort
        self._max_tokens = max_tokens

    def build_input(
        self,
        *,
        turns: list[Turn],
        notes: list[dict[str, Any]],
        profile: dict[str, Any] | None,
        kind: Kind,
        address_form: AddressForm,
        proposed_summary: str | None,
    ) -> str:
        # Bereits gespeicherte Profilteile sind Art.-9-frei (SQL prüft beim Speichern); Transkript bleibt wörtlich,
        # damit das Modell Zusammenhänge versteht – die Ausgabe wird danach gefiltert.
        convo = "\n".join(f"{'Viola' if t.role == 'viola' else 'Person'}: {t.text}" for t in turns)
        parts = [
            f"<gespraechsart>{kind.value}</gespraechsart>",
            f"<anrede>{'Du' if address_form is AddressForm.DU else 'Sie'}</anrede>",
            f"<bisheriges_profil>{json.dumps(profile or {}, ensure_ascii=False)}</bisheriges_profil>",
            f"<notizen>{json.dumps(notes, ensure_ascii=False)}</notizen>",
        ]
        if proposed_summary:
            tag = "im_gespraech_vorgeschlagene_zusammenfassung"
            parts.append(f"<{tag}>{proposed_summary}</{tag}>")
        parts.append(f"<gespraech>\n{convo}\n</gespraech>")
        return "\n".join(parts)

    async def run(
        self,
        *,
        turns: list[Turn],
        notes: list[dict[str, Any]],
        profile: dict[str, Any] | None,
        kind: Kind,
        address_form: AddressForm,
        proposed_summary: str | None,
        guard: Art9Guard,
    ) -> AnalysisResult:
        report = GuardReport()
        usage = Usage()
        try:
            result = await self._model.complete_json(
                JsonRequest(
                    model=self._model_id,
                    system=load_prompt("analyse"),
                    user=self.build_input(
                        turns=turns,
                        notes=notes,
                        profile=profile,
                        kind=kind,
                        address_form=address_form,
                        proposed_summary=proposed_summary,
                    ),
                    schema=ANALYSIS_SCHEMA,
                    max_tokens=self._max_tokens,
                    effort=self._effort,
                )
            )
        except LlmUnavailable:
            return AnalysisResult(None, None, report, usage)
        usage.add(result.usage)
        if result.data is None:
            return AnalysisResult(None, None, report, usage)

        raw = dict(result.data)
        summary_raw = str(raw.pop("summary", "") or "")
        # Stufe 1: Regeln über die ganze Struktur
        cleaned, cats = art9.clean_strings(raw)
        report.rule_categories |= cats
        analysis = sanitize_analysis(cleaned)
        # Stufe 2: Gegenprüfung aller Freitexte durch das Modell
        texts, paths = _collect_texts(analysis)
        flagged = await guard.model_flags(texts)
        if flagged is None:
            # Sparsame Variante: ohne Gegenprüfung bleiben nur Wünsche und Deal-Breaker-Arten (geprüft per Regeln).
            for key in ("personality", "values_profile", "life_circumstances"):
                analysis.pop(key, None)
            for d in analysis.get("dealbreakers", []):
                d["text"] = None
        else:
            report.model_checked = True
            report.model_flagged += len(flagged)
            _remove_paths(analysis, [paths[i] for i in sorted(flagged) if i < len(paths)])
        summary = await guard.clean_summary(summary_raw, report) if summary_raw else None
        usage.add(guard.usage)
        if summary is not None and len(summary) < 20:
            summary = None
        return AnalysisResult(analysis, summary, report, usage)


def _collect_texts(analysis: dict[str, Any]) -> tuple[list[str], list[tuple[Any, ...]]]:
    texts: list[str] = []
    paths: list[tuple[Any, ...]] = []

    def walk(v: Any, path: tuple[Any, ...]) -> None:
        if isinstance(v, str) and v.strip():
            texts.append(v)
            paths.append(path)
        elif isinstance(v, dict):
            for k, x in v.items():
                walk(x, (*path, k))
        elif isinstance(v, list):
            for i, x in enumerate(v):
                walk(x, (*path, i))

    for key in ("personality", "values_profile", "life_circumstances", "wants", "dealbreakers"):
        if key in analysis:
            walk(analysis[key], (key,))
    return texts, paths


def _remove_paths(analysis: dict[str, Any], paths: list[tuple[Any, ...]]) -> None:
    """Entfernt gemeldete Texte.

    Wünsche fallen ganz weg, bei Deal-Breakern nur der Text, sonst das Feld bzw. der Listeneintrag.
    """
    drop_items: dict[tuple[Any, ...], set[int]] = {}
    for path in paths:
        if path[0] == "wants" and len(path) >= 2:
            drop_items.setdefault(("wants",), set()).add(int(path[1]))
        elif path[0] == "dealbreakers" and len(path) >= 2:
            analysis["dealbreakers"][int(path[1])]["text"] = None
        else:
            parent: Any = analysis
            for p in path[:-1]:
                parent = parent[p]
            last = path[-1]
            if isinstance(parent, list):
                drop_items.setdefault(path[:-1], set()).add(int(last))
            elif isinstance(parent, dict):
                parent[last] = None if last in ("work", "living", "family", "free_time_notes") else ""
    for container_path, indices in drop_items.items():
        parent = analysis
        for p in container_path[:-1]:
            parent = parent[p]
        key = container_path[-1]
        parent[key] = [x for i, x in enumerate(parent[key]) if i not in indices]
