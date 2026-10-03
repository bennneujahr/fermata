"""Einstellungen des Auswahl-Jobs.

Alle Zahlen kommen aus ops.app_settings (PLAN 2.4 „Einstellungen statt fester Zahlen“). Der Job liest sie über
ops.setting(), weil fermata_matcher die Tabelle selbst nicht lesen darf. Die Standardwerte hier gelten nur, wenn
ein Schlüssel fehlt (z. B. in reinen Unit-Tests ohne Datenbank).
"""

from __future__ import annotations

import os
from dataclasses import asdict, dataclass, field
from typing import Any

SUBSCORE_KEYS: tuple[str, ...] = ("werte", "wuensche", "lebensumstaende", "persoenlichkeit", "zeiten")

DEFAULT_WEIGHTS: dict[str, float] = {
    "werte": 0.30,
    "wuensche": 0.25,
    "lebensumstaende": 0.15,
    "persoenlichkeit": 0.20,
    "zeiten": 0.10,
}

# Schlüssel in ops.app_settings → Feldname in MatchSettings
SETTING_KEYS: dict[str, str] = {
    "matching.rhythm_days": "rhythm_days",
    "matching.min_score": "min_score",
    "matching.candidates_per_person": "candidates_per_person",
    "matching.wait_bonus_per_round": "wait_bonus_per_round",
    "matching.wait_bonus_max": "wait_bonus_max",
    "matching.max_distance_km": "max_distance_km",
    "matching.weights": "weights",
    "matching.llm_weight": "llm_weight",
    "matching.score_retention_months": "score_retention_months",
    "matching.venue_max_detour_ratio": "venue_max_detour_ratio",
    "matching.personal_weight_share": "personal_weight_share",
    "matching.default_age_window_years": "default_age_window_years",
    "matching.topn_mode": "topn_mode",
    "matching.max_cardinality": "max_cardinality",
    "matching.embeddings_enabled": "embeddings_enabled",
    "matching.embedding_model_id": "embedding_model_id",
    "matching.llm_enabled": "llm_enabled",
    "matching.llm_effort": "llm_effort",
    "matching.llm_concurrency": "llm_concurrency",
    "matching.rejected_pair_cooldown_days": "rejected_pair_cooldown_days",
    "matching.venue_ratio_min_km": "venue_ratio_min_km",
    "matching.slot_lead_hours": "slot_lead_hours",
    "matching.proposal_lead_hours": "proposal_lead_hours",
    "matching.proposed_times_count": "proposed_times_count",
    "matching.assignment_timeout_seconds": "assignment_timeout_seconds",
    "matching.assignment_inline_max_nodes": "assignment_inline_max_nodes",
    "matching.fairness_min_group_size": "fairness_min_group_size",
    "matching.llm_price_usd_per_mtok": "llm_price_usd_per_mtok",
    "matching.embedding_price_usd_per_mtok": "embedding_price_usd_per_mtok",
    "matching.usd_eur_rate": "usd_eur_rate",
    "evening.default_duration_minutes": "evening_duration_minutes",
    "analysis.llm_model_id": "llm_model_id",
}


@dataclass
class MatchSettings:
    rhythm_days: int = 14
    min_score: float = 0.60
    candidates_per_person: int = 10
    wait_bonus_per_round: float = 0.02
    wait_bonus_max: float = 0.10
    max_distance_km: float = 60.0
    weights: dict[str, float] = field(default_factory=lambda: dict(DEFAULT_WEIGHTS))
    llm_weight: float = 0.5
    score_retention_months: int = 12
    venue_max_detour_ratio: float = 1.3
    personal_weight_share: float = 0.5
    default_age_window_years: int = 10
    topn_mode: str = "union"
    max_cardinality: bool = True
    embeddings_enabled: bool = True
    embedding_model_id: str = "amazon.titan-embed-text-v2:0"
    llm_enabled: bool = True
    llm_effort: str = "low"
    llm_concurrency: int = 8
    rejected_pair_cooldown_days: int = 90
    venue_ratio_min_km: float = 5.0
    slot_lead_hours: int = 72
    proposal_lead_hours: int = 48
    proposed_times_count: int = 3
    assignment_timeout_seconds: float = 600.0
    assignment_inline_max_nodes: int = 600
    fairness_min_group_size: int = 5
    llm_price_usd_per_mtok: dict[str, float] = field(
        default_factory=lambda: {"input": 2.2, "output": 11.0, "cache_read": 0.22, "cache_write": 2.75}
    )
    embedding_price_usd_per_mtok: float = 0.02
    usd_eur_rate: float = 0.92
    evening_duration_minutes: int = 120
    llm_model_id: str = "eu.anthropic.claude-sonnet-5-5"

    @classmethod
    def from_mapping(cls, values: dict[str, Any]) -> MatchSettings:
        """Baut die Einstellungen aus {schlüssel: wert}; unbekannte Schlüssel werden ignoriert."""
        s = cls()
        for key, value in values.items():
            name = SETTING_KEYS.get(key)
            if name is None or value is None:
                continue
            current = getattr(s, name)
            if isinstance(current, bool):
                value = bool(value)
            elif isinstance(current, int) and not isinstance(current, bool):
                value = int(value)
            elif isinstance(current, float):
                value = float(value)
            elif isinstance(current, dict):
                value = {str(k): float(v) for k, v in dict(value).items()}
            elif isinstance(current, str):
                value = str(value)
            setattr(s, name, value)
        s.weights = normalize_weights(s.weights, DEFAULT_WEIGHTS)
        return s

    def snapshot(self) -> dict[str, Any]:
        return asdict(self)


def normalize_weights(weights: dict[str, float] | None, fallback: dict[str, float]) -> dict[str, float]:
    """Gewichte auf die fünf Teil-Scores beschränken, negative entfernen und auf Summe 1 bringen."""
    clean = {k: max(0.0, float((weights or {}).get(k, 0.0) or 0.0)) for k in SUBSCORE_KEYS}
    total = sum(clean.values())
    if total <= 0:
        clean = {k: float(fallback.get(k, 0.0)) for k in SUBSCORE_KEYS}
        total = sum(clean.values()) or 1.0
    return {k: v / total for k, v in clean.items()}


@dataclass
class RuntimeConfig:
    """Laufzeit-Konfiguration aus Umgebungsvariablen (nicht in der Datenbank: Zugänge und Anbieter)."""

    db_url: str = "postgresql://postgres:postgres@localhost:54362/postgres"
    db_role: str | None = "fermata_matcher"
    llm_backend: str = "fake"  # fake | bedrock | bedrock-mantle | none
    embedding_backend: str = "fake"  # fake | titan | none
    aws_region: str = "eu-central-1"
    llm_model_override: str | None = None
    fake_art9_rate: float = 0.0
    env: str | None = None  # FERMATA_ENV (production, staging, local, test, ci); None = nur die Datenbank entscheidet

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> RuntimeConfig:
        e = os.environ if env is None else env
        role = e.get("FERMATA_MATCHER_DB_ROLE", "fermata_matcher")
        return cls(
            db_url=e.get("FERMATA_MATCHER_DB_URL") or e.get("DATABASE_URL") or cls.db_url,
            db_role=None if role.lower() in ("", "none", "-") else role,
            llm_backend=e.get("FERMATA_LLM_BACKEND", cls.llm_backend),
            embedding_backend=e.get("FERMATA_EMBEDDING_BACKEND", cls.embedding_backend),
            aws_region=e.get("FERMATA_AWS_REGION") or e.get("AWS_REGION") or cls.aws_region,
            llm_model_override=e.get("FERMATA_LLM_MODEL_ID") or None,
            fake_art9_rate=float(e.get("FERMATA_FAKE_ART9_RATE", "0") or 0),
            env=(e.get("FERMATA_ENV") or "").strip().lower() or None,
        )


class ProductionGuardError(RuntimeError):
    """In Produktion darf der Auswahl-Job nicht mit Attrappen rechnen (DSFA M-3)."""


def production_problems(llm_backend: str, embedding_backend: str, env: str | None, db_env: str | None) -> list[str]:
    """Liefert die Gründe, warum der Lauf so nicht starten darf (leer = in Ordnung).

    Produktion ist, wenn FERMATA_ENV=production gesetzt ist oder die Datenbank (ops.environment()) production meldet.
    Kann die Datenbank ihre Umgebung nicht nennen, gilt das wie Produktion (auf Nummer sicher).
    Attrappen („fake“) sind dort verboten; „none“ (nur Regeln, ohne Sprachmodell bzw. Embeddings) bleibt erlaubt.
    """
    production = env == "production" or db_env == "production" or db_env is None
    if not production:
        return []
    where = (
        "FERMATA_ENV=production"
        if env == "production"
        else ("Datenbank meldet production" if db_env == "production" else "Umgebung der Datenbank unbekannt")
    )
    problems: list[str] = []
    if llm_backend == "fake":
        problems.append(
            f"FERMATA_LLM_BACKEND=fake ist in Produktion verboten ({where}); bedrock, bedrock-mantle oder none setzen"
        )
    if embedding_backend == "fake":
        problems.append(f"FERMATA_EMBEDDING_BACKEND=fake ist in Produktion verboten ({where}); titan oder none setzen")
    return problems


def ensure_production_safe(llm_backend: str, embedding_backend: str, env: str | None, db_env: str | None) -> None:
    problems = production_problems(llm_backend, embedding_backend, env, db_env)
    if problems:
        raise ProductionGuardError("Auswahl-Job verweigert den Lauf: " + "; ".join(problems))
