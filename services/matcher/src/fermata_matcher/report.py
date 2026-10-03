"""Bausteine für den Lauf-Bericht (app.match_runs.report): Verteilungen, Laufzeiten, Kosten."""

from __future__ import annotations

import statistics
import time
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any


class StageTimer:
    def __init__(self) -> None:
        self.seconds: dict[str, float] = {}

    @contextmanager
    def stage(self, name: str) -> Iterator[None]:
        t = time.perf_counter()
        try:
            yield
        finally:
            self.seconds[name] = round(self.seconds.get(name, 0.0) + time.perf_counter() - t, 3)

    def as_json(self) -> dict[str, float]:
        out = dict(self.seconds)
        out["gesamt"] = round(sum(self.seconds.values()), 3)
        return out


def distribution(values: list[float], bins: int = 10) -> dict[str, Any]:
    """Anzahl, Minimum, Median, Mittel, Maximum und Histogramm in Zehntel-Schritten (0..1, Werte > 1 im letzten Fach)."""
    vals = [float(v) for v in values if v is not None]
    if not vals:
        return {"anzahl": 0}
    hist = [0] * bins
    for v in vals:
        k = min(bins - 1, max(0, int(v * bins)))
        hist[k] += 1
    return {
        "anzahl": len(vals),
        "min": round(min(vals), 4),
        "median": round(statistics.median(vals), 4),
        "mittel": round(statistics.fmean(vals), 4),
        "max": round(max(vals), 4),
        "histogramm": [
            {"von": round(k / bins, 2), "bis": round((k + 1) / bins, 2), "anzahl": hist[k]} for k in range(bins)
        ],
    }


def cost_estimate(
    usage_cost_usd: float, embedding_tokens: int, embedding_price_usd_per_mtok: float, usd_eur_rate: float
) -> dict[str, float]:
    emb_usd = embedding_tokens * embedding_price_usd_per_mtok / 1_000_000
    total_usd = usage_cost_usd + emb_usd
    return {
        "llm_usd": round(usage_cost_usd, 4),
        "embeddings_usd": round(emb_usd, 6),
        "gesamt_usd": round(total_usd, 4),
        "gesamt_eur": round(total_usd * usd_eur_rate, 4),
    }
