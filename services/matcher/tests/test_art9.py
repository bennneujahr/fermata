"""Deterministischer Art.-9-Filter und Bereinigung der Eingaben an das Sprachmodell (PLAN 5.7)."""

from __future__ import annotations

import pytest

from fermata_matcher import art9

GOOD = "Sie beide sind gern draußen unterwegs und schätzen ruhige Gespräche. Das gibt Ihnen viel Gesprächsstoff."


def test_good_text_passes():
    assert art9.check_reasons(GOOD, ["Anna", "Jonas"]).ok


@pytest.mark.parametrize(
    ("text", "hit"),
    [
        ("Sie beide sind gläubig und gehen gern in die Kirche.", "art9:religion"),
        ("Ihr beide teilt den muslimischen Glauben.", "art9:religion"),
        ("Sie beide kennen chronische Krankheiten aus eigener Erfahrung.", "art9:gesundheit"),
        ("Beide waren schon in Therapie.", "art9:gesundheit"),
        ("Sie beide sind queer und offen.", "art9:sexualitaet"),
        ("Ihr beide seid bisexuell.", "art9:sexualitaet"),
        ("Sie beide haben einen Migrationshintergrund.", "art9:herkunft"),
        ("Sie beide engagieren sich politisch bei den Grünen.", "art9:politik"),
        ("Beide sind in der Gewerkschaft aktiv.", "art9:gewerkschaft"),
        ("Sie beide haben einen Gentest gemacht.", "art9:genetik_biometrie"),
        ("Er mag Jazz, Sie auch.", "geschlecht"),
        ("Als Frau und Mann passen Sie gut zusammen.", "geschlecht"),
        ("Anna und Sie mögen beide Jazz.", "name"),
        ("Sie wohnen beide nahe 19053.", "plz"),
        ("Sie beide sind ein perfektes Match.", "ton:kein-match-jargon"),
        ("Garantiert die Liebe Ihres Lebens.", "ton:keine-versprechen"),
        ("", "leer"),
    ],
)
def test_reasons_hits(text, hit):
    res = art9.check_reasons(text, ["Anna"])
    assert not res.ok
    assert hit in res.hits


def test_too_long():
    assert "zu_lang" in art9.check_reasons("Sie beide mögen Jazz. " * 40).hits


@pytest.mark.parametrize("mode", ["sie", "du", "gemischt"])
def test_fallback_texts_pass_the_filter(mode):
    assert art9.check_reasons(art9.FALLBACK_REASONS[mode], ["Anna"]).ok


def test_address_mode():
    assert art9.address_mode("sie", "sie") == "sie"
    assert art9.address_mode("du", "du") == "du"
    assert art9.address_mode("sie", "du") == "gemischt"


def test_polish_removes_exclamation_marks():
    assert art9.polish_reasons("Toll!  Wirklich!!") == "Toll. Wirklich."


def test_sanitize_text_removes_names_art9_and_gender():
    text = (
        "Anna, Sie wandern gern. Ihr Glaube gibt Ihnen Halt. Er kocht gern mit seinem Ehemann. "
        "Sie wohnen in 19053 Schwerin. Nach der Therapie geht es Ihnen gut."
    )
    clean, stats = art9.sanitize_text(text, ["Anna"])
    assert "Anna" not in clean and "die Person" in clean
    assert "Glaube" not in clean and "Therapie" not in clean
    assert "19053" not in clean
    assert "Ehemann" not in clean and " Er " not in f" {clean} "
    assert stats.removed_sentences == 2
    assert stats.categories == {"religion", "gesundheit"}
    assert stats.names_replaced == 1


def test_sanitize_structure_drops_sensitive_keys():
    stats = art9.SanitizeStats()
    data = {
        "lebensstil": {"aktiv": 0.7},
        "religion": "christlich",
        "gesundheit_hinweis": "Diabetes",
        "geschlecht": "frau",
        "interessen": ["Wandern", "Gottesdienst", "Jazz"],
        "notiz": "Sie ist queer.",
    }
    out = art9.sanitize_structure(data, ["Anna"], stats)
    assert out["lebensstil"] == {"aktiv": 0.7}
    assert "religion" not in out and "gesundheit_hinweis" not in out and "geschlecht" not in out
    assert out["interessen"] == ["Wandern", "Jazz"]
    assert "notiz" not in out
    assert {"religion", "gesundheit", "geschlecht", "sexualitaet"} <= stats.categories


def test_find_art9_returns_only_categories():
    cats = art9.find_art9("Sie ist evangelisch und hat Migräne.")
    assert cats == ["religion", "gesundheit"]
