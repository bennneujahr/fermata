"""Gemeinsame Fenster, Plätze, Entfernungen und Bausteine des Berichts."""

from __future__ import annotations

from datetime import timedelta

import pytest

from fermata_matcher.availability import (
    day_mask,
    distinct_days,
    earliest_slot_in_windows,
    shared_windows,
    slots_in_windows,
)
from fermata_matcher.config import MatchSettings, RuntimeConfig
from fermata_matcher.geo import haversine_km
from fermata_matcher.report import StageTimer, cost_estimate, distribution

from conftest import HAMBURG, PERIOD_START, SCHWERIN, WISMAR, ts

D = PERIOD_START


def test_shared_windows_matches_db_semantics():
    a = [(ts(D, 17), ts(D, 22)), (ts(D, 22, 30), ts(D, 23, 59))]
    b = [(ts(D, 18), ts(D, 23, 30))]
    # Schnitt 1: 18–22 (240 min), Schnitt 2: 22:30–23:30 (60 min, zu kurz)
    assert shared_windows(a, b, 120 * 60) == [(ts(D, 18), ts(D, 22))]
    assert shared_windows(a, b, 60 * 60) == [(ts(D, 18), ts(D, 22)), (ts(D, 22, 30), ts(D, 23, 30))]
    assert shared_windows(a, [], 60) == []
    # Berührung ohne Überlappung zählt nicht
    assert shared_windows([(0, 100)], [(100, 200)], 0) == []


def test_distinct_days_and_mask():
    w = [(ts(D, 18), ts(D, 22)), (ts(D, 12), ts(D, 15)), (ts(D + timedelta(days=3), 18), ts(D + timedelta(days=3), 22))]
    assert distinct_days(w) == 2
    assert day_mask(w, 120 * 60, D, 14) == (1 << 0) | (1 << 3)
    assert day_mask([(ts(D, 18), ts(D, 19))], 120 * 60, D, 14) == 0  # zu kurz
    # über Mitternacht: beide Tage
    assert day_mask([(ts(D, 22), ts(D + timedelta(days=1), 1))], 120 * 60, D, 14) == 0b11


def test_slots_in_windows():
    slots = [ts(D, 17), ts(D, 19), ts(D, 21), ts(D + timedelta(days=1), 19)]
    windows = [(ts(D, 18), ts(D, 23))]
    assert slots_in_windows(slots, windows, 120 * 60) == [1, 2]  # 21 Uhr + 2 h = 23 Uhr passt genau
    assert earliest_slot_in_windows(slots, windows, 120 * 60) == 1
    assert earliest_slot_in_windows(slots, windows, 300 * 60) is None


def test_distances_between_regions():
    assert haversine_km(*SCHWERIN, *WISMAR) == pytest.approx(29.5, abs=1.5)
    assert haversine_km(*SCHWERIN, *HAMBURG) == pytest.approx(94, abs=3)
    assert haversine_km(*SCHWERIN, *SCHWERIN) == 0


def test_distribution():
    d = distribution([0.05, 0.62, 0.65, 0.9, 1.05])
    assert d["anzahl"] == 5 and d["min"] == 0.05 and d["max"] == 1.05 and d["median"] == 0.65
    hist = {h["von"]: h["anzahl"] for h in d["histogramm"]}
    assert hist[0.0] == 1 and hist[0.6] == 2 and hist[0.9] == 2  # Werte > 1 im letzten Fach
    assert sum(hist.values()) == 5
    assert distribution([]) == {"anzahl": 0}


def test_cost_estimate():
    c = cost_estimate(10.0, 2_000_000, 0.02, 0.9)
    assert c == {"llm_usd": 10.0, "embeddings_usd": 0.04, "gesamt_usd": 10.04, "gesamt_eur": pytest.approx(9.036)}


def test_stage_timer():
    t = StageTimer()
    with t.stage("a"):
        pass
    with t.stage("a"):
        pass
    js = t.as_json()
    assert set(js) == {"a", "gesamt"} and js["gesamt"] >= 0


def test_settings_from_mapping():
    s = MatchSettings.from_mapping(
        {
            "matching.min_score": 0.7,
            "matching.candidates_per_person": 5,
            "matching.weights": {"werte": 1, "zeiten": 1},
            "matching.max_cardinality": False,
            "unbekannt.schluessel": 3,
            "analysis.llm_model_id": "eu.x",
        }
    )
    assert s.min_score == 0.7 and s.candidates_per_person == 5 and s.max_cardinality is False
    assert s.weights["werte"] == 0.5 and s.weights["zeiten"] == 0.5 and s.weights["wuensche"] == 0
    assert s.llm_model_id == "eu.x"


def test_runtime_config_from_env():
    cfg = RuntimeConfig.from_env(
        {"FERMATA_MATCHER_DB_ROLE": "none", "FERMATA_LLM_BACKEND": "bedrock", "AWS_REGION": "eu-west-1"}
    )
    assert cfg.db_role is None and cfg.llm_backend == "bedrock" and cfg.aws_region == "eu-west-1"
    assert RuntimeConfig.from_env({}).db_role == "fermata_matcher"
