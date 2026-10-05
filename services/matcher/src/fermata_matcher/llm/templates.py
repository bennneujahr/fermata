"""Regelbasierter Text „warum Sie beide“ aus gemeinsamen Interessen und Werten.

Wird genutzt, wenn kein Sprachmodell läuft (matching.llm_enabled = false oder Ausfall), und von der Attrappe in
Tests und Simulation. Die Bausteine sind allgemein gehalten und verraten nichts, was nur eine Person betrifft.
"""

from __future__ import annotations

from typing import Any

VALUE_LABELS: dict[str, str] = {
    "familie": "Familie",
    "partnerschaft": "eine verlässliche Partnerschaft",
    "freundschaft": "Freundschaften",
    "freiheit": "Freiraum",
    "sicherheit": "Beständigkeit",
    "abenteuer": "Neues auszuprobieren",
    "tradition": "Bewährtes",
    "karriere": "berufliche Ziele",
    "gemeinschaft": "Gemeinschaft",
    "natur": "die Natur",
    "kultur": "Kultur",
    "nachhaltigkeit": "ein nachhaltiger Alltag",
    "bildung": "Neugier und Lernen",
    "ehrlichkeit": "Ehrlichkeit",
    "verlaesslichkeit": "Verlässlichkeit",
    "bewegung": "Bewegung",
    "humor": "Humor",
}


def _shared_interests(a: dict[str, Any], b: dict[str, Any]) -> list[str]:
    ia = (a.get("lebensumstaende") or {}).get("interessen") or []
    ib = (b.get("lebensumstaende") or {}).get("interessen") or []
    lower_b = {str(x).strip().lower() for x in ib}
    out: list[str] = []
    for x in ia:
        s = str(x).strip()
        if s and s.lower() in lower_b and s not in out:
            out.append(s)
    return out


def _shared_value(a: dict[str, Any], b: dict[str, Any]) -> str | None:
    wa, wb = a.get("werte") or {}, b.get("werte") or {}
    best: tuple[float, str] | None = None
    for k in sorted(set(wa) & set(wb)):
        try:
            low = min(float(wa[k]), float(wb[k]))
        except (TypeError, ValueError):
            continue
        if low >= 0.7 and (best is None or low > best[0]):
            best = (low, k)
    return None if best is None else VALUE_LABELS.get(best[1], best[1].replace("_", " "))


def _capitalize_activity(x: str) -> str:
    return x[:1].upper() + x[1:]


def template_reasons(person_a: dict[str, Any], person_b: dict[str, Any], mode: str) -> str:
    interests = [_capitalize_activity(x) for x in _shared_interests(person_a, person_b)[:2]]
    value = _shared_value(person_a, person_b)
    if mode == "du":
        lead, dat, verb_like, verb_have = "Ihr beide", "euch beiden", "mögt", "habt"
    elif mode == "sie":
        lead, dat, verb_like, verb_have = "Sie beide", "Ihnen beiden", "mögen", "haben"
    else:
        lead, dat, verb_like, verb_have = "Beide", "beiden", "mögen", "haben"

    sentences: list[str] = []
    if interests:
        sentences.append(f"{lead} {verb_like} {' und '.join(interests)}.")
    if value:
        sentences.append(f"Außerdem ist {dat} {value} wichtig.")
    if not sentences:
        sentences.append(f"{lead} {verb_have} ähnliche Vorstellungen davon, was im Umgang miteinander zählt.")
    if mode == "du":
        sentences.append("Das gibt euch für den ersten Abend viel Gesprächsstoff.")
    elif mode == "sie":
        sentences.append("Das gibt Ihnen für den ersten Abend viel Gesprächsstoff.")
    else:
        sentences.append("Das gibt viel Gesprächsstoff für einen ersten Abend.")
    return " ".join(sentences)
