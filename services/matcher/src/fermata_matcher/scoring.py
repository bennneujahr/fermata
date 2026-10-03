"""Teil-Scores (0..1), Gewichte, Gesamtscore und Wartebonus.

Alle Formeln sind in docs/bereiche/matcher.md erklärt und in tests/test_scoring.py nachgerechnet.
Fehlen einer Person die Angaben für einen Teil-Score, gilt er als neutral (0,5) und wird als „fehlt“ markiert.

Erwartete Felder (Vertrag mit dem Hintergrund-Agenten aus M3, alle Werte 0..1, andere Skalen werden umgerechnet):
- profile_core.personality: {"offenheit", "gewissenhaftigkeit", "extraversion", "vertraeglichkeit",
  "emotionale_stabilitaet", "humor"} – direkt oder unter "merkmale".
- profile_core.values_profile: {"werte": {schlüssel: Wichtigkeit}, "gegenueber": {schlüssel: gewünschter Wert}}
- profile_core.life_circumstances: {"lebensstil": {schlüssel: Wert}, "interessen": [..], "arbeitszeiten": "..."}
"""

from __future__ import annotations

import math
import unicodedata
from dataclasses import dataclass, field
from typing import Any

from .config import SUBSCORE_KEYS, MatchSettings, normalize_weights
from .models import Person

NEUTRAL = 0.5

PERSONALITY_KEYS = (
    "offenheit",
    "gewissenhaftigkeit",
    "extraversion",
    "vertraeglichkeit",
    "emotionale_stabilitaet",
    "humor",
)

SMOKING_FIT: dict[frozenset[str], float] = {
    frozenset({"nein"}): 1.0,
    frozenset({"ja"}): 1.0,
    frozenset({"gelegentlich"}): 1.0,
    frozenset({"nein", "gelegentlich"}): 0.6,
    frozenset({"gelegentlich", "ja"}): 0.7,
    frozenset({"nein", "ja"}): 0.3,
}

CHILDREN_WISH_FIT: dict[frozenset[str], float] = {
    frozenset({"ja"}): 1.0,
    frozenset({"nein"}): 1.0,
    frozenset({"offen"}): 0.9,
    frozenset({"vielleicht"}): 0.8,
    frozenset({"ja", "nein"}): 0.0,
    frozenset({"ja", "offen"}): 0.7,
    frozenset({"ja", "vielleicht"}): 0.6,
    frozenset({"nein", "offen"}): 0.7,
    frozenset({"nein", "vielleicht"}): 0.5,
    frozenset({"offen", "vielleicht"}): 0.8,
}

WORKTIME_FIT_DIFFERENT = 0.8
WORKTIME_FIT: dict[frozenset[str], float] = {
    frozenset({"schicht", "tagsueber"}): 0.6,
    frozenset({"schicht", "wochenende"}): 0.6,
}


def _clip01(x: float) -> float:
    return 0.0 if x < 0 else 1.0 if x > 1 else x


def numeric_map(raw: Any) -> dict[str, float]:
    """Zahlenwerte eines Objekts auf 0..1 bringen. Skala 1..5 → (v−1)/4, Skala bis 100 → v/100."""
    if not isinstance(raw, dict):
        return {}
    vals: dict[str, float] = {}
    for k, v in raw.items():
        if isinstance(v, bool) or not isinstance(v, int | float) or math.isnan(float(v)):
            continue
        vals[str(k)] = float(v)
    if not vals:
        return {}
    top = max(vals.values())
    if top > 5:
        return {k: _clip01(v / 100.0) for k, v in vals.items()}
    if top > 1:
        return {k: _clip01((v - 1.0) / 4.0) for k, v in vals.items()}
    return {k: _clip01(v) for k, v in vals.items()}


def personality_traits(p: Person) -> dict[str, float]:
    raw = p.personality.get("merkmale", p.personality) if isinstance(p.personality, dict) else {}
    return {k: v for k, v in numeric_map(raw).items() if k in PERSONALITY_KEYS}


def values_map(p: Person) -> dict[str, float]:
    vp = p.values_profile if isinstance(p.values_profile, dict) else {}
    return numeric_map(vp.get("werte", {}))


def desired_partner(p: Person) -> dict[str, float]:
    vp = p.values_profile if isinstance(p.values_profile, dict) else {}
    return numeric_map(vp.get("gegenueber", {}))


def lifestyle_map(p: Person) -> dict[str, float]:
    life = p.life if isinstance(p.life, dict) else {}
    return numeric_map(life.get("lebensstil", {}))


def _norm_tag(tag: str) -> str:
    t = unicodedata.normalize("NFKD", tag.strip().lower())
    t = t.replace("ß", "ss")
    return "".join(c for c in t if not unicodedata.combining(c))


def interests(p: Person) -> set[str]:
    life = p.life if isinstance(p.life, dict) else {}
    raw = life.get("interessen", [])
    if not isinstance(raw, list):
        return set()
    return {_norm_tag(x) for x in raw if isinstance(x, str) and x.strip()}


def mean_abs_similarity(a: dict[str, float], b: dict[str, float]) -> float | None:
    """1 − mittlere absolute Differenz über gemeinsame Schlüssel."""
    shared = a.keys() & b.keys()
    if not shared:
        return None
    return 1.0 - sum(abs(a[k] - b[k]) for k in shared) / len(shared)


def weighted_value_agreement(a: dict[str, float], b: dict[str, float], eps: float = 0.05) -> float | None:
    """Werte: 1 − Σ w_k·|a_k − b_k| / Σ w_k mit w_k = max(a_k, b_k) + ε.

    Ein Unterschied zählt umso mehr, je wichtiger der Wert mindestens einer der beiden Personen ist.
    """
    shared = a.keys() & b.keys()
    if not shared:
        return None
    num = 0.0
    den = 0.0
    for k in shared:
        w = max(a[k], b[k]) + eps
        num += w * abs(a[k] - b[k])
        den += w
    return 1.0 - num / den


def _mean(values: list[float | None]) -> float | None:
    vs = [v for v in values if v is not None]
    return sum(vs) / len(vs) if vs else None


def score_werte(a: Person, b: Person) -> float | None:
    return weighted_value_agreement(values_map(a), values_map(b))


def score_persoenlichkeit(a: Person, b: Person) -> float | None:
    return mean_abs_similarity(personality_traits(a), personality_traits(b))


def actual_profile(p: Person) -> dict[str, float]:
    """Alles, was ein Gegenüber sich wünschen kann: Persönlichkeit, Werte, Lebensstil (Persönlichkeit hat Vorrang)."""
    out = dict(lifestyle_map(p))
    out.update(values_map(p))
    out.update(personality_traits(p))
    return out


def wish_fit(wisher: Person, other: Person) -> float | None:
    """Wie nah ist das Gegenüber an dem, was sich die Person wünscht? 1 − mittlere Abweichung."""
    return mean_abs_similarity(desired_partner(wisher), actual_profile(other))


def children_wish_fit(a: Person, b: Person) -> float | None:
    if not a.wants_children or not b.wants_children:
        return None
    return CHILDREN_WISH_FIT.get(frozenset({a.wants_children, b.wants_children}))


def score_wuensche(a: Person, b: Person) -> float | None:
    """Wünsche: Mittel aus (Wunsch von A an B, Wunsch von B an A) und der Verträglichkeit der Kinderwünsche.

    Freitext-Wünsche (app.wants) und Deal-Breaker „sonstiges“ bewertet nur das Sprachmodell.
    """
    directional = _mean([wish_fit(a, b), wish_fit(b, a)])
    return _mean([directional, children_wish_fit(a, b)])


def smoking_fit(a: Person, b: Person) -> float | None:
    if not a.smoking or not b.smoking:
        return None
    return SMOKING_FIT.get(frozenset({a.smoking, b.smoking}))


def worktime_fit(a: Person, b: Person) -> float | None:
    wa = (a.life or {}).get("arbeitszeiten") if isinstance(a.life, dict) else None
    wb = (b.life or {}).get("arbeitszeiten") if isinstance(b.life, dict) else None
    if not isinstance(wa, str) or not isinstance(wb, str):
        return None
    if wa == wb:
        return 1.0
    if "flexibel" in (wa, wb):
        return 0.9
    return WORKTIME_FIT.get(frozenset({wa, wb}), WORKTIME_FIT_DIFFERENT)


def interests_overlap(a: Person, b: Person) -> float | None:
    """Überlappungskoeffizient |A ∩ B| / min(|A|, |B|)."""
    ia, ib = interests(a), interests(b)
    if not ia or not ib:
        return None
    return len(ia & ib) / min(len(ia), len(ib))


def age_fit(a: Person, b: Person) -> float | None:
    """1 bis 3 Jahre Unterschied, dann linear fallend bis 0,3 bei 15 Jahren (die Wünsche prüft schon der Filter)."""
    if a.age is None or b.age is None:
        return None
    gap = abs(a.age - b.age)
    if gap <= 3:
        return 1.0
    if gap >= 15:
        return 0.3
    return 1.0 - 0.7 * (gap - 3) / 12.0


def distance_fit(distance_km: float, limit_km: float) -> float:
    """Näher ist besser: 1 bei 0 km, 0,3 an der Grenze der Fahrbereitschaft."""
    if limit_km <= 0:
        return 0.3
    return 1.0 - 0.7 * min(1.0, distance_km / limit_km)


def score_lebensumstaende(a: Person, b: Person, distance_km: float, limit_km: float) -> float | None:
    """Lebensumstände: Mittel aus Lebensstil, Interessen, Rauchen, Arbeitszeiten, Alter und Entfernung."""
    has_children = None
    if a.has_children is not None and b.has_children is not None:
        has_children = 1.0 if a.has_children == b.has_children else 0.7
    return _mean(
        [
            mean_abs_similarity(lifestyle_map(a), lifestyle_map(b)),
            interests_overlap(a, b),
            smoking_fit(a, b),
            has_children,
            worktime_fit(a, b),
            age_fit(a, b),
            distance_fit(distance_km, limit_km),
        ]
    )


def score_zeiten(shared_days: int) -> float:
    """Zeiten: gemeinsame mögliche Abende (verschiedene Tage) / 3, höchstens 1."""
    return min(1.0, shared_days / 3.0)


@dataclass
class RuleScore:
    subscores: dict[str, float | None]
    weights: dict[str, float]
    score: float
    missing: list[str] = field(default_factory=list)

    def as_json(self) -> dict[str, Any]:
        return {
            "werte": _round(self.subscores.get("werte")),
            "wuensche": _round(self.subscores.get("wuensche")),
            "lebensumstaende": _round(self.subscores.get("lebensumstaende")),
            "persoenlichkeit": _round(self.subscores.get("persoenlichkeit")),
            "zeiten": _round(self.subscores.get("zeiten")),
            "gewichte": {k: round(v, 4) for k, v in self.weights.items()},
            "fehlt": self.missing,
            "regel": round(self.score, 4),
        }


def _round(v: float | None) -> float | None:
    return None if v is None else round(v, 4)


def effective_weights(person: Person, settings: MatchSettings) -> dict[str, float]:
    """Gewichte einer Person: (1 − Anteil) × global + Anteil × persönlich, danach auf Summe 1."""
    glob = settings.weights
    if not person.personal_weights:
        return dict(glob)
    pers = normalize_weights(person.personal_weights, glob)
    share = _clip01(settings.personal_weight_share)
    mixed = {k: (1 - share) * glob[k] + share * pers[k] for k in SUBSCORE_KEYS}
    return normalize_weights(mixed, glob)


def pair_weights(a: Person, b: Person, settings: MatchSettings) -> dict[str, float]:
    wa, wb = effective_weights(a, settings), effective_weights(b, settings)
    return {k: (wa[k] + wb[k]) / 2 for k in SUBSCORE_KEYS}


def rule_score(
    a: Person, b: Person, settings: MatchSettings, *, distance_km: float, limit_km: float, shared_days: int
) -> RuleScore:
    subs: dict[str, float | None] = {
        "werte": score_werte(a, b),
        "wuensche": score_wuensche(a, b),
        "lebensumstaende": score_lebensumstaende(a, b, distance_km, limit_km),
        "persoenlichkeit": score_persoenlichkeit(a, b),
        "zeiten": score_zeiten(shared_days),
    }
    weights = pair_weights(a, b, settings)
    missing = [k for k in SUBSCORE_KEYS if subs[k] is None]
    total = sum(weights[k] * (NEUTRAL if subs[k] is None else float(subs[k])) for k in SUBSCORE_KEYS)
    return RuleScore(subs, weights, _clip01(total), missing)


def wait_bonus(rounds_a: int, rounds_b: int, settings: MatchSettings) -> float:
    """Wartebonus: Mittel der Läufe ohne Vorschlag beider Personen × Bonus je Lauf, höchstens wait_bonus_max."""
    rounds = (max(0, rounds_a) + max(0, rounds_b)) / 2.0
    return min(settings.wait_bonus_max, rounds * settings.wait_bonus_per_round)


def combine(rule: float, llm: float | None, settings: MatchSettings) -> float:
    """Qualität eines Paares ohne Bonus: (1 − llm_weight) × Regel + llm_weight × LLM (ohne LLM: nur Regel)."""
    if llm is None:
        return rule
    w = _clip01(settings.llm_weight)
    return (1 - w) * rule + w * llm
