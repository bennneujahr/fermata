"""Vorauswahl: je Person die besten N Kandidaten (matching.candidates_per_person).

Rangfolge nach Kosinus-Ähnlichkeit der Embeddings (pgvector), wenn beide Personen eines haben; sonst nach dem
Regel-Score (PLAN 2.5: „sonst nur Regeln“). Modus „union“: Ein Paar kommt weiter, wenn es bei mindestens einer der
beiden Personen unter den Top-N ist; „mutual“: bei beiden.
"""

from __future__ import annotations

from collections import defaultdict

Pair = tuple[int, int]


def top_n(pre_scores: dict[Pair, float], n: int, mode: str = "union") -> set[Pair]:
    by_person: dict[int, list[tuple[float, int, Pair]]] = defaultdict(list)
    for pair, s in pre_scores.items():
        i, j = pair
        by_person[i].append((s, j, pair))
        by_person[j].append((s, i, pair))
    votes: dict[Pair, int] = defaultdict(int)
    for _person, items in by_person.items():
        items.sort(key=lambda x: (-x[0], x[1]))
        for _, _, pair in items[: max(0, n)]:
            votes[pair] += 1
    need = 2 if mode == "mutual" else 1
    return {p for p, v in votes.items() if v >= need}


def pre_score(pair: Pair, similarity: dict[Pair, float], rule: dict[Pair, float]) -> float:
    s = similarity.get(pair)
    return s if s is not None else rule[pair]
