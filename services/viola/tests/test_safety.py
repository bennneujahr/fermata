"""Sicherheits-Agent: Regeln je Beitrag und Gegenprüfung durch das Modell."""

from __future__ import annotations

import pytest

from viola.domain import SafetyKind, Severity, Turn
from viola.llm.base import LlmUnavailable
from viola.llm.fake import FakeChatModel, FakeReply
from viola.safety import SafetyAgent, SafetyDetector

detector = SafetyDetector()


@pytest.mark.parametrize(
    ("text", "kind", "severity"),
    [
        ("Ich will mich umbringen.", SafetyKind.KRISE, Severity.AKUT),
        ("Ich möchte mir heute das Leben nehmen", SafetyKind.KRISE, Severity.AKUT),
        ("Manchmal habe ich Suizidgedanken.", SafetyKind.KRISE, Severity.HOCH),
        ("Ich bin so lebensmüde.", SafetyKind.KRISE, Severity.HOCH),
        ("Ich will einfach nicht mehr leben.", SafetyKind.KRISE, Severity.HOCH),
        ("Ich ritze mich manchmal.", SafetyKind.KRISE, Severity.HOCH),
        ("Ich bin 16 Jahre alt.", SafetyKind.MINDERJAEHRIG, Severity.HOCH),
        ("ich bin erst siebzehn", SafetyKind.MINDERJAEHRIG, Severity.HOCH),
        ("Ich bin noch minderjährig.", SafetyKind.MINDERJAEHRIG, Severity.HOCH),
        ("Ich gehe in die 10. Klasse.", SafetyKind.MINDERJAEHRIG, Severity.MITTEL),
        ("Ich bring dich um.", SafetyKind.GEWALT, Severity.HOCH),
        ("Er schlägt mich, wenn er trinkt.", SafetyKind.GEWALT, Severity.HOCH),
        ("Halt die Fresse, du Schlampe.", SafetyKind.BELAESTIGUNG, Severity.MITTEL),
        ("Zieh dich aus.", SafetyKind.BELAESTIGUNG, Severity.MITTEL),
    ],
)
def test_detector_hits(text: str, kind: SafetyKind, severity: Severity) -> None:
    hits = detector.scan(text)
    assert hits and hits[0].kind is kind and hits[0].severity is severity


@pytest.mark.parametrize(
    "text",
    [
        "Ich bin 17 Jahre verheiratet gewesen.",
        "Mein Sohn ist 15 und geht in die 9. Klasse.",
        "Ich bin 34 Jahre alt.",
        "Das hat mich fast umgebracht vor Lachen.",
        "Ich lebe sehr gern hier.",
        "Ich will das Gespräch beenden.",
    ],
)
def test_detector_ignores_harmless_text(text: str) -> None:
    assert detector.scan(text) == []


def test_detector_keeps_highest_severity_per_kind() -> None:
    hits = detector.scan("Ich habe Suizidgedanken und ich will mich umbringen.")
    assert len(hits) == 1 and hits[0].severity is Severity.AKUT


async def test_safety_agent_reports_valid_flags_only() -> None:
    model = FakeChatModel(
        json_replies=[
            {
                "flags": [
                    {"kind": "krise", "severity": "hoch", "turn_index": 1},
                    {"kind": "gewalt", "severity": "mittel", "turn_index": 0},  # Beitrag von Viola → ungültig
                    {"kind": "erfunden", "severity": "hoch", "turn_index": 1},
                ]
            }
        ]
    )
    agent = SafetyAgent(model, "eu.anthropic.claude-sonnet-5-5")
    turns = [Turn("viola", "Wie geht es Ihnen?"), Turn("person", "Mir geht es seit Wochen sehr schlecht.")]
    flags = await agent.review(turns)
    assert [(f.kind, f.severity, f.turn_index) for f in flags] == [(SafetyKind.KRISE, Severity.HOCH, 1)]
    request = model.json_requests[0]
    assert "[1] Mir geht es" in request.user and "Wie geht es Ihnen" not in request.user
    assert request.schema["properties"]["flags"]["items"]["additionalProperties"] is False


async def test_safety_agent_survives_model_failure() -> None:
    model = FakeChatModel(replies=[FakeReply(fail=LlmUnavailable("x"))])

    async def boom(_req: object) -> object:
        raise LlmUnavailable("nicht erreichbar")

    model.complete_json = boom  # type: ignore[method-assign,assignment]
    assert await SafetyAgent(model, "m").review([Turn("person", "Hallo")]) == []
    assert await SafetyAgent(model, "m").review([]) == []
