"""Prüf-Agent (PLAN 2.3 Nr. 5): Notizen je Vorschlag für Benn, plus deterministischer Art.-9-Filter.

Reihenfolge je Vorschlag:
1. Text „warum Sie beide“ glätten (Ausrufezeichen) und deterministisch prüfen (art9.check_reasons).
2. Prüf-Agent (LLM) schreibt Plausibilität, Risiken, Art.-9-Verdacht und Empfehlung.
3. Schlägt Schritt 1 an oder meldet der Agent einen Art.-9-Verdacht, wird der Text durch einen neutralen Ersatztext
   ersetzt und das in den Notizen vermerkt. Gespeichert wird nur der geprüfte Text.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any

from ..art9 import FALLBACK_REASONS, check_reasons, polish_reasons
from .client import LLMClient
from .evaluate import LLMStats, canonical
from .prompts import REVIEW_SCHEMA, REVIEW_SYSTEM, REVIEW_USER_PREFIX, REVIEW_VERSION

REVIEW_MAX_TOKENS = 3000


@dataclass
class ReviewInput:
    key: Any
    person_a: dict[str, Any]
    person_b: dict[str, Any]
    names: list[str | None]
    mode: str
    scores: dict[str, Any]
    rationale: str | None
    concerns: list[str]
    reasons_draft: str | None
    venue: dict[str, Any]
    hints: list[str] = field(default_factory=list)


@dataclass
class ReviewOutcome:
    reasons_text: str
    reasons_clean: bool
    notes: dict[str, Any]


def review_pairings(
    client: LLMClient | None,
    items: list[ReviewInput],
    *,
    effort: str,
    concurrency: int,
    stats: LLMStats,
) -> dict[Any, ReviewOutcome]:
    def work(item: ReviewInput) -> tuple[Any, ReviewOutcome, Any]:
        draft = polish_reasons(item.reasons_draft or "")
        check = check_reasons(draft, item.names)
        agent: dict[str, Any] | None = None
        agent_error: str | None = None
        usage = None
        if client is not None:
            payload = {
                "person_a": item.person_a,
                "person_b": item.person_b,
                "scores": item.scores,
                "begruendung": item.rationale or "",
                "bedenken": item.concerns,
                "warum_sie_beide": draft,
                "lokal": item.venue,
                "hinweise": item.hints,
            }
            resp = client.complete_json(
                system=REVIEW_SYSTEM,
                user=REVIEW_USER_PREFIX + canonical(payload),
                schema=REVIEW_SCHEMA,
                max_tokens=REVIEW_MAX_TOKENS,
                effort=effort,
            )
            usage = resp.usage
            if resp.data is not None and isinstance(resp.data.get("art9_verdacht"), bool):
                agent = {
                    "plausibel": bool(resp.data.get("plausibel")),
                    "einschaetzung": str(resp.data.get("einschaetzung") or "")[:1200],
                    "risiken": [str(r) for r in resp.data.get("risiken") or []][:10],
                    "art9_verdacht": bool(resp.data.get("art9_verdacht")),
                    "art9_hinweis": str(resp.data.get("art9_hinweis") or "")[:400],
                    "empfehlung": str(resp.data.get("empfehlung") or "genauer_pruefen"),
                }
            else:
                agent_error = resp.error or "schema"

        replace = (not check.ok) or bool(agent and agent["art9_verdacht"])
        text = FALLBACK_REASONS.get(item.mode, FALLBACK_REASONS["sie"]) if replace else draft
        hints = list(item.hints)
        if replace:
            hints.append("Text „warum Sie beide“ durch neutralen Ersatztext ersetzt.")
        if client is not None and agent is None:
            hints.append("Prüf-Agent nicht erreichbar; nur Regeln geprüft.")
        notes = {
            "version": REVIEW_VERSION,
            "agent": agent,
            "agent_fehler": agent_error,
            "art9_filter": {"ok": check.ok, "treffer": check.hits},
            "ersatztext_verwendet": replace,
            "hinweise": hints,
            "empfehlung": (agent or {}).get("empfehlung") or ("genauer_pruefen" if (replace or item.hints) else None),
        }
        return item.key, ReviewOutcome(text, not replace, notes), usage

    out: dict[Any, ReviewOutcome] = {}
    if not items:
        return out
    with ThreadPoolExecutor(max_workers=max(1, concurrency)) as pool:
        for key, outcome, usage in pool.map(work, items):
            out[key] = outcome
            if client is not None:
                stats.review_calls += 1
                if usage is not None:
                    stats.usage.add(usage)
                if outcome.notes["agent"] is None:
                    stats.review_errors += 1
    return out
