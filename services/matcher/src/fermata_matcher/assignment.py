"""Zuordnung (PLAN 2.5, 5.9): größtes Gewicht auf einem dünnen Graphen, Teilgraphen einzeln gerechnet.

- Knoten: Personen; Kanten: Paare über dem Mindestscore, die in der Vorauswahl (Top-N) sind; Gewicht: Gesamtscore.
- `networkx.max_weight_matching` mit `maxcardinality` (Einstellung matching.max_cardinality): zuerst möglichst
  viele Paare, dann die höchste Summe.
- Jeder zusammenhängende Teil wird einzeln gerechnet und gemessen.
- Ersatz (PLAN 5.9): Braucht networkx für einen großen Teilgraphen länger als matching.assignment_timeout_seconds,
  wird der Prozess beendet und die Ersatz-Bibliothek „mwmatching“ (O(n·m·log n)) genutzt, wenn sie installiert
  ist. Sie ist nicht auf PyPI; ohne sie greift eine gierige Zuordnung (höchstes Gewicht zuerst, mindestens halb so
  gut wie das Optimum), und der Bericht weist darauf hin.
"""

from __future__ import annotations

import importlib
import multiprocessing as mp
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import networkx as nx

Edge = tuple[int, int, float]


@dataclass
class ComponentStats:
    nodes: int
    edges: int
    engine: str
    seconds: float
    matched_pairs: int


@dataclass
class AssignmentResult:
    pairs: list[tuple[int, int]] = field(default_factory=list)
    components: list[ComponentStats] = field(default_factory=list)
    seconds: float = 0.0
    notes: list[str] = field(default_factory=list)

    def summary(self) -> dict[str, Any]:
        sizes = sorted((c.nodes for c in self.components), reverse=True)
        engines: dict[str, int] = {}
        for c in self.components:
            engines[c.engine] = engines.get(c.engine, 0) + 1
        slowest = max(self.components, key=lambda c: c.seconds, default=None)
        return {
            "teilgraphen": len(self.components),
            "groesste_teilgraphen": sizes[:5],
            "kanten": sum(c.edges for c in self.components),
            "paare": len(self.pairs),
            "verfahren": engines,
            "sekunden": round(self.seconds, 3),
            "langsamster_teilgraph": None
            if slowest is None
            else {"knoten": slowest.nodes, "kanten": slowest.edges, "sekunden": round(slowest.seconds, 3)},
            "hinweise": self.notes,
        }


def _nx_matching(edges: list[Edge], maxcardinality: bool) -> list[tuple[int, int]]:
    g = nx.Graph()
    g.add_weighted_edges_from(edges)
    m = nx.max_weight_matching(g, maxcardinality=maxcardinality, weight="weight")
    return [(min(a, b), max(a, b)) for a, b in m]


def _nx_worker(edges: list[Edge], maxcardinality: bool, queue: Any) -> None:  # pragma: no cover - eigener Prozess
    queue.put(_nx_matching(edges, maxcardinality))


def mwmatching_available() -> bool:
    try:
        importlib.import_module("mwmatching")
    except ImportError:
        return False
    return True


def _mwmatching(edges: list[Edge], maxcardinality: bool) -> list[tuple[int, int]]:
    """Adapter für mwmatching (J. van Rantwijk, MIT). Knoten werden auf 0..n−1 umnummeriert."""
    mw = importlib.import_module("mwmatching")
    nodes = sorted({a for a, _, _ in edges} | {b for _, b, _ in edges})
    index = {v: k for k, v in enumerate(nodes)}
    local = [(index[a], index[b], float(w)) for a, b, w in edges]
    if maxcardinality and hasattr(mw, "adjust_weights_for_maximum_cardinality_matching"):
        local = mw.adjust_weights_for_maximum_cardinality_matching(local)
    matched = mw.maximum_weight_matching(local)
    return [(min(nodes[a], nodes[b]), max(nodes[a], nodes[b])) for a, b in matched]


def greedy_matching(edges: list[Edge]) -> list[tuple[int, int]]:
    """Höchstes Gewicht zuerst; garantiert mindestens die Hälfte des optimalen Gewichts."""
    used: set[int] = set()
    out: list[tuple[int, int]] = []
    for a, b, _ in sorted(edges, key=lambda e: (-e[2], e[0], e[1])):
        if a in used or b in used:
            continue
        used.update((a, b))
        out.append((min(a, b), max(a, b)))
    return out


def _run_with_timeout(edges: list[Edge], maxcardinality: bool, timeout: float) -> list[tuple[int, int]] | None:
    ctx = mp.get_context("spawn")
    queue = ctx.Queue()
    proc = ctx.Process(target=_nx_worker, args=(edges, maxcardinality, queue), daemon=True)
    proc.start()
    try:
        result = queue.get(timeout=timeout)
    except Exception:
        result = None
    proc.join(timeout=1)
    if proc.is_alive():
        proc.terminate()
        proc.join(timeout=5)
    return result


def components(edges: list[Edge]) -> list[list[Edge]]:
    g = nx.Graph()
    g.add_weighted_edges_from(edges)
    out: list[list[Edge]] = []
    for comp in nx.connected_components(g):
        sub = g.subgraph(comp)
        out.append([(min(a, b), max(a, b), float(d["weight"])) for a, b, d in sub.edges(data=True)])
    out.sort(key=lambda es: -len(es))
    return out


def assign(
    edges: list[Edge],
    *,
    maxcardinality: bool = True,
    timeout_seconds: float = 120.0,
    inline_max_nodes: int = 600,
    engine: str = "auto",
    fallback: Callable[[list[Edge], bool], list[tuple[int, int]]] | None = None,
) -> AssignmentResult:
    """Zuordnung je Teilgraph. engine: auto (networkx, bei Zeitüberschreitung Ersatz) | networkx | mwmatching | greedy."""
    t0 = time.perf_counter()
    result = AssignmentResult()
    for comp_edges in components(edges):
        nodes = len({a for a, _, _ in comp_edges} | {b for _, b, _ in comp_edges})
        t = time.perf_counter()
        used = engine
        if engine == "greedy":
            pairs = greedy_matching(comp_edges)
        elif engine == "mwmatching":
            pairs = _mwmatching(comp_edges, maxcardinality)
        elif engine == "networkx" or nodes <= inline_max_nodes:
            used = "networkx"
            pairs = _nx_matching(comp_edges, maxcardinality)
        else:
            maybe = _run_with_timeout(comp_edges, maxcardinality, timeout_seconds)
            if maybe is not None:
                used, pairs = "networkx", maybe
            else:
                result.notes.append(
                    f"networkx brauchte für einen Teilgraphen mit {nodes} Personen länger als {timeout_seconds:.0f} s."
                )
                if fallback is not None:
                    used, pairs = "ersatz", fallback(comp_edges, maxcardinality)
                elif mwmatching_available():
                    used, pairs = "mwmatching", _mwmatching(comp_edges, maxcardinality)
                else:
                    used, pairs = "greedy", greedy_matching(comp_edges)
                    result.notes.append(
                        "mwmatching ist nicht installiert (nicht auf PyPI); gierige Ersatz-Zuordnung verwendet."
                    )
        result.pairs.extend(pairs)
        result.components.append(ComponentStats(nodes, len(comp_edges), used, time.perf_counter() - t, len(pairs)))
    result.seconds = time.perf_counter() - t0
    return result
