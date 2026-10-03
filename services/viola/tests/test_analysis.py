"""Hintergrund-Agent: Profil aus dem Gespräch, Art.-9-Filter in zwei Stufen, Prüfung der Werte."""

from __future__ import annotations

from typing import Any

import pytest

from viola.analysis import ANALYSIS_SCHEMA, AnalysisAgent, Art9Guard, sanitize_analysis
from viola.domain import AddressForm, Kind, Turn
from viola.llm.base import JsonRequest, LlmUnavailable
from viola.llm.fake import FakeChatModel

TURNS = [Turn("viola", "Was macht Ihnen Freude?"), Turn("person", "Wandern und Kochen. Ich bin übrigens sehr gläubig.")]


def raw_analysis(**over: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "summary": "Sie sind ruhig. Ihr Glaube gibt Ihnen Halt. Sie wandern gern.",
        "personality": {"traits": ["ruhig", "gläubig"], "interests": ["Wandern", "Kochen"], "notes": "Wirkt gelassen."},
        "values_profile": {"values": ["Ehrlichkeit"], "relationship": ["Nähe"], "notes": ""},
        "life_circumstances": {"work": "Pflege", "living": "Schwerin", "family": None, "free_evenings": ["fr"], "free_time_notes": None},
        "age_min": 50, "age_max": 40, "travel_modes": ["auto", "flugzeug"], "travel_max_minutes": 500, "travel_max_km": 30,
        "smoking": "nein", "has_children": True, "wants_children": "nein",
        "wants": [{"category": "werte", "text": "Ehrlichkeit", "importance": 3}, {"category": "werte", "text": "Sollte evangelisch sein", "importance": 3}],
        "dealbreakers": [{"kind": "raucht", "text": "Raucht"}],
        "personal_weights": {"werte": 2, "wuensche": 2, "lebensumstaende": 1, "persoenlichkeit": 1, "zeiten": 1},
    }
    base.update(over)
    return base


def test_schema_is_strict_everywhere() -> None:
    def walk(s: dict[str, Any]) -> None:
        if "anyOf" in s:
            for x in s["anyOf"]:
                walk(x)
        if s.get("type") == "object":
            assert s["additionalProperties"] is False
            assert sorted(s["required"]) == sorted(s["properties"])
            for p in s["properties"].values():
                walk(p)
        if s.get("type") == "array":
            walk(s["items"])

    walk(ANALYSIS_SCHEMA)


def test_sanitize_clamps_and_normalizes() -> None:
    out = sanitize_analysis(raw_analysis())
    assert (out["age_min"], out["age_max"]) == (40, 50)
    assert out["travel_modes"] == ["auto"]
    assert "travel_max_minutes" not in out and out["travel_max_km"] == 30
    assert sum(out["personal_weights"].values()) == pytest.approx(1.0)
    assert out["personal_weights"]["werte"] == pytest.approx(2 / 7, abs=1e-3)
    assert sanitize_analysis({"age_min": 12, "smoking": "viel"}) == {"wants": [], "dealbreakers": []}


async def test_two_stage_art9_filter() -> None:
    def checker(req: JsonRequest) -> dict[str, Any]:
        # Gegenprüfung meldet „Pflege“ (könnte Pflegebedürftigkeit meinen) – im Zweifel weg.
        texts = [line.split("] ", 1)[1] for line in req.user.splitlines() if line.startswith("[")]
        return {"flagged": [{"id": i, "category": "gesundheit"} for i, t in enumerate(texts) if t == "Pflege"]}

    def summary_checker(req: JsonRequest) -> dict[str, Any]:
        texts = [line.split("] ", 1)[1] for line in req.user.splitlines() if line.startswith("[")]
        return {"flagged": [{"id": i, "category": "religion"} for i, t in enumerate(texts) if "Halt" in t]}

    model = FakeChatModel(json_replies=[raw_analysis(summary="Sie sind ruhig. Etwas Höheres gibt Ihnen Halt. Sie wandern gern."),
                                        checker, summary_checker])
    guard = Art9Guard(model, "eu.anthropic.claude-sonnet-5-5")
    result = await AnalysisAgent(model, "eu.anthropic.claude-sonnet-5-5").run(
        turns=TURNS, notes=[], profile=None, kind=Kind.ERSTGESPRAECH, address_form=AddressForm.SIE,
        proposed_summary=None, guard=guard)
    a = result.analysis
    assert a is not None
    assert a["personality"]["traits"] == ["ruhig"]
    assert [w["text"] for w in a["wants"]] == ["Ehrlichkeit"]
    assert a["life_circumstances"]["work"] is None
    assert result.summary == "Sie sind ruhig. Sie wandern gern."
    assert "religion" in result.report.rule_categories and result.report.model_checked
    assert result.report.model_flagged == 2  # „Pflege“ im Profil, „Etwas Höheres …“ in der Zusammenfassung
    assert result.usage.input_tokens > 0
    first = model.json_requests[0]
    assert first.schema is ANALYSIS_SCHEMA and first.effort == "medium"
    assert "<anrede>Sie</anrede>" in first.user and "Person: Wandern und Kochen." in first.user


async def test_without_model_check_only_the_sparse_variant_is_kept() -> None:
    model = FakeChatModel(json_replies=[raw_analysis()])
    calls = {"n": 0}
    original = model.complete_json

    async def flaky(req: JsonRequest) -> Any:
        calls["n"] += 1
        if calls["n"] == 1:
            return await original(req)
        raise LlmUnavailable("weg")

    model.complete_json = flaky  # type: ignore[method-assign]
    result = await AnalysisAgent(model, "m").run(
        turns=TURNS, notes=[], profile=None, kind=Kind.ERSTGESPRAECH, address_form=AddressForm.SIE,
        proposed_summary=None, guard=Art9Guard(model, "m"))
    a = result.analysis
    assert a is not None
    assert "personality" not in a and "life_circumstances" not in a
    assert a["dealbreakers"] == [{"kind": "raucht", "text": None}]
    assert result.summary == "Sie sind ruhig. Sie wandern gern."
    assert not result.report.model_checked


async def test_analysis_failure_returns_nothing() -> None:
    model = FakeChatModel(json_replies=[None])
    result = await AnalysisAgent(model, "m").run(
        turns=TURNS, notes=[], profile=None, kind=Kind.ERSTGESPRAECH, address_form=AddressForm.DU,
        proposed_summary="Du bist ruhig.", guard=Art9Guard(model, "m"))
    assert result.analysis is None and result.summary is None
