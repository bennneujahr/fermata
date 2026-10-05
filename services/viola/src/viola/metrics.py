"""Antwortzeiten und Kosten je Gespräch (PLAN 3.2 Nr. 16, 5.8). Keine Inhalte, nur Zahlen.

Antwortzeit je Zug: vom Ende der Äußerung der Person (Turn erkannt) bis zum ersten Ton von Viola
(Text: bis zum ersten fertigen Satz). Ausgewertet werden Median und 90-%-Wert (Nearest-Rank).

Kosten in Euro aus den Preisannahmen der Einstellung ``voice.prices`` (Quellen: docs/bereiche/viola.md).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

from viola.llm.base import Usage


def percentile(values: list[float], p: float) -> float | None:
    """Nearest-Rank-Perzentil (p in 0..100). Leere Liste → None."""
    if not values:
        return None
    if not 0 < p <= 100:
        raise ValueError("p muss zwischen 0 (exklusiv) und 100 liegen")
    ordered = sorted(values)
    rank = math.ceil(p / 100 * len(ordered))
    return ordered[max(0, rank - 1)]


@dataclass(slots=True)
class LatencyTracker:
    samples_ms: list[float] = field(default_factory=list)
    llm_ttft_ms: list[float] = field(default_factory=list)

    def add(self, ms: float) -> None:
        if ms >= 0:
            self.samples_ms.append(ms)

    def add_ttft(self, ms: float | None) -> None:
        if ms is not None and ms >= 0:
            self.llm_ttft_ms.append(ms)

    @property
    def p50(self) -> int | None:
        v = percentile(self.samples_ms, 50)
        return None if v is None else round(v)

    @property
    def p90(self) -> int | None:
        v = percentile(self.samples_ms, 90)
        return None if v is None else round(v)

    def share_below(self, threshold_ms: float) -> float | None:
        if not self.samples_ms:
            return None
        return sum(1 for s in self.samples_ms if s < threshold_ms) / len(self.samples_ms)


@dataclass(slots=True)
class CostMeter:
    """Zählt Verbrauch je Gespräch. ``stt_seconds`` zählt nur Audio, das wirklich an die Spracherkennung ging."""

    stt_seconds: float = 0.0
    conversation: Usage = field(default_factory=Usage)
    analysis: Usage = field(default_factory=Usage)
    tts_characters: int = 0
    media_minutes: float = 0.0
    turns: int = 0
    brevity_cuts: int = 0
    refusals: int = 0

    def llm_total(self) -> Usage:
        total = Usage()
        total.add(self.conversation)
        total.add(self.analysis)
        return total

    def amount_eur(self, prices: dict[str, Any], tts_provider: str, livekit_path: str) -> float:
        return estimate_eur(
            prices,
            stt_seconds=self.stt_seconds,
            usage=self.llm_total(),
            tts_characters=self.tts_characters,
            tts_provider=tts_provider,
            media_minutes=self.media_minutes,
            livekit_path=livekit_path,
        )


def estimate_eur(
    prices: dict[str, Any],
    *,
    stt_seconds: float,
    usage: Usage,
    tts_characters: int,
    tts_provider: str,
    media_minutes: float,
    livekit_path: str,
) -> float:
    """Kostenschätzung in Euro. Alle Preise in USD aus ``voice.prices``, umgerechnet mit ``usd_to_eur``."""
    fx = float(prices.get("usd_to_eur", 0.86))
    llm = prices.get("llm_usd_per_mtok", {})
    tts = prices.get("tts_usd_per_million_chars", {})
    media = prices.get("media_usd_per_minute", {})
    usd = 0.0
    usd += stt_seconds / 60.0 * float(prices.get("stt_usd_per_minute", 0.0))
    usd += usage.input_tokens / 1e6 * float(llm.get("input", 0.0))
    usd += usage.output_tokens / 1e6 * float(llm.get("output", 0.0))
    usd += usage.cache_read_tokens / 1e6 * float(llm.get("cache_read", 0.0))
    usd += usage.cache_write_tokens / 1e6 * float(llm.get("cache_write", 0.0))
    usd += tts_characters / 1e6 * float(tts.get(tts_provider, 0.0))
    usd += media_minutes * float(media.get(livekit_path, 0.0))
    return round(usd * fx, 4)


def cost_record(
    meter: CostMeter,
    latency: LatencyTracker,
    *,
    minutes: float,
    prices: dict[str, Any],
    tts_provider: str,
    livekit_path: str,
    mode: str,
    target_ms_p90: int,
) -> dict[str, Any]:
    """Datensatz für ops.session_costs (über api.agent_record_costs)."""
    total = meter.llm_total()
    eur = meter.amount_eur(prices, tts_provider, livekit_path)
    share = latency.share_below(target_ms_p90)
    p50_ttft = percentile(latency.llm_ttft_ms, 50)
    return {
        "minutes": round(minutes, 2),
        "stt_seconds": round(meter.stt_seconds, 2),
        "llm_input_tokens": total.input_tokens,
        "llm_output_tokens": total.output_tokens,
        "llm_cache_read_tokens": total.cache_read_tokens,
        "llm_cache_write_tokens": total.cache_write_tokens,
        "tts_characters": meter.tts_characters,
        "media_minutes": round(meter.media_minutes, 2),
        "amount_eur": eur,
        "latency_ms_p50": latency.p50,
        "latency_ms_p90": latency.p90,
        "details": {
            "mode": mode,
            "turns": meter.turns,
            "tts_provider": tts_provider,
            "livekit_path": livekit_path,
            "eur_per_hour": round(eur / minutes * 60, 4) if minutes > 0 else None,
            "latency_samples": len(latency.samples_ms),
            "share_below_target": round(share, 3) if share is not None else None,
            "llm_ttft_ms_p50": round(p50_ttft) if p50_ttft is not None else None,
            "analysis_input_tokens": meter.analysis.input_tokens,
            "analysis_output_tokens": meter.analysis.output_tokens,
            "brevity_cuts": meter.brevity_cuts,
            "refusals": meter.refusals,
        },
    }
