"""Sätze im Fluss, kurze Antworten, Antwortzeiten und Kostenrechnung."""

from __future__ import annotations

import pytest

from viola.context import DEFAULT_PRICES
from viola.llm.base import Usage
from viola.metrics import CostMeter, LatencyTracker, cost_record, estimate_eur, percentile
from viola.text_stream import BrevityGuard, SentenceSplitter, is_question


def split_all(chunks: list[str]) -> list[str]:
    s = SentenceSplitter()
    out: list[str] = []
    for c in chunks:
        out += s.push(c)
    return out + s.flush()


def test_splitter_emits_sentences_as_soon_as_complete() -> None:
    s = SentenceSplitter()
    assert s.push("Danke, das ") == []
    assert s.push("hilft mir. Was ist") == ["Danke, das hilft mir."]
    assert s.push(" Ihnen wichtig? ") == ["Was ist Ihnen wichtig?"]
    assert s.flush() == []


def test_splitter_respects_abbreviations_and_numbers() -> None:
    out = split_all(["Zum Beispiel z. B. am Wochenende, ca. 20 km. ", "In die 10. Klasse? Ja."])
    assert out == ["Zum Beispiel z. B. am Wochenende, ca. 20 km.", "In die 10. Klasse?", "Ja."]


def test_brevity_guard_keeps_two_sentences_and_the_question() -> None:
    g = BrevityGuard(3)
    emitted = []
    for s in ["Eins.", "Zwei.", "Drei.", "Vier.", "Was meinen Sie?", "Noch etwas?"]:
        emitted += g.push(s)
    assert emitted == ["Eins.", "Zwei."]
    assert g.finish() == ["Was meinen Sie?"]
    assert g.cut == 3
    assert g.text == "Eins. Zwei. Was meinen Sie?"


def test_brevity_guard_short_answers_pass_unchanged() -> None:
    g = BrevityGuard(3)
    assert g.push("Danke.") == ["Danke."]
    assert g.push("Was noch?") == ["Was noch?"]
    assert g.push("Gut.") == []
    assert g.finish() == ["Gut."] and g.cut == 0


def test_is_question() -> None:
    assert is_question("Wie geht es?“") and not is_question("Gut.")


def test_percentiles_nearest_rank() -> None:
    values = [float(v) for v in range(1, 11)]
    assert percentile(values, 50) == 5
    assert percentile(values, 90) == 9
    assert percentile([], 50) is None
    with pytest.raises(ValueError):
        percentile(values, 0)
    t = LatencyTracker()
    for v in (800, 900, 1000, 1200, 2500):
        t.add(v)
    assert t.p50 == 1000 and t.p90 == 2500
    assert t.share_below(2000) == 0.8


def test_cost_estimate_for_one_hour_matches_plan_assumptions() -> None:
    """PLAN 5.1/5.8: 90 Antworten je Stunde, je 5.000 Token aus dem Cache, 1.000 neu, 130 Ausgabe.

    Erwartung: Sprachmodell ca. 0,48 USD je Stunde; gesamt unter dem Ziel von 2 € je 60 Minuten.
    """
    usage = Usage(input_tokens=90 * 1000, output_tokens=90 * 130, cache_read_tokens=90 * 5000)
    llm_only = estimate_eur(
        DEFAULT_PRICES, stt_seconds=0, usage=usage, tts_characters=0, tts_provider="polly", media_minutes=0, livekit_path="C"
    )
    # PLAN nennt ca. 0,48 USD (mit etwas Cache-Schreiben); ohne Cache-Schreiben sind es ca. 0,43 USD.
    assert 0.40 * 0.86 <= llm_only <= 0.50 * 0.86
    # Stimme: Person spricht ca. 25 Minuten (nur Sprache geht an die Erkennung), Viola 90 × 180 Zeichen
    total = estimate_eur(
        DEFAULT_PRICES,
        stt_seconds=25 * 60,
        usage=usage,
        tts_characters=90 * 180,
        tts_provider="polly",
        media_minutes=60,
        livekit_path="C",
    )
    assert total < 2.0
    assert total == pytest.approx(llm_only + (25 * 0.0077 + 16200 / 1e6 * 30 + 60 * 0.001) * 0.86, rel=1e-3)


def test_cost_record_has_all_columns() -> None:
    meter = CostMeter(stt_seconds=120.5, tts_characters=1500, media_minutes=10)
    meter.conversation.add(Usage(10_000, 800, 40_000, 5000))
    meter.analysis.add(Usage(6000, 1500))
    lat = LatencyTracker()
    lat.add(900)
    lat.add(1900)
    rec = cost_record(
        meter, lat, minutes=10, prices=DEFAULT_PRICES, tts_provider="polly", livekit_path="C", mode="voice", target_ms_p90=2000
    )
    assert rec["llm_input_tokens"] == 16_000 and rec["llm_output_tokens"] == 2300
    assert rec["llm_cache_read_tokens"] == 40_000 and rec["llm_cache_write_tokens"] == 5000
    assert rec["latency_ms_p50"] == 900 and rec["latency_ms_p90"] == 1900
    assert rec["amount_eur"] > 0 and rec["details"]["eur_per_hour"] == pytest.approx(rec["amount_eur"] * 6, rel=1e-3)
    assert rec["details"]["share_below_target"] == 1.0
    assert set(rec) == {
        "minutes",
        "stt_seconds",
        "llm_input_tokens",
        "llm_output_tokens",
        "llm_cache_read_tokens",
        "llm_cache_write_tokens",
        "tts_characters",
        "media_minutes",
        "amount_eur",
        "latency_ms_p50",
        "latency_ms_p90",
        "details",
    }
