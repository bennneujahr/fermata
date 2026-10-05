"""Zuordnung: optimal auf kleinen Graphen (gegen Brute Force), Teilgraphen, Ersatz-Weiche."""

from __future__ import annotations

import itertools
import random
import sys
import types

import pytest

from fermata_matcher import assignment as asg


def brute_force(edges, maxcardinality):
    """Alle Teilmengen disjunkter Kanten; Ziel (Anzahl, Gewicht) bzw. nur Gewicht."""
    best_key = (-1, -1.0)
    for r in range(len(edges) + 1):
        for subset in itertools.combinations(edges, r):
            nodes = [v for e in subset for v in e[:2]]
            if len(nodes) != len(set(nodes)):
                continue
            w = sum(e[2] for e in subset)
            key = (len(subset), w) if maxcardinality else (0, w)
            if key[0] > best_key[0] or (key[0] == best_key[0] and key[1] > best_key[1] + 1e-9):
                best_key = key
    return best_key


def value(pairs, edges, maxcardinality):
    weights = {(min(a, b), max(a, b)): w for a, b, w in edges}
    w = sum(weights[p] for p in pairs)
    return (len(pairs), w) if maxcardinality else (0, w)


@pytest.mark.parametrize("maxcardinality", [True, False])
@pytest.mark.parametrize("seed", range(25))
def test_optimal_on_random_small_graphs(seed, maxcardinality):
    rnd = random.Random(seed)
    n = rnd.randint(2, 8)
    edges = []
    for a, b in itertools.combinations(range(n), 2):
        if rnd.random() < 0.45:
            edges.append((a, b, round(rnd.uniform(0.6, 1.1), 3)))
    if len(edges) > 12:
        edges = edges[:12]
    res = asg.assign(edges, maxcardinality=maxcardinality)
    used = [v for p in res.pairs for v in p]
    assert len(used) == len(set(used)), "jede Person höchstens einmal"
    assert set(res.pairs) <= {(min(a, b), max(a, b)) for a, b, _ in edges}
    got = value(res.pairs, edges, maxcardinality)
    best = brute_force(edges, maxcardinality)
    assert got[0] == best[0]
    assert got[1] == pytest.approx(best[1], abs=1e-6)


def test_max_cardinality_prefers_more_pairs():
    # Pfad 0-1-2-3: Mitte schwer (1,0), Außen 0,6 + 0,6 → zwei Paare (1,2) statt eines (1,0)
    edges = [(0, 1, 0.6), (1, 2, 1.0), (2, 3, 0.6)]
    assert sorted(asg.assign(edges, maxcardinality=True).pairs) == [(0, 1), (2, 3)]
    edges = [(0, 1, 0.3), (1, 2, 1.0), (2, 3, 0.3)]
    assert asg.assign(edges, maxcardinality=False).pairs == [(1, 2)]
    assert sorted(asg.assign(edges, maxcardinality=True).pairs) == [(0, 1), (2, 3)]


def test_components_are_solved_separately():
    edges = [(0, 1, 0.9), (1, 2, 0.8), (10, 11, 0.7), (20, 21, 0.65), (21, 22, 0.66)]
    res = asg.assign(edges)
    assert len(res.components) == 3
    assert sorted(c.nodes for c in res.components) == [2, 3, 3]
    assert len(res.pairs) == 3
    s = res.summary()
    assert s["teilgraphen"] == 3 and s["paare"] == 3 and s["verfahren"] == {"networkx": 3}


def test_greedy_is_half_optimal():
    edges = [(0, 1, 1.0), (1, 2, 0.99), (2, 3, 1.0), (0, 3, 0.99)]
    g = asg.greedy_matching(edges)
    assert sorted(g) == [(0, 1), (2, 3)]
    triangle_trap = [(0, 1, 1.0), (1, 2, 0.9), (0, 3, 0.9)]
    assert asg.greedy_matching(triangle_trap) == [(0, 1)]  # Optimum wäre 1,8; gierig 1,0 ≥ 1,8 / 2


def test_timeout_switches_to_fallback():
    rnd = random.Random(7)
    edges = [(a, b, rnd.uniform(0.6, 1)) for a, b in itertools.combinations(range(40), 2) if rnd.random() < 0.3]
    calls = []

    def fallback(es, maxcard):
        calls.append(len(es))
        return asg.greedy_matching(es)

    res = asg.assign(edges, timeout_seconds=0.000001, inline_max_nodes=0, fallback=fallback)
    assert calls, "Ersatz wurde nicht verwendet"
    assert res.components[0].engine == "ersatz"
    assert res.notes and "länger als" in res.notes[0]


def test_timeout_without_mwmatching_uses_greedy(monkeypatch):
    monkeypatch.setattr(asg, "mwmatching_available", lambda: False)
    edges = [(0, 1, 0.9), (1, 2, 0.8), (2, 3, 0.7)]
    res = asg.assign(edges, timeout_seconds=0.000001, inline_max_nodes=0)
    assert res.components[0].engine == "greedy"
    assert any("nicht installiert" in n for n in res.notes)


def test_subprocess_networkx_within_timeout():
    edges = [(0, 1, 0.9), (1, 2, 0.8), (2, 3, 0.7)]
    res = asg.assign(edges, timeout_seconds=60, inline_max_nodes=0)
    assert res.components[0].engine == "networkx"
    assert sorted(res.pairs) == [(0, 1), (2, 3)]


def test_mwmatching_adapter_with_injected_module(monkeypatch):
    calls = {}

    def maximum_weight_matching(edges):
        calls["edges"] = edges
        return asg.greedy_matching(edges)

    fake = types.SimpleNamespace(maximum_weight_matching=maximum_weight_matching)
    monkeypatch.setitem(sys.modules, "mwmatching", fake)
    assert asg.mwmatching_available()
    res = asg.assign([(10, 20, 0.9), (20, 30, 0.8)], engine="mwmatching")
    assert res.pairs == [(10, 20)]
    assert {a for a, _, _ in calls["edges"]} <= {0, 1, 2}  # umnummeriert
