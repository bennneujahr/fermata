"""Teil-Scores, Gewichte, Gesamtscore und Wartebonus – nachgerechnet."""

from __future__ import annotations

import pytest

from fermata_matcher import scoring as sc
from fermata_matcher.config import MatchSettings, normalize_weights

from conftest import make_person


def test_numeric_map_scales():
    assert sc.numeric_map({"a": 0.2, "b": 1.0}) == {"a": 0.2, "b": 1.0}
    assert sc.numeric_map({"a": 1, "b": 5, "c": 3}) == {"a": 0.0, "b": 1.0, "c": 0.5}  # Skala 1..5
    assert sc.numeric_map({"a": 80, "b": 20}) == {"a": 0.8, "b": 0.2}  # Skala 0..100
    assert sc.numeric_map({"a": "hoch", "b": True, "c": 0.4}) == {"c": 0.4}
    assert sc.numeric_map(None) == {}


def test_weighted_value_agreement_by_hand():
    a = {"familie": 1.0, "karriere": 0.2}
    b = {"familie": 0.6, "karriere": 0.2, "natur": 0.9}
    # gemeinsam: familie (w = 1.0 + 0.05, diff 0.4), karriere (w = 0.2 + 0.05, diff 0)
    expected = 1 - (1.05 * 0.4) / (1.05 + 0.25)
    assert sc.weighted_value_agreement(a, b) == pytest.approx(expected)
    assert sc.weighted_value_agreement({"x": 0.5}, {"y": 0.5}) is None
    assert sc.weighted_value_agreement(a, a) == pytest.approx(1.0)


def test_important_differences_weigh_more():
    unimportant = sc.weighted_value_agreement({"a": 0.0, "b": 1.0}, {"a": 0.3, "b": 1.0})
    important = sc.weighted_value_agreement({"a": 1.0, "b": 0.0}, {"a": 0.7, "b": 0.0})
    assert important < unimportant


def test_personality_similarity():
    a = make_person(personality={"offenheit": 0.8, "extraversion": 0.2, "unbekannt": 0.9})
    b = make_person(personality={"merkmale": {"offenheit": 0.6, "extraversion": 0.6}})
    assert sc.score_persoenlichkeit(a, b) == pytest.approx(1 - (0.2 + 0.4) / 2)
    c = make_person(personality={})
    assert sc.score_persoenlichkeit(a, c) is None


def test_wishes_directional_and_children():
    a = make_person(values_profile={"werte": {}, "gegenueber": {"extraversion": 0.8}}, wants_children="ja")
    b = make_person(
        personality={"extraversion": 0.4}, values_profile={"werte": {}, "gegenueber": {}}, wants_children="ja"
    )
    # A wünscht 0,8, B hat 0,4 → 0,6; B wünscht nichts → nur eine Richtung; Kinderwunsch ja/ja → 1
    assert sc.wish_fit(a, b) == pytest.approx(0.6)
    assert sc.wish_fit(b, a) is None
    assert sc.score_wuensche(a, b) == pytest.approx((0.6 + 1.0) / 2)
    b.wants_children = "nein"
    assert sc.children_wish_fit(a, b) == 0.0
    assert sc.score_wuensche(a, b) == pytest.approx(0.3)


@pytest.mark.parametrize(
    ("x", "y", "expected"),
    [
        ("ja", "ja", 1.0),
        ("nein", "nein", 1.0),
        ("ja", "nein", 0.0),
        ("ja", "offen", 0.7),
        ("nein", "vielleicht", 0.5),
        ("offen", "vielleicht", 0.8),
        ("offen", "offen", 0.9),
    ],
)
def test_children_wish_matrix(x, y, expected):
    assert sc.children_wish_fit(make_person(wants_children=x), make_person(wants_children=y)) == expected
    assert sc.children_wish_fit(make_person(wants_children=y), make_person(wants_children=x)) == expected


@pytest.mark.parametrize(
    ("x", "y", "expected"),
    [
        ("nein", "nein", 1.0),
        ("ja", "ja", 1.0),
        ("nein", "gelegentlich", 0.6),
        ("gelegentlich", "ja", 0.7),
        ("nein", "ja", 0.3),
    ],
)
def test_smoking_matrix(x, y, expected):
    assert sc.smoking_fit(make_person(smoking=x), make_person(smoking=y)) == expected


def test_age_and_distance_fit():
    assert sc.age_fit(make_person(age=40), make_person(age=43)) == 1.0
    assert sc.age_fit(make_person(age=40), make_person(age=49)) == pytest.approx(1 - 0.7 * 6 / 12)
    assert sc.age_fit(make_person(age=30), make_person(age=60)) == 0.3
    assert sc.distance_fit(0, 30) == 1.0
    assert sc.distance_fit(15, 30) == pytest.approx(0.65)
    assert sc.distance_fit(45, 30) == pytest.approx(0.3)


def test_interests_overlap_normalizes():
    a = make_person(life={"interessen": ["Wandern", "Kochen", "Jazz", "Segeln"]})
    b = make_person(life={"interessen": ["wandern", "KOCHEN"]})
    assert sc.interests_overlap(a, b) == 1.0  # beide Interessen von B teilt A
    c = make_person(life={"interessen": ["Gärtnern"]})
    d = make_person(life={"interessen": ["gartnern"]})
    assert sc.interests_overlap(c, d) == 1.0  # Umlaute werden vereinheitlicht


def test_worktime_fit():
    def p(w):
        return make_person(life={"arbeitszeiten": w})

    assert sc.worktime_fit(p("schicht"), p("schicht")) == 1.0
    assert sc.worktime_fit(p("schicht"), p("tagsueber")) == 0.6
    assert sc.worktime_fit(p("flexibel"), p("schicht")) == 0.9
    assert sc.worktime_fit(p("tagsueber"), p("wochenende")) == 0.8


def test_lebensumstaende_is_mean_of_available_parts():
    a = make_person(life={"interessen": ["Wandern"]}, smoking="nein", has_children=None, age=40)
    b = make_person(life={"interessen": ["Wandern"]}, smoking="nein", has_children=None, age=40)
    # Interessen 1, Rauchen 1, Alter 1, Entfernung (0 km) 1; Lebensstil, Kinder, Arbeitszeiten fehlen
    assert sc.score_lebensumstaende(a, b, 0.0, 30.0) == pytest.approx(1.0)
    assert sc.score_lebensumstaende(a, b, 30.0, 30.0) == pytest.approx((1 + 1 + 1 + 0.3) / 4)


def test_zeiten():
    assert sc.score_zeiten(0) == 0.0
    assert sc.score_zeiten(1) == pytest.approx(1 / 3)
    assert sc.score_zeiten(5) == 1.0


def test_effective_weights_blend_personal():
    s = MatchSettings()
    s.personal_weight_share = 0.5
    p = make_person(personal_weights={"werte": 1.0})
    w = sc.effective_weights(p, s)
    assert sum(w.values()) == pytest.approx(1.0)
    assert w["werte"] == pytest.approx(0.5 * 0.30 + 0.5 * 1.0)
    assert w["zeiten"] == pytest.approx(0.5 * 0.10)
    assert sc.effective_weights(make_person(personal_weights=None), s) == s.weights


def test_normalize_weights_ignores_unknown_and_negative():
    w = normalize_weights({"werte": 2, "zeiten": -1, "unbekannt": 5}, {"werte": 1})
    assert w["werte"] == 1.0 and w["zeiten"] == 0.0


def test_rule_score_missing_parts_are_neutral(settings):
    a = make_person(
        personality={}, values_profile={}, life={}, smoking=None, has_children=None, wants_children=None, age=None
    )
    b = make_person(
        personality={}, values_profile={}, life={}, smoking=None, has_children=None, wants_children=None, age=None
    )
    r = sc.rule_score(a, b, settings, distance_km=0.0, limit_km=30.0, shared_days=3)
    # Nur Zeiten (1,0) und Lebensumstände (nur Entfernung: 1,0) vorhanden, Rest neutral 0,5
    expected = 0.30 * 0.5 + 0.25 * 0.5 + 0.15 * 1.0 + 0.20 * 0.5 + 0.10 * 1.0
    assert r.score == pytest.approx(expected)
    assert set(r.missing) == {"werte", "wuensche", "persoenlichkeit"}
    js = r.as_json()
    assert js["fehlt"] == r.missing and js["zeiten"] == 1.0


def test_wait_bonus_is_capped(settings):
    settings.wait_bonus_per_round = 0.02
    settings.wait_bonus_max = 0.10
    assert sc.wait_bonus(0, 0, settings) == 0.0
    assert sc.wait_bonus(2, 0, settings) == pytest.approx(0.02)
    assert sc.wait_bonus(3, 3, settings) == pytest.approx(0.06)
    assert sc.wait_bonus(20, 30, settings) == pytest.approx(0.10)


def test_combine(settings):
    settings.llm_weight = 0.5
    assert sc.combine(0.6, 0.8, settings) == pytest.approx(0.7)
    assert sc.combine(0.6, None, settings) == 0.6
    settings.llm_weight = 0.25
    assert sc.combine(0.8, 0.4, settings) == pytest.approx(0.7)
