"""Stimmen-Blindtest: Sprachproben (Attrappe), anonyme Bewertungsseite, Auswertung."""

from __future__ import annotations

import json
import re
import wave
from pathlib import Path

import pytest
from blindtest.blindtest import VoiceSpec, aggregate, assign_labels, build_page, load_sentences, main, render, report_markdown

from viola.config import Config


def test_sentences_are_calm_and_complete() -> None:
    sentences = load_sentences()
    assert len(sentences) == 10
    assert sentences[0].startswith("Guten Tag. Ich bin Viola, eine künstliche Intelligenz")
    for s in sentences:
        assert "!" not in s and not re.search(r"\b(match|garantiert)\b", s, re.IGNORECASE)


def test_labels_are_anonymous_and_reproducible() -> None:
    specs = [VoiceSpec.parse(s) for s in ("polly:Vicki", "google:de-DE-Chirp3-HD-Aoede", "fake:Ton1")]
    a = assign_labels(specs, seed=7)
    assert sorted(a) == ["A", "B", "C"]
    assert a == assign_labels(specs, seed=7)
    assert {str(v) for v in a.values()} == {"polly:Vicki", "google:de-DE-Chirp3-HD-Aoede", "fake:Ton1"}


async def test_render_offline_builds_audio_key_latency_and_page(tmp_path: Path) -> None:
    specs = [VoiceSpec("fake", "Ton1"), VoiceSpec("fake", "Ton2"), VoiceSpec("fake", "Ton3")]
    info = await render(specs, tmp_path, cfg=Config.from_env({}), seed=1, sentences=load_sentences()[:5])
    assert info["labels"] == ["A", "B", "C"]
    wavs = sorted((tmp_path / "audio").glob("*.wav"))
    assert len(wavs) == 15
    with wave.open(str(wavs[0])) as w:
        assert (w.getframerate(), w.getnchannels(), w.getsampwidth()) == (16000, 1, 2)
        assert w.getnframes() > 1000
    key = json.loads((tmp_path / "schluessel.json").read_text(encoding="utf-8"))
    assert sorted(key.values()) == ["fake:Ton1", "fake:Ton2", "fake:Ton3"]
    latency = json.loads((tmp_path / "antwortzeiten.json").read_text(encoding="utf-8"))
    assert all(len(v) == 5 for v in latency.values())
    page = (tmp_path / "index.html").read_text(encoding="utf-8")
    assert "Ton1" not in page and "fake" not in page, "Seite verrät die Anbieter nicht"
    assert "audio/A_00.wav" in page and "Stimme C" in page
    assert "http://" not in page and "https://" not in page, "keine Anfragen an Dritte"
    assert "!" not in re.sub(r"<!doctype html>|!==|!=", "", page)


def test_page_has_accessible_controls() -> None:
    page = build_page(["Satz eins.", "Satz zwei."], ["A", "B"])
    assert page.count("<fieldset>") == 4 and page.count("<legend>") == 4
    assert 'lang="de"' in page and 'role="status"' in page
    assert "Math.random" in page, "Reihenfolge der Stimmen je Person gemischt"


def _result(pid: str, ratings: dict[str, int], pref: str, overall: str) -> dict:
    return {
        "participant": pid,
        "ratings": [{"sentence": i, "label": label, "score": score} for i in range(3) for label, score in ratings.items()],
        "preferences": [{"sentence": i, "label": pref} for i in range(3)],
        "overall": overall,
    }


def test_aggregate_means_preferences_and_latency() -> None:
    key = {"A": "polly:Vicki", "B": "google:de-DE-Chirp3-HD-Aoede"}
    results = [
        _result("p1", {"A": 4, "B": 3}, "A", "A"),
        _result("p2", {"A": 5, "B": 4}, "A", "B"),
        _result("p3", {"A": 3, "B": 5, "X": 5}, "B", "A"),
    ]
    latency = {"A": [300.0, 320.0, 900.0, 310.0], "B": [500.0, 520.0, 530.0, 2500.0]}
    summary = aggregate(results, key, latency)
    a = summary["voices"]["polly:Vicki"]
    b = summary["voices"]["google:de-DE-Chirp3-HD-Aoede"]
    assert a["mean"] == 4.0 and a["n"] == 9 and a["preferred_sentences"] == 6 and a["preferred_overall"] == 2
    assert b["mean"] == 4.0 and b["preferred_overall"] == 1
    assert a["latency_ms_p90"] == 900.0 and b["latency_ms_p90"] == 2500.0 and a["latency_ms_p50"] == 310.0
    assert summary["ranking"][0] == "polly:Vicki"
    assert summary["participants"] == 3
    md = report_markdown(summary)
    assert "| 1 | polly:Vicki | A | 4.0 |" in md and "Weniger als 12 Personen" in md


def test_cli_aggregate(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    key = tmp_path / "schluessel.json"
    key.write_text(json.dumps({"A": "fake:Ton1"}), encoding="utf-8")
    res = tmp_path / "r1.json"
    res.write_text(json.dumps(_result("p1", {"A": 5}, "A", "A")), encoding="utf-8")
    assert main(["aggregate", "--ergebnisse", str(res), "--schluessel", str(key), "--json"]) == 0
    out = json.loads(capsys.readouterr().out)
    assert out["voices"]["fake:Ton1"]["mean"] == 5.0
