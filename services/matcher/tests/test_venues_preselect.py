"""Lokal-Wahl (Mitte, Verhältnis, Gleichstand, Tische) und Vorauswahl (Top-N)."""

from __future__ import annotations

from datetime import timedelta

import pytest

from fermata_matcher.config import MatchSettings
from fermata_matcher.models import PairInfo, Venue
from fermata_matcher.preselect import pre_score, top_n
from fermata_matcher.venues import choose_venue, detour_ratio, initial_capacity

from conftest import PERIOD_START, make_venue, ts

D = PERIOD_START
WINDOWS = [(ts(D, 18), ts(D, 23)), (ts(D + timedelta(days=2), 18), ts(D + timedelta(days=2), 23))]


def info(venues: list[tuple[int, float, float]]) -> PairInfo:
    return PairInfo(0, 1, 20.0, WINDOWS, 2, venues)


def venues_list(n: int, slots=None) -> list[Venue]:
    return [make_venue(f"Lokal {k}", slots=slots) for k in range(n)]


def test_min_max_distance_wins():
    s = MatchSettings()
    vs = venues_list(3)
    choice = choose_venue(info([(0, 2.0, 18.0), (1, 9.0, 11.0), (2, 12.0, 12.5)]), vs, initial_capacity(vs), s)
    assert choice.venue_index == 1  # max 11 km < 12,5 km < 18 km
    assert choice.ratio_ok
    assert "Lokal 1" in choice.reason and "Verhältnis 1.22" in choice.reason


def test_ratio_constraint_beats_smaller_max():
    s = MatchSettings()
    s.venue_max_detour_ratio = 1.3
    vs = venues_list(2)
    # Lokal 0: max 10 km, aber 10/5 = 2,0; Lokal 1: max 11 km, 11/10 = 1,1 → Lokal 1
    choice = choose_venue(info([(0, 5.0, 10.0), (1, 10.0, 11.0)]), vs, initial_capacity(vs), s)
    assert choice.venue_index == 1


def test_ratio_fallback_is_flagged():
    s = MatchSettings()
    vs = venues_list(1)
    choice = choose_venue(info([(0, 3.0, 12.0)]), vs, initial_capacity(vs), s)
    assert choice is not None and not choice.ratio_ok
    assert "Hinweis" in choice.reason


def test_ratio_ignored_for_short_trips():
    s = MatchSettings()
    s.venue_ratio_min_km = 5
    vs = venues_list(1)
    choice = choose_venue(info([(0, 0.5, 3.0)]), vs, initial_capacity(vs), s)
    assert choice.ratio_ok  # längere Anfahrt 3 km < 5 km


def test_tie_goes_to_earlier_slot():
    s = MatchSettings()
    early = make_venue("Früh", slots=[(ts(D, 18), 1)])
    late = make_venue("Spät", slots=[(ts(D + timedelta(days=2), 19), 1)])
    vs = [late, early]
    choice = choose_venue(info([(0, 8.0, 8.0), (1, 8.0, 8.04)]), vs, initial_capacity(vs), s)
    assert choice.venue_index == 1


def test_capacity_is_respected():
    s = MatchSettings()
    vs = [make_venue("Klein", slots=[(ts(D, 19), 1)])]
    cap = initial_capacity(vs)
    first = choose_venue(info([(0, 5.0, 5.0)]), vs, cap, s)
    cap[(first.venue_index, first.slot_index)] -= 1
    assert choose_venue(info([(0, 5.0, 5.0)]), vs, cap, s) is None


def test_detour_ratio():
    assert detour_ratio(10, 5) == 2.0
    assert detour_ratio(0, 3) == pytest.approx(30.0)


def test_top_n_union_and_mutual():
    scores = {(0, 1): 0.9, (0, 2): 0.8, (0, 3): 0.7, (1, 2): 0.2, (2, 3): 0.6}
    union = top_n(scores, 1, "union")
    # 0 → (0,1); 1 → (0,1); 2 → (0,2); 3 → (0,3)
    assert union == {(0, 1), (0, 2), (0, 3)}
    mutual = top_n(scores, 1, "mutual")
    assert mutual == {(0, 1)}
    assert top_n(scores, 10, "union") == set(scores)
    assert top_n(scores, 0, "union") == set()


def test_top_n_is_deterministic_on_ties():
    scores = {(0, 1): 0.5, (0, 2): 0.5, (0, 3): 0.5}
    assert top_n(scores, 1, "mutual") == {(0, 1)}


def test_pre_score_uses_similarity_else_rule():
    assert pre_score((0, 1), {(0, 1): 0.42}, {(0, 1): 0.9}) == 0.42
    assert pre_score((0, 2), {(0, 1): 0.42}, {(0, 2): 0.9}) == 0.9
