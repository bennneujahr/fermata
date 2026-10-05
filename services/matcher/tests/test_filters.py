"""Harte Filter (ohne Datenbank): Entfernung, Alter, Sprache, jeder Deal-Breaker, Paar-Ausschlüsse, Zeit, Lokal."""

from __future__ import annotations

from datetime import timedelta

import pytest

from fermata_matcher.filters import REASON_ORDER, age_range, dealbreaker_smoking, hard_filter
from fermata_matcher.geo import haversine_km, travel_limit_km
from fermata_matcher.models import Dealbreaker, Period

from conftest import HAMBURG, PERIOD_START, SCHWERIN, WISMAR, make_person, make_venue, ts

PERIOD = Period("p", PERIOD_START, PERIOD_START + timedelta(days=13))


def run(a, b, venues=None, settings=None, excluded=None):
    from fermata_matcher.config import MatchSettings

    s = settings or MatchSettings()
    people = sorted([a, b], key=lambda p: p.user_id)
    return hard_filter(people, venues if venues is not None else [make_venue()], s, PERIOD, excluded)


def only_reason(res):
    assert not res.pairs
    assert sum(res.drops.values()) == 1
    return next(iter(res.drops))


def test_compatible_pair_passes():
    res = run(make_person(), make_person())
    assert len(res.pairs) == 1
    info = next(iter(res.pairs.values()))
    assert info.shared_days == 2 and info.venues


def test_distance_uses_smaller_travel_limit():
    a = make_person(lat=SCHWERIN[0], lon=SCHWERIN[1], travel_max_km=50)
    b = make_person(lat=WISMAR[0], lon=WISMAR[1], travel_max_km=20)  # ca. 30 km
    assert 25 < haversine_km(*SCHWERIN, *WISMAR) < 35
    assert only_reason(run(a, b)) == "entfernung"
    b.travel_max_km = 40
    venue = make_venue(lat=53.76, lon=11.44)  # in der Mitte
    assert len(run(a, b, [venue]).pairs) == 1


def test_travel_limit_variants():
    assert travel_limit_km(30, None, [], 60) == 30
    assert travel_limit_km(None, None, [], 60) == 60
    # 39 Minuten mit dem Auto: 39 × 50/60 / 1,3 = 25 km
    assert travel_limit_km(None, 39, ["auto", "rad"], 60) == pytest.approx(25.0)
    assert travel_limit_km(10, 39, ["auto"], 60) == 10
    assert travel_limit_km(None, 26, [], 60) == pytest.approx(26 * 0.5 / 1.3)  # ohne Angabe: ÖPNV


def test_age_ranges_both_directions():
    a = make_person(age=40, age_min=35, age_max=45)
    b = make_person(age=47, age_min=38, age_max=50)
    assert only_reason(run(a, b)) == "alter"  # B ist A zu alt
    b.age = 44
    assert len(run(a, b).pairs) == 1
    a.age = 37  # A ist B zu jung
    assert only_reason(run(a, b)) == "alter"


def test_default_age_window(settings):
    settings.default_age_window_years = 10
    p = make_person(age=40, age_min=None, age_max=None)
    assert age_range(p, settings) == (30, 50)
    p.age_min = 33
    assert age_range(p, settings) == (33, 99)
    q = make_person(age=22, age_min=None, age_max=None)
    assert age_range(q, settings) == (18, 32)


def test_language():
    a = make_person(languages=["de"])
    b = make_person(languages=["en"])
    assert only_reason(run(a, b)) == "sprache"
    b.languages = ["en", "de"]
    assert len(run(a, b).pairs) == 1


@pytest.mark.parametrize(
    ("dealbreaker", "other", "reason"),
    [
        (Dealbreaker("raucht", {}), {"smoking": "ja"}, "dealbreaker_raucht"),
        (Dealbreaker("raucht", {}), {"smoking": "gelegentlich"}, "dealbreaker_raucht"),
        (Dealbreaker("hat_kinder", {}), {"has_children": True}, "dealbreaker_hat_kinder"),
        (Dealbreaker("will_kinder", {}), {"wants_children": "ja"}, "dealbreaker_will_kinder"),
        (Dealbreaker("will_keine_kinder", {}), {"wants_children": "nein"}, "dealbreaker_will_keine_kinder"),
        (Dealbreaker("alter", {"min": 35, "max": 42}), {"age": 44}, "dealbreaker_alter"),
        (Dealbreaker("entfernung", {"max_km": 3}), {"lat": 53.70, "lon": 11.41}, "dealbreaker_entfernung"),
    ],
)
def test_each_dealbreaker_both_directions(dealbreaker, other, reason):
    a = make_person(dealbreakers=[dealbreaker])
    b = make_person(**other)
    venue = make_venue(lat=53.665, lon=11.41)
    assert only_reason(run(a, b, [venue])) == reason
    # umgekehrte Richtung: der Deal-Breaker liegt bei der anderen Person
    a2 = make_person(**other)
    b2 = make_person(dealbreakers=[dealbreaker])
    assert only_reason(run(a2, b2, [venue])) == reason


@pytest.mark.parametrize(
    ("dealbreaker", "other"),
    [
        (Dealbreaker("raucht", {"gelegentlich_ok": True}), {"smoking": "gelegentlich"}),
        (Dealbreaker("raucht", {}), {"smoking": None}),  # unbekannt: kein Ausschluss
        (Dealbreaker("hat_kinder", {}), {"has_children": False}),
        (Dealbreaker("will_kinder", {}), {"wants_children": "offen"}),
        (Dealbreaker("will_keine_kinder", {}), {"wants_children": "vielleicht"}),
        (Dealbreaker("alter", {"min": 35, "max": 42}), {"age": 41}),
        (Dealbreaker("sonstiges", {}, "Wer Tiere nicht mag, passt nicht."), {}),  # nur das LLM
    ],
)
def test_dealbreakers_that_do_not_apply(dealbreaker, other):
    assert len(run(make_person(dealbreakers=[dealbreaker]), make_person(**other)).pairs) == 1


def test_smoking_dealbreaker_levels():
    assert dealbreaker_smoking(make_person(dealbreakers=[])) == 0
    assert dealbreaker_smoking(make_person(dealbreakers=[Dealbreaker("raucht", {"gelegentlich_ok": True})])) == 1
    assert dealbreaker_smoking(make_person(dealbreakers=[Dealbreaker("raucht", {})])) == 2


@pytest.mark.parametrize("reason", ["schon_vorgeschlagen", "blockiert", "kuerzlich_abgelehnt"])
def test_excluded_pairs(reason):
    a, b = make_person(), make_person()
    assert only_reason(run(a, b, excluded={(0, 1): reason})) == reason


def test_no_shared_time():
    d = PERIOD_START
    a = make_person(windows=[(ts(d, 18), ts(d, 23))])
    b = make_person(windows=[(ts(d + timedelta(days=1), 18), ts(d + timedelta(days=1), 23))])
    assert only_reason(run(a, b)) == "keine_gemeinsame_zeit"
    # gleicher Tag, aber Überschneidung kürzer als 120 Minuten
    b.windows = [(ts(d, 21, 30), ts(d, 23, 59))]
    assert only_reason(run(a, b)) == "keine_gemeinsame_zeit"


def test_no_venue_in_reach_or_without_fitting_slot():
    a, b = make_person(travel_max_km=10), make_person(travel_max_km=10)
    far = make_venue(lat=HAMBURG[0], lon=HAMBURG[1])
    assert only_reason(run(a, b, [far])) == "kein_lokal"
    d = PERIOD_START
    late = make_venue(slots=[(ts(d, 22), 2)])  # 22 Uhr + 120 Minuten passt nicht ins Fenster bis 23 Uhr
    assert only_reason(run(a, b, [late])) == "kein_lokal"
    full = make_venue(slots=[(ts(d, 19), 0)])
    assert only_reason(run(a, b, [full])) == "kein_lokal"


def test_first_failing_reason_counts_in_documented_order():
    a = make_person(age=40, age_min=35, age_max=45, travel_max_km=5)
    b = make_person(age=60, lat=HAMBURG[0], lon=HAMBURG[1])  # zu weit UND zu alt
    assert only_reason(run(a, b)) == "entfernung"
    assert REASON_ORDER.index("entfernung") < REASON_ORDER.index("alter") < REASON_ORDER.index("geschlecht")


def test_counts_cover_all_pairs():
    people = [make_person() for _ in range(6)] + [make_person(age=70, age_min=65, age_max=80) for _ in range(2)]
    people.sort(key=lambda p: p.user_id)
    from fermata_matcher.config import MatchSettings

    res = hard_filter(people, [make_venue()], MatchSettings(), PERIOD)
    assert res.checked_pairs == 28
    assert len(res.pairs) + sum(res.drops.values()) == 28
    assert res.drops["alter"] == 12  # 6 × 2 gemischte Paare
