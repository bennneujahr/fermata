"""Leitfaden und feste Sätze von Viola (deutsch, Dateien ``*.md`` in diesem Ordner).

- ``system.md``: Rolle, Haltung, feste Regeln, Werkzeuge, Sicherheit (für alle Gespräche gleich)
- ``art_<gesprächsart>.md``: Ablauf je Gesprächsart (Erstgespräch, Vertiefung, Nachbesprechung, Korrektur)
- ``stufe_<stufe>.md``: Tiefe und Länge je Stufe mit mindestens acht Situationen und Beispielen
- ``saetze.md``: feste Sätze (Begrüßung mit KI-Hinweis, Zeitlimit, Krise, Abschied …)
- ``hinweise.md``: Hinweise der Gesprächssteuerung an das Modell (nicht an die Person)
- ``analyse.md``, ``sicherheit.md``, ``art9_pruefung.md``: Hintergrund-Agenten

Anrede: ``[[Sie-Form|Du-Form]]`` (siehe viola.address). Platzhalter: ``{name}``.
Die Tonalitätsprüfung des Repos (``pnpm check:tone``) liest diesen Ordner.
"""

from __future__ import annotations

import re
from functools import cache
from importlib import resources

from viola.address import fill, render
from viola.domain import AddressForm, Kind, Tier

_HEADER = re.compile(r"^## ([a-z0-9_]+)\s*$")


@cache
def load_prompt(name: str) -> str:
    """Lädt ``<name>.md`` ohne Kommentarzeilen (``<!-- … -->``)."""
    text = resources.files("viola.prompts").joinpath(f"{name}.md").read_text(encoding="utf-8")
    return re.sub(r"<!--.*?-->\n?", "", text, flags=re.DOTALL).strip()


@cache
def _sections(name: str) -> dict[str, str]:
    """Liest eine Datei mit Abschnitten ``## schluessel`` (z. B. saetze.md, hinweise.md)."""
    out: dict[str, str] = {}
    key: str | None = None
    lines: list[str] = []
    for line in load_prompt(name).splitlines():
        m = _HEADER.match(line)
        if m:
            if key is not None:
                out[key] = " ".join(x.strip() for x in lines if x.strip())
            key, lines = m.group(1), []
        elif key is not None and not line.startswith("#"):
            lines.append(line)
    if key is not None:
        out[key] = " ".join(x.strip() for x in lines if x.strip())
    return out


def sentence(key: str, form: AddressForm, **values: str) -> str:
    """Fester Satz aus saetze.md in der richtigen Anrede."""
    return fill(render(_sections("saetze")[key], form), values)


def notice(key: str, form: AddressForm, **values: str) -> str:
    """Hinweis der Gesprächssteuerung an das Modell (hinweise.md)."""
    return fill(render(_sections("hinweise")[key], form), values)


def sentence_keys() -> list[str]:
    return sorted(_sections("saetze"))


def notice_keys() -> list[str]:
    return sorted(_sections("hinweise"))


def system_prompt(kind: Kind, tier: Tier, form: AddressForm, crisis_lines: dict[str, object]) -> str:
    """Systemtext für ein Gespräch. Gleich für alle Gespräche derselben Art, Stufe und Anrede (Caching)."""
    seelsorge = crisis_lines.get("telefonseelsorge") or []
    numbers = seelsorge if isinstance(seelsorge, list) else [str(seelsorge)]
    values = {
        "telefonseelsorge": " oder ".join(str(n) for n in numbers),
        "notruf": str(crisis_lines.get("notruf", "112")),
    }
    anrede = "Du" if form is AddressForm.DU else "Sie"
    parts = [
        f"Anrede im Gespräch: {anrede}",
        load_prompt("system"),
        load_prompt(f"art_{kind.value}"),
        load_prompt(f"stufe_{tier.value}"),
    ]
    return fill(render("\n\n".join(parts), form), values)
