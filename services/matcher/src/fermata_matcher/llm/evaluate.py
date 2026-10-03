"""LLM-Bewertung je Paar mit Wiederverwendung (PLAN 5.10).

Eingaben an das Modell sind nur die bereinigten Zusammenfassungen und strukturierten Felder (ohne Namen, ohne PLZ,
ohne Art.-9-Inhalte, Geschlechtshinweise neutralisiert) und die gerundete Entfernung. input_hash =
sha256(Rubrik-Version + Modell + beide Eingaben). Gibt es in einem früheren Lauf eine Bewertung mit demselben
Hash, wird sie übernommen statt neu bezahlt.
"""

from __future__ import annotations

import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any

from ..art9 import SanitizeStats, sanitize_structure, sanitize_text
from ..models import Person
from .client import LLMClient, LLMUsage
from .prompts import RUBRIC_SCHEMA, RUBRIC_SYSTEM, RUBRIC_USER_PREFIX, RUBRIC_VERSION

RUBRIC_MAX_TOKENS = 4000  # Denken zählt mit; Antwort selbst ist kurz


def person_input(p: Person, stats: SanitizeStats | None = None) -> dict[str, Any]:
    """Alles, was das Modell über eine Person erfährt. Deterministisch (sortiert), damit der Hash stabil ist."""
    stats = stats if stats is not None else SanitizeStats()
    names = [p.display_name]
    summary, s = sanitize_text(p.summary_text, names)
    stats.merge(s)
    vp = p.values_profile if isinstance(p.values_profile, dict) else {}
    rest = {k: v for k, v in vp.items() if k not in ("werte", "gegenueber")}
    wants = []
    for w in sorted(p.wants, key=lambda w: (w.category, w.text)):
        text, s = sanitize_text(w.text, names)
        stats.merge(s)
        if text:
            wants.append({"kategorie": w.category, "text": text, "wichtigkeit": w.importance})
    others = []
    for d in sorted(p.dealbreakers, key=lambda d: (d.kind, d.text or "")):
        if d.kind == "sonstiges" and d.text:
            text, s = sanitize_text(d.text, names)
            stats.merge(s)
            if text:
                others.append(text)
    data: dict[str, Any] = {
        "alter": p.age,
        "zusammenfassung": summary,
        "persoenlichkeit": sanitize_structure(p.personality or {}, names, stats),
        "werte": sanitize_structure(vp.get("werte") or {}, names, stats),
        "wuensche_an_gegenueber": sanitize_structure(vp.get("gegenueber") or {}, names, stats),
        "lebensumstaende": sanitize_structure(p.life or {}, names, stats),
        "rauchen": p.smoking,
        "hat_kinder": p.has_children,
        "kinderwunsch": p.wants_children,
        "sprachen": sorted(p.languages or ["de"]),
        "wuensche": wants,
        "weitere_ausschluesse": others,
    }
    if rest:
        data["weitere_werteangaben"] = sanitize_structure(rest, names, stats)
    return data


def pair_payload(a_input: dict[str, Any], b_input: dict[str, Any], distance_km: float, mode: str) -> dict[str, Any]:
    return {
        "person_a": a_input,
        "person_b": b_input,
        "paar": {"entfernung_km_gerundet": int(round(distance_km / 5.0) * 5), "anrede": mode},
    }


def canonical(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def input_hash(payload: dict[str, Any], model_id: str, rubric_version: str = RUBRIC_VERSION) -> str:
    raw = canonical({"rubrik": rubric_version, "modell": model_id, "eingabe": payload})
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


@dataclass
class PairEvaluation:
    input_hash: str
    score: float | None = None
    rationale: str | None = None
    concerns: list[str] = field(default_factory=list)
    reasons_draft: str | None = None
    reused: bool = False
    error: str | None = None


@dataclass
class LLMStats:
    requested: int = 0
    calls: int = 0
    reused: int = 0
    errors: int = 0
    refusals: int = 0
    review_calls: int = 0
    review_errors: int = 0
    usage: LLMUsage = field(default_factory=LLMUsage)
    error_kinds: dict[str, int] = field(default_factory=dict)

    def note_error(self, kind: str) -> None:
        key = kind.split(":")[0]
        self.error_kinds[key] = self.error_kinds.get(key, 0) + 1


def _parse_rubric(data: dict[str, Any]) -> tuple[float, str, list[str], str]:
    score = float(data["score"])
    score = 0.0 if score < 0 else 1.0 if score > 1 else score
    concerns = [str(c) for c in data.get("bedenken") or []][:8]
    return score, str(data.get("begruendung") or "")[:1200], concerns, str(data.get("warum_sie_beide") or "")


def evaluate_pairs(
    client: LLMClient,
    payloads: dict[Any, dict[str, Any]],
    prior: dict[str, dict[str, Any]],
    *,
    effort: str,
    concurrency: int,
    stats: LLMStats,
) -> dict[Any, PairEvaluation]:
    """Bewertet alle Paare. `prior` bildet input_hash → frühere Bewertung ab (llm_score, llm_rationale, reasons_draft)."""
    results: dict[Any, PairEvaluation] = {}
    todo: list[tuple[Any, str, dict[str, Any]]] = []
    for key, payload in payloads.items():
        h = input_hash(payload, client.model_id)
        stats.requested += 1
        old = prior.get(h)
        if old is not None and old.get("llm_score") is not None:
            stats.reused += 1
            results[key] = PairEvaluation(
                input_hash=h,
                score=float(old["llm_score"]),
                rationale=old.get("llm_rationale"),
                concerns=list(old.get("concerns") or []),
                reasons_draft=old.get("reasons_draft"),
                reused=True,
            )
        else:
            todo.append((key, h, payload))

    def work(item: tuple[Any, str, dict[str, Any]]) -> tuple[Any, PairEvaluation, LLMUsage]:
        key, h, payload = item
        resp = client.complete_json(
            system=RUBRIC_SYSTEM,
            user=RUBRIC_USER_PREFIX + canonical(payload),
            schema=RUBRIC_SCHEMA,
            max_tokens=RUBRIC_MAX_TOKENS,
            effort=effort,
        )
        if resp.data is None:
            return key, PairEvaluation(input_hash=h, error=resp.error or "unbekannt"), resp.usage
        try:
            score, rationale, concerns, reasons = _parse_rubric(resp.data)
        except (KeyError, TypeError, ValueError):
            return key, PairEvaluation(input_hash=h, error="schema"), resp.usage
        return key, PairEvaluation(h, score, rationale, concerns, reasons), resp.usage

    if todo:
        with ThreadPoolExecutor(max_workers=max(1, concurrency)) as pool:
            for key, ev, usage in pool.map(work, todo):
                stats.calls += 1
                stats.usage.add(usage)
                if ev.error:
                    stats.errors += 1
                    stats.note_error(ev.error)
                    if ev.error.startswith("refusal"):
                        stats.refusals += 1
                results[key] = ev
    return results
