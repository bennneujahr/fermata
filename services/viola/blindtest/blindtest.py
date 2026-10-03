"""Stimmen-Blindtest für Viola (PLAN M3, Frage B4).

Drei Schritte, alles ohne Server und ohne Anfragen an Dritte im Browser:

1. ``render``    – dieselben zehn Sätze mit jeder Stimme erzeugen (WAV), Antwortzeit messen, Stimmen anonym
                   mit Buchstaben benennen (A, B, C …). Die Zuordnung steht nur in ``schluessel.json``.
2. Bewertung     – die Testpersonen öffnen ``index.html`` (Kopfhörer), bewerten jede Stimme je Satz mit 1–5,
                   wählen je Satz und insgesamt einen Favoriten und speichern eine JSON-Datei.
3. ``aggregate`` – Benn sammelt die JSON-Dateien und wertet aus: Mittelwert je Stimme, Favoriten,
                   90-%-Wert der Antwortzeit je Anbieter.

Aufruf (aus services/viola):
    uv run python -m blindtest.blindtest render --stimmen polly:Vicki,google:de-DE-Chirp3-HD-Aoede --out blindtest/ausgabe
    uv run python -m blindtest.blindtest render --stimmen fake:Ton1,fake:Ton2,fake:Ton3 --out /tmp/bt   # offline
    uv run python -m blindtest.blindtest aggregate --ergebnisse ergebnisse/*.json --schluessel blindtest/ausgabe/schluessel.json \
        --zeiten blindtest/ausgabe/antwortzeiten.json

Hinweis: Die WAV-Dateien sind synthetische Sprachproben, keine Aufnahmen von Menschen.
"""

from __future__ import annotations

import argparse
import asyncio
import html
import json
import random
import statistics
import string
import sys
import time
import wave
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from viola.config import Config
from viola.metrics import percentile
from viola.tts import TtsProvider, build_tts

HERE = Path(__file__).resolve().parent
SENTENCES_FILE = HERE / "saetze.json"


def load_sentences(path: Path = SENTENCES_FILE) -> list[str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    sentences = [str(s) for s in data["saetze"]]
    if not 5 <= len(sentences) <= 15:
        raise ValueError("Der Blindtest braucht 5 bis 15 Sätze")
    return sentences


@dataclass(frozen=True)
class VoiceSpec:
    provider: str
    voice: str

    @classmethod
    def parse(cls, spec: str) -> VoiceSpec:
        provider, _, voice = spec.partition(":")
        return cls(provider.strip(), voice.strip())

    def __str__(self) -> str:
        return f"{self.provider}:{self.voice}" if self.voice else self.provider


def assign_labels(specs: list[VoiceSpec], seed: int | None = None) -> dict[str, VoiceSpec]:
    """Zufällige, anonyme Buchstaben je Stimme (Reihenfolge der Eingabe verrät nichts)."""
    if len(specs) > len(string.ascii_uppercase):
        raise ValueError("Zu viele Stimmen")
    shuffled = list(specs)
    random.Random(seed).shuffle(shuffled)
    return {string.ascii_uppercase[i]: spec for i, spec in enumerate(shuffled)}


def write_wav(path: Path, pcm: bytes, sample_rate: int) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(pcm)


async def synthesize_timed(provider: TtsProvider, text: str) -> tuple[bytes, float, float]:
    """PCM, Zeit bis zum ersten Ton (ms) und Gesamtzeit (ms)."""
    started = time.perf_counter()
    first: float | None = None
    chunks: list[bytes] = []
    async for chunk in provider.synthesize(text):
        if first is None:
            first = (time.perf_counter() - started) * 1000
        chunks.append(chunk)
    total = (time.perf_counter() - started) * 1000
    return b"".join(chunks), first if first is not None else total, total


async def render(
    specs: list[VoiceSpec],
    out_dir: Path,
    *,
    cfg: Config | None = None,
    seed: int | None = None,
    sentences: list[str] | None = None,
    providers: dict[str, TtsProvider] | None = None,
) -> dict[str, Any]:
    """Erzeugt Audio, Antwortzeiten, Schlüssel und die Bewertungsseite."""
    c = cfg or Config.from_env()
    texts = sentences or load_sentences()
    labels = assign_labels(specs, seed)
    audio_dir = out_dir / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    latency: dict[str, list[float]] = {}
    for label, spec in labels.items():
        provider = (providers or {}).get(str(spec)) or build_tts(spec.provider, spec.voice, c)
        latency[label] = []
        for i, text in enumerate(texts):
            pcm, ttfb, _total = await synthesize_timed(provider, text)
            write_wav(audio_dir / f"{label}_{i:02d}.wav", pcm, provider.sample_rate)
            latency[label].append(round(ttfb, 1))
    (out_dir / "schluessel.json").write_text(
        json.dumps({k: str(v) for k, v in labels.items()}, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (out_dir / "antwortzeiten.json").write_text(json.dumps(latency, indent=2), encoding="utf-8")
    (out_dir / "index.html").write_text(build_page(texts, sorted(labels)), encoding="utf-8")
    return {"labels": sorted(labels), "sentences": len(texts), "out": str(out_dir)}


def build_page(sentences: list[str], labels: list[str]) -> str:
    """Statische Bewertungsseite (deutsch, ohne Ausrufezeichen, ohne externe Anfragen, ohne Cookies)."""
    blocks = []
    for i, text in enumerate(sentences):
        voices = []
        for label in labels:
            radios = "".join(
                f'<label class="score"><input type="radio" name="s{i}_{label}" value="{v}" required> {v}</label>' for v in range(1, 6)
            )
            voices.append(
                f'<div class="voice" data-label="{label}"><h3>Stimme {label}</h3>'
                f'<audio controls preload="none" src="audio/{label}_{i:02d}.wav"></audio>'
                f'<fieldset><legend>Wie angenehm und natürlich klingt Stimme {label} hier?</legend>{radios}</fieldset></div>'
            )
        options = "".join(f'<option value="{lab}">Stimme {lab}</option>' for lab in labels)
        blocks.append(
            f'<section class="sentence" data-index="{i}"><h2>Satz {i + 1}</h2><p class="text">„{html.escape(text)}“</p>'
            f'<div class="voices">{"".join(voices)}</div>'
            f'<label class="pref">Welche Stimme passt bei diesem Satz am besten? <select name="pref{i}" required>'
            f'<option value="">Bitte wählen</option>{options}</select></label></section>'
        )
    overall = "".join(f'<option value="{lab}">Stimme {lab}</option>' for lab in labels)
    data = json.dumps({"sentences": len(sentences), "labels": labels})
    return f"""<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Stimmen-Blindtest für Viola</title>
<style>
:root {{ --ink: #1f1d1a; --paper: #faf7f2; --line: #d9d2c7; --accent: #5b4b8a; }}
body {{ margin: 0; font: 17px/1.55 system-ui, sans-serif; color: var(--ink); background: var(--paper); }}
main {{ max-width: 52rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; }}
section {{ border-top: 1px solid var(--line); padding: 1.25rem 0; }}
.voices {{ display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); }}
.voice {{ background: #fff; border: 1px solid var(--line); border-radius: .5rem; padding: .75rem; }}
.voice h3 {{ margin: 0 0 .5rem; font-size: 1rem; }}
audio {{ width: 100%; }}
fieldset {{ border: 0; padding: 0; margin: .5rem 0 0; }}
legend {{ font-size: .9rem; margin-bottom: .25rem; }}
.score {{ margin-right: .6rem; white-space: nowrap; }}
.pref, .overall {{ display: block; margin-top: 1rem; }}
button {{ font: inherit; padding: .6rem 1.2rem; border-radius: .4rem; border: 0; background: var(--accent); color: #fff; }}
.hinweis {{ background: #fff; border-left: 4px solid var(--accent); padding: .75rem 1rem; }}
:focus-visible {{ outline: 3px solid var(--accent); outline-offset: 2px; }}
</style>
</head>
<body>
<main>
<h1>Welche Stimme passt zu Viola?</h1>
<div class="hinweis">
<p>Viola ist die Gesprächspartnerin von Fermata, eine künstliche Intelligenz. Sie hören dieselben Sätze in mehreren Stimmen.
Die Stimmen heißen nur A, B, C und so weiter; welcher Anbieter dahintersteckt, erfahren Sie nicht.</p>
<p>So geht es: Kopfhörer aufsetzen, jeden Satz in jeder Stimme anhören, jede Stimme von 1 (gar nicht) bis 5 (sehr) bewerten
und je Satz einen Favoriten wählen. Die Reihenfolge der Stimmen ist bei jeder Person anders. Am Ende auf „Ergebnis speichern“
klicken und die Datei an Fermata schicken. Es werden keine Namen und keine Aufnahmen gespeichert.</p>
</div>
<form id="test">
{"".join(blocks)}
<section>
<label class="overall">Welche Stimme würden Sie Viola insgesamt geben? <select name="overall" required>
<option value="">Bitte wählen</option>{overall}</select></label>
<label class="overall">Möchten Sie noch etwas anmerken? (freiwillig, ohne Namen)<br>
<textarea name="kommentar" rows="3" cols="60" maxlength="1000"></textarea></label>
<p><button type="submit">Ergebnis speichern</button></p>
<p id="status" role="status"></p>
</section>
</form>
</main>
<script>
const META = {data};
// Reihenfolge der Stimmen je Person mischen (gegen Reihenfolge-Effekte).
for (const box of document.querySelectorAll('.voices')) {{
  const items = Array.from(box.children);
  for (let i = items.length - 1; i > 0; i--) {{ const j = Math.floor(Math.random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }}
  items.forEach((el) => box.appendChild(el));
}}
document.getElementById('test').addEventListener('submit', (ev) => {{
  ev.preventDefault();
  const form = new FormData(ev.target);
  const ratings = [], preferences = [];
  for (let i = 0; i < META.sentences; i++) {{
    for (const label of META.labels) {{
      const v = form.get(`s${{i}}_${{label}}`);
      if (v) ratings.push({{ sentence: i, label, score: Number(v) }});
    }}
    const p = form.get(`pref${{i}}`);
    if (p) preferences.push({{ sentence: i, label: p }});
  }}
  const id = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
  const result = {{ version: 1, participant: id, created_at: new Date().toISOString(), ratings, preferences,
    overall: form.get('overall'), comment: (form.get('kommentar') || '').slice(0, 1000) }};
  const blob = new Blob([JSON.stringify(result, null, 2)], {{ type: 'application/json' }});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `blindtest-${{id}}.json`;
  a.click();
  document.getElementById('status').textContent = 'Danke. Die Datei wurde gespeichert, bitte schicken Sie sie an Fermata.';
}});
</script>
</body>
</html>
"""


def aggregate(results: list[dict[str, Any]], key: dict[str, str], latency: dict[str, list[float]] | None = None) -> dict[str, Any]:
    """Auswertung je Anbieter: Mittelwert, Anzahl, Favoriten je Satz und insgesamt, Antwortzeit (Median, 90 %)."""
    scores: dict[str, list[int]] = defaultdict(list)
    prefs: Counter[str] = Counter()
    overall: Counter[str] = Counter()
    participants = set()
    for r in results:
        participants.add(r.get("participant"))
        for item in r.get("ratings", []):
            label, score = item.get("label"), item.get("score")
            if label in key and isinstance(score, int) and 1 <= score <= 5:
                scores[key[label]].append(score)
        for item in r.get("preferences", []):
            if item.get("label") in key:
                prefs[key[item["label"]]] += 1
        if r.get("overall") in key:
            overall[key[r["overall"]]] += 1
    per_voice: dict[str, Any] = {}
    for label, voice in sorted(key.items()):
        s = scores.get(voice, [])
        lat = (latency or {}).get(label, [])
        per_voice[voice] = {
            "label": label,
            "mean": round(statistics.fmean(s), 2) if s else None,
            "stdev": round(statistics.stdev(s), 2) if len(s) > 1 else None,
            "n": len(s),
            "preferred_sentences": prefs.get(voice, 0),
            "preferred_overall": overall.get(voice, 0),
            "latency_ms_p50": percentile(lat, 50),
            "latency_ms_p90": percentile(lat, 90),
        }
    ranking = sorted(per_voice, key=lambda v: (-(per_voice[v]["mean"] or 0), -per_voice[v]["preferred_overall"]))
    return {"participants": len(participants), "voices": per_voice, "ranking": ranking}


def report_markdown(summary: dict[str, Any]) -> str:
    lines = [
        f"# Stimmen-Blindtest: Auswertung ({summary['participants']} Personen)",
        "",
        "| Rang | Stimme | Buchstabe | Mittelwert (1–5) | Bewertungen | Favorit je Satz | Favorit insgesamt | Antwortzeit Median | 90-%-Wert |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for rank, voice in enumerate(summary["ranking"], start=1):
        v = summary["voices"][voice]
        lines.append(
            f"| {rank} | {voice} | {v['label']} | {v['mean'] if v['mean'] is not None else '–'} | {v['n']} | "
            f"{v['preferred_sentences']} | {v['preferred_overall']} | "
            f"{v['latency_ms_p50'] if v['latency_ms_p50'] is not None else '–'} ms | "
            f"{v['latency_ms_p90'] if v['latency_ms_p90'] is not None else '–'} ms |"
        )
    if summary["participants"] < 12:
        lines += ["", "Hinweis: Weniger als 12 Personen – das Ergebnis ist nur ein Anhaltspunkt."]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="blindtest", description="Stimmen-Blindtest für Viola")
    sub = parser.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("render", help="Sprachproben erzeugen und Bewertungsseite bauen")
    r.add_argument("--stimmen", required=True, help="z. B. polly:Vicki,google:de-DE-Chirp3-HD-Aoede,fake:Ton1")
    r.add_argument("--out", required=True, type=Path)
    r.add_argument("--seed", type=int, default=None)
    a = sub.add_parser("aggregate", help="Ergebnisse auswerten")
    a.add_argument("--ergebnisse", nargs="+", required=True, type=Path)
    a.add_argument("--schluessel", required=True, type=Path)
    a.add_argument("--zeiten", type=Path, default=None)
    a.add_argument("--json", action="store_true", help="Ausgabe als JSON statt Tabelle")
    ns = parser.parse_args(argv)
    if ns.cmd == "render":
        specs = [VoiceSpec.parse(s) for s in ns.stimmen.split(",") if s.strip()]
        info = asyncio.run(render(specs, ns.out, seed=ns.seed))
        print(f"Fertig: {info['sentences']} Sätze, Stimmen {', '.join(info['labels'])}. Seite: {ns.out / 'index.html'}")
        print("schluessel.json nicht an Testpersonen weitergeben.")
        return 0
    results = [json.loads(p.read_text(encoding="utf-8")) for p in ns.ergebnisse]
    key = json.loads(ns.schluessel.read_text(encoding="utf-8"))
    latency = json.loads(ns.zeiten.read_text(encoding="utf-8")) if ns.zeiten else None
    summary = aggregate(results, key, latency)
    print(json.dumps(summary, ensure_ascii=False, indent=2) if ns.json else report_markdown(summary))
    return 0


if __name__ == "__main__":
    sys.exit(main())
