"""Sie/Du-Darstellung, Laden der Prompts, Leitfaden je Stufe."""

from __future__ import annotations

import re
from importlib import resources

import pytest

from viola import prompts
from viola.address import fill, has_markup, looks_formal, looks_informal, render
from viola.domain import AddressForm, Kind, Tier

ALL_PROMPT_FILES = sorted(
    p.name for p in resources.files("viola.prompts").iterdir() if p.name.endswith(".md")
)


def test_render_picks_address_form() -> None:
    t = "Wie geht es [[Ihnen|dir]]? [[Möchten Sie|Möchtest du]] anfangen?"
    assert render(t, AddressForm.SIE) == "Wie geht es Ihnen? Möchten Sie anfangen?"
    assert render(t, AddressForm.DU) == "Wie geht es dir? Möchtest du anfangen?"
    assert render(t, "du") == "Wie geht es dir? Möchtest du anfangen?"


def test_fill_and_markup_detection() -> None:
    assert fill("Nummer {notruf}", {"notruf": "112"}) == "Nummer 112"
    with pytest.raises(KeyError):
        fill("{unbekannt}", {})
    assert has_markup("[[a|b]]") and has_markup("{x}") and not has_markup("Hallo.")


@pytest.mark.parametrize("name", ALL_PROMPT_FILES)
def test_every_prompt_loads_without_tone_violations(name: str) -> None:
    text = prompts.load_prompt(name.removesuffix(".md"))
    assert len(text) > 100
    assert "!" not in text, "Ruhiger Ton: keine Ausrufezeichen"
    assert not re.search(r"\b(match\w*|likes?|swipe\w*|garantiert|seelenverwandt)\b", text, re.IGNORECASE)
    assert not re.search(r"[\U0001F300-\U0001FAFF☀-➿]", text), "keine Emojis"


@pytest.mark.parametrize("kind", list(Kind))
@pytest.mark.parametrize("tier", list(Tier))
@pytest.mark.parametrize("form", list(AddressForm))
def test_system_prompt_renders_for_all_combinations(kind: Kind, tier: Tier, form: AddressForm) -> None:
    text = prompts.system_prompt(kind, tier, form, {"telefonseelsorge": ["0800 1110111", "0800 1110222", "116 123"], "notruf": "112"})
    assert not has_markup(text), "keine offenen [[…|…]] oder {…}"
    assert text.startswith(f"Anrede im Gespräch: {'Du' if form is AddressForm.DU else 'Sie'}")
    assert "0800 1110111 oder 0800 1110222 oder 116 123" in text
    assert "112" in text
    assert "künstliche Intelligenz" in text


DU_GRAMMAR_ERRORS = re.compile(
    r"\b(Lassen|Denken|Mögen|Erzählen|Nehmen|Sagen|Rufen|Wählen|Sprechen|Wenden|Versuchen|Wechseln|Finden) (du|dir|dich)\b"
)


@pytest.mark.parametrize("tier", list(Tier))
def test_du_rendering_has_no_mixed_forms(tier: Tier) -> None:
    text = render(prompts.load_prompt(f"stufe_{tier.value}"), AddressForm.DU)
    assert not DU_GRAMMAR_ERRORS.search(text)
    examples = " ".join(re.findall(r"„([^“]*)“", text))
    assert not looks_formal(examples), "Du-Beispiele enthalten keine Sie-Anrede"


@pytest.mark.parametrize("tier", list(Tier))
def test_sie_examples_have_no_du(tier: Tier) -> None:
    text = render(prompts.load_prompt(f"stufe_{tier.value}"), AddressForm.SIE)
    examples = " ".join(re.findall(r"„([^“]*)“", text))
    assert not looks_informal(examples)


REQUIRED_SITUATIONS = {
    "schweigt": "schweigt lange",
    "ausweichen": "weicht aus",
    "flirten": "flirten",
    "mensch": "Mensch ist",
    "krise": "Suizidgedanken",
    "minderjaehrig": "minderjährig",
    "beleidigend": "beleidigend",
    "art9": "geschützten Bereich",
    "loeschen": "Daten löschen",
    "kosten": "Kosten",
    "mitglieder": "anderen Mitgliedern",
    "technik": "Technikprobleme",
    "schreiben": "lieber schreiben",
}


@pytest.mark.parametrize("tier", list(Tier))
def test_each_tier_has_at_least_eight_situations_with_examples(tier: Tier) -> None:
    text = prompts.load_prompt(f"stufe_{tier.value}")
    situations = re.split(r"^### Situation: ", text, flags=re.MULTILINE)[1:]
    assert len(situations) >= 8
    for block in situations:
        assert "Vorgehen:" in block and "Beispiel" in block, block[:60]
    headings = " ".join(s.splitlines()[0] for s in situations)
    for key, needle in REQUIRED_SITUATIONS.items():
        assert needle in headings, f"{tier.value}: Situation {key} fehlt"


def test_crisis_examples_name_the_hotlines() -> None:
    for tier in Tier:
        text = prompts.load_prompt(f"stufe_{tier.value}")
        crisis = text.split("Situation: Die Person erzählt von einer Krise")[1].split("### ")[0]
        assert "{telefonseelsorge}" in crisis and "{notruf}" in crisis
        assert "flag_safety" in crisis and "end_conversation (krise)" in crisis


@pytest.mark.parametrize("key", prompts.sentence_keys())
@pytest.mark.parametrize("form", list(AddressForm))
def test_fixed_sentences_render(key: str, form: AddressForm) -> None:
    text = prompts.sentence(key, form, gruss_name="", aufbewahrung="30 Tage", telefonseelsorge="0800 1110111", notruf="112")
    assert text and not has_markup(text) and "!" not in text
    if form is AddressForm.DU:
        assert not looks_formal(text), text
    else:
        assert not looks_informal(text), text


def test_greeting_starts_with_ai_notice() -> None:
    gruss = prompts.sentence("gruss", AddressForm.SIE, gruss_name=", Anna")
    assert gruss == "Guten Tag, Anna. Ich bin Viola, eine künstliche Intelligenz von Fermata, kein Mensch."
    assert prompts.sentence("gruss", AddressForm.DU, gruss_name="").startswith("Hallo. Ich bin Viola, eine künstliche Intelligenz")


@pytest.mark.parametrize("key", prompts.notice_keys())
def test_notices_render(key: str) -> None:
    values = {k: "x" for k in ("art", "stufe", "minuten", "name", "profil", "zusammenfassung", "bloecke", "datum", "lokal",
                               "block", "alt", "neu", "offen", "gehoert", "fehler", "telefonseelsorge", "notruf")}
    text = prompts.notice(key, AddressForm.SIE, **values)
    assert text and not has_markup(text)
