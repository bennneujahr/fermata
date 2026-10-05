"""Art.-9-Filter: Regeln, Entfernen von Sätzen, gleiche Muster in Python und SQL."""

from __future__ import annotations

import json
import re
from importlib import resources
from pathlib import Path

import pytest

from viola import art9

MIGRATION = Path(__file__).resolve().parents[3] / "supabase" / "migrations" / "20261003000310_viola.sql"


@pytest.mark.parametrize(
    ("text", "category"),
    [
        ("Ich habe seit Jahren Diabetes.", "gesundheit"),
        ("Nach meinem Burnout war ich lange in Therapie.", "gesundheit"),
        ("Ich nehme Antidepressiva.", "gesundheit"),
        ("Meine Mutter hatte Brustkrebs.", "gesundheit"),
        ("Ich sitze im Rollstuhl.", "gesundheit"),
        ("Ich bin trockener Alkoholiker.", "gesundheit"),
        ("Ich hatte eine Fehlgeburt.", "gesundheit"),
        ("Ich bin sehr gläubig.", "religion"),
        ("Freitags gehe ich in die Moschee.", "religion"),
        ("Ich bin katholisch erzogen.", "religion"),
        ("Ich singe im Kirchenchor.", "religion"),
        ("Ich bin Atheist.", "religion"),
        ("Ihr Glaube gibt Ihnen Halt.", "religion"),
        ("Der Glaube ist mir wichtig.", "religion"),
        ("Ich fasten im Ramadan.", "religion"),
        ("Politisch stehe ich eher links.", "politik"),
        ("Ich bin Mitglied der SPD.", "politik"),
        ("Ich wähle die Grünen.", "politik"),
        ("Ich bin bei Verdi in der Gewerkschaft.", "gewerkschaft"),
        ("Ich habe einen Migrationshintergrund.", "herkunft"),
        ("Ich bin bisexuell.", "sexualitaet"),
        ("Ich bin schwul.", "sexualitaet"),
        ("Ich lebe polyamor.", "sexualitaet"),
        ("Ich suche eine Frau mit Humor.", "geschlecht"),
        ("Ich wünsche mir einen Mann, der kocht.", "geschlecht"),
        ("Ich bin nichtbinär.", "geschlecht"),
        ("Ich bin eine Frau aus Schwerin.", "geschlecht"),
        ("Ich habe einen Gentest gemacht.", "genetik"),
        ("Ich bin vorbestraft.", "strafrecht"),
        ("Ich war im Gefängnis.", "strafrecht"),
    ],
)
def test_detects_protected_categories(text: str, category: str) -> None:
    assert category in art9.categories(text)


@pytest.mark.parametrize(
    "text",
    [
        "Ich wandere gern an der Ostsee.",
        "Ich glaube, dass Ehrlichkeit wichtig ist.",
        "Ich habe sie gebeten, mitzukommen.",
        "Mein Traumauto ist ein alter Bus.",
        "Ich arbeite als Krankenschwester.",
        "Ich habe zwei Kinder und wohne in Wismar.",
        "Ich rauche nicht.",
        "Ich mag keine Blind Dates.",
        "Ich wünsche mir ein Gegenüber mit Humor.",
        "Das Gegenüber sollte gern draußen sein.",
        "Mit der linken Hand schreibe ich schlecht.",
        "Ich besuche gern Freunde.",
        "Ich habe versucht, Gitarre zu lernen.",
        "Ich höre gern Verdi und Mozart.",
    ],
)
def test_no_false_positives_on_everyday_text(text: str) -> None:
    assert art9.categories(text) == set()


def test_drop_sentences_removes_only_affected_sentences() -> None:
    r = art9.drop_sentences("Sie sind ruhig. Sie gehen gern in die Kirche. Sie wandern gern.")
    assert r.text == "Sie sind ruhig. Sie wandern gern."
    assert r.removed_sentences == 1 and r.categories == {"religion"}


def test_drop_sentences_with_model_flags() -> None:
    r = art9.drop_sentences("Eins. Zwei. Drei.", extra_flagged=[1])
    assert r.text == "Eins. Drei." and "modell" in r.categories


def test_redact_sentences_marks_removed_parts_for_transcripts() -> None:
    r = art9.redact_sentences("Hallo. Ich bin depressiv. Ich habe Asthma. Ich mag Hunde.")
    assert r.text == f"Hallo. {art9.REDACTED} Ich mag Hunde."
    assert r.removed_sentences == 2


def test_clean_strings_walks_nested_structures() -> None:
    data = {
        "personality": {"traits": ["ruhig", "queer"], "notes": "Mag Musik. Ist sehr gläubig."},
        "wants": [
            {"category": "werte", "text": "Sollte katholisch sein", "importance": 3},
            {"category": "werte", "text": "Humor", "importance": 2},
        ],
        "age_min": 30,
    }
    cleaned, cats = art9.clean_strings(data)
    assert cleaned["personality"]["traits"] == ["ruhig"]
    assert cleaned["personality"]["notes"] == "Mag Musik."
    assert cleaned["wants"][0] == {"category": "werte", "importance": 3}
    assert cleaned["age_min"] == 30
    assert cats == {"sexualitaet", "religion"}


def test_pattern_file_is_consistent() -> None:
    raw = json.loads(resources.files("viola").joinpath("art9_patterns.json").read_text(encoding="utf-8"))
    categories = set(raw["categories"])
    for p in raw["patterns"]:
        assert p["c"] in categories
        assert set(p) == {"c", "p", "prefix", "anywhere"}
        assert p["p"] == p["p"].lower()
        assert not re.search(r"\\[bwW]", p["p"]), "\\b und \\w verhalten sich in Postgres anders"
        re.compile(art9.build_regex(p["p"], prefix=p["prefix"], anywhere=p["anywhere"]))


def test_art9_sql_in_sync() -> None:
    """Die Migration enthält genau die Muster aus art9_patterns.json (scripts/sync_art9.py)."""
    sql = MIGRATION.read_text(encoding="utf-8")
    block = re.search(r"\$art9\$(.*?)\$art9\$", sql, re.DOTALL)
    assert block, "Block $art9$ fehlt in der Migration"
    in_sql = json.loads(block.group(1))
    raw = json.loads(resources.files("viola").joinpath("art9_patterns.json").read_text(encoding="utf-8"))
    assert in_sql == raw["patterns"]
    # Gleiche Bildungsregel wie die generierte Spalte in SQL
    assert "(?<![a-zäöüß0-9])" in sql and "(?![a-zäöüß0-9])" in sql
    assert art9.build_regex("x", prefix=False, anywhere=False) == "(?<![a-zäöüß0-9])(?:x)(?![a-zäöüß0-9])"
