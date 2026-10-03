"""Sie oder Du: feste Texte enthalten beide Formen als ``[[Sie-Form|Du-Form]]``.

Beispiel: ``"Wie geht es [[Ihnen|dir]]?"`` ergibt „Wie geht es Ihnen?“ oder „Wie geht es dir?“.
Platzhalter wie ``{name}`` werden danach mit :func:`fill` ersetzt.
"""

from __future__ import annotations

import re

from viola.domain import AddressForm

_ALT = re.compile(r"\[\[([^\[\]|]*)\|([^\[\]|]*)\]\]")
_PLACEHOLDER = re.compile(r"\{([a-z_]+)\}")


def render(template: str, form: AddressForm | str) -> str:
    """Wählt in allen ``[[…|…]]``-Stellen die passende Anrede."""
    use_du = AddressForm(form) is AddressForm.DU
    return _ALT.sub(lambda m: m.group(2) if use_du else m.group(1), template)


def fill(text: str, values: dict[str, str]) -> str:
    """Ersetzt ``{name}``-Platzhalter. Unbekannte Platzhalter führen zu einem Fehler."""

    def repl(m: re.Match[str]) -> str:
        key = m.group(1)
        if key not in values:
            raise KeyError(f"Platzhalter ohne Wert: {key}")
        return values[key]

    return _PLACEHOLDER.sub(repl, text)


def has_markup(text: str) -> bool:
    """True, wenn noch ``[[…|…]]`` oder ``{…}`` übrig ist (Prüfung in Tests)."""
    return bool(_ALT.search(text) or "[[" in text or _PLACEHOLDER.search(text))


_FORMAL = re.compile(r"\b(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)\b")
_INFORMAL = re.compile(r"\b(du|dich|dir|dein|deine|deinen|deinem|deiner|deines)\b", re.IGNORECASE)


def looks_formal(text: str) -> bool:
    """Grobe Prüfung für Tests: enthält der Text die Sie-Anrede (großgeschrieben, nicht am Satzanfang)?"""
    for m in _FORMAL.finditer(text):
        start = m.start()
        before = text[:start].rstrip()
        if before and before[-1] not in ".?:„\"":
            return True
    return False


def looks_informal(text: str) -> bool:
    return bool(_INFORMAL.search(text))
