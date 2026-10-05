"""Schutz vor Art.-9-Inhalten (PLAN 5.7) – deterministisch, ohne LLM.

Zwei Aufgaben:
1. `check_reasons`: prüft den Text „warum Sie beide“, bevor er gespeichert wird. Treffer → neutraler Ersatztext.
2. `sanitize_text` / `sanitize_structure`: bereinigt alles, was an das Sprachmodell oder das Embedding-Modell geht:
   Namen raus, Sätze mit Art.-9-Begriffen raus, Geschlechtshinweise neutralisiert.

Grundsatz „immer auf Nummer sicher“: Die Muster sind bewusst weit gefasst. Ein Fehlalarm kostet nur einen
schöneren Text; ein übersehener Treffer würde sensible Daten preisgeben.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

_F = re.IGNORECASE | re.UNICODE

ART9_PATTERNS: dict[str, re.Pattern[str]] = {
    "religion": re.compile(
        r"\b(relig\w*|glaub\w*|gläubig\w*|kirch\w*|christ\w*|katholi\w*|evangeli\w*|protestant\w*|muslim\w*|moslem\w*"
        r"|islam\w*|moschee\w*|jude|juden|jüdin|jüd\w*|judentum|synagog\w*|buddhis\w*|hindu\w*|atheis\w*|agnosti\w*"
        r"|konfession\w*|gott|gottes|göttlich\w*|gottesdienst\w*|gebet\w*|beten|betet|spiritu\w*|bibel\w*|koran\w*"
        r"|tora|ramadan|freikirch\w*|zeugen jehovas|kopftuch\w*)",
        _F,
    ),
    "gesundheit": re.compile(
        r"\b(gesundheit\w*|krank\w*|erkrank\w*|diagnos\w*|therapie\w*|therapeut\w*|psych\w*|depress\w*|burn-?out"
        r"|angststörung\w*|panikattack\w*|adhs|autis\w*|asperger|diabet\w*|krebs\w*|tumor\w*|chemo\w*|behinder\w*"
        r"|rollstuhl\w*|medikament\w*|tablette\w*|sucht\w*|süchtig\w*|alkoholi\w*|entzug\w*|schwanger\w*|hiv|aids"
        r"|chronisch\w*|epilep\w*|migräne\w*|allergi\w*|klinik\w*|operation\w*|gehörlos\w*|schwerhörig\w*"
        r"|essstörung\w*|magersucht|bulimi\w*|trauma\w*|ptbs|bipolar\w*|schizo\w*|unfruchtbar\w*|kinderwunschbehandl\w*)",
        _F,
    ),
    "sexualitaet": re.compile(
        r"\b(schwul\w*|lesb\w*|bisexu\w*|homosexu\w*|heterosexu\w*|pansexu\w*|asexu\w*|queer\w*|trans|transgender\w*"
        r"|transsexu\w*|transfrau\w*|transmann\w*|transperson\w*|nicht-?binär\w*|nichtbinär\w*|non-?binary|enby"
        r"|intersex\w*|divers|lgbt\w*|orientierung|coming-?out|sexualität\w*|sexuell\w*|sex|erotik\w*|erotisch\w*"
        r"|intim\w*|libido|fetisch\w*|polyamor\w*|offene beziehung)",
        _F,
    ),
    "herkunft": re.compile(
        r"\b(herkunft|ethni\w*|migrationshintergrund|abstammung|hautfarbe|rasse|nationalität\w*|staatsangehörig\w*"
        r"|ausländer\w*|einwander\w*|geflüchtet\w*|flüchtling\w*|roma|sinti)",
        _F,
    ),
    "politik": re.compile(
        r"\b(politi\w*|partei\w*|cdu|csu|spd|afd|fdp|bsw|linkspartei|grünen|wählt|wähler\w*|wahlkampf"
        r"|demonstration\w*|linksradikal\w*|rechtsradikal\w*|linksextrem\w*|rechtsextrem\w*|konservativ\w*"
        r"|sozialist\w*|kommunist\w*|anarchist\w*|nationalist\w*|feminist\w*|aktivist\w*)",
        _F,
    ),
    "gewerkschaft": re.compile(r"\b(gewerkschaft\w*|verdi|ig metall|betriebsrat\w*)", _F),
    "genetik_biometrie": re.compile(r"\b(genetisch\w*|erbkrank\w*|dna|gentest\w*|biometr\w*|fingerabdr\w*)", _F),
}

# Hinweise auf das Geschlecht: im Text „warum Sie beide“ verboten (sie verraten mit dem Gegenüber die Orientierung).
GENDER_PATTERN = re.compile(
    r"\b(frau|frauen|mann|männer|männlich\w*|weiblich\w*|dame|damen|herr|herren|freundin|partnerin|ehefrau|ehemann"
    r"|mutter|vater|witwe|witwer|er|ihn|ihm|geschlecht\w*|gender\w*)\b",
    _F,
)

# Neutralisierung für Eingaben an das Sprachmodell (Reihenfolge: lange Wörter zuerst).
_GENDER_REPLACEMENTS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(ehefrau|ehemann)\b", _F), "Ehepartner"),
    (re.compile(r"\b(ex-?frau|ex-?mann|ex-?freundin|ex-?freund)\b", _F), "frühere Beziehung"),
    (re.compile(r"\b(freundin|partnerin)\b", _F), "Partnerschaft"),
    (re.compile(r"\b(mutter|vater)\b", _F), "Elternteil"),
    (re.compile(r"\b(witwe|witwer)\b", _F), "verwitwet"),
    (re.compile(r"\b(frauen|männer)\b", _F), "Menschen"),
    (re.compile(r"\b(frau|mann|dame|herr)\b", _F), "Mensch"),
    (re.compile(r"\b(männlich\w*|weiblich\w*)\b", _F), ""),
    (re.compile(r"\ber\b", re.UNICODE), "die Person"),
    (re.compile(r"\bEr\b", re.UNICODE), "Die Person"),
    (re.compile(r"\bihn\b", re.UNICODE), "die Person"),
    (re.compile(r"\bihm\b", re.UNICODE), "der Person"),
]

PLZ_PATTERN = re.compile(r"\b\d{5}\b")

# Tonalität (scripts/tone-rules.json): im Text „warum Sie beide“ ebenfalls nicht erlaubt.
TONE_PATTERNS: dict[str, re.Pattern[str]] = {
    "kein-match-jargon": re.compile(r"\b(match(es)?|gematcht|matchen|likes?|geliked|super-?like)\b", _F),
    "keine-versprechen": re.compile(
        r"(garantiert|100\s?%|seelenverwandt|perfekte[nrs]? (partner|partnerin|gegenüber)|liebe (deines|ihres|eures) lebens)",
        _F,
    ),
    "kein-druck": re.compile(r"(nur noch heute|letzte chance|jetzt zuschlagen|beeil|nicht verpassen)", _F),
    "keine-emojis": re.compile("[\U0001f300-\U0001faff☀-➿]"),
}

MAX_REASONS_CHARS = 600

FALLBACK_REASONS: dict[str, str] = {
    "sie": (
        "Sie beide haben in Ihren Gesprächen mit Viola ähnliche Vorstellungen davon beschrieben, was Ihnen im Alltag "
        "und im Umgang miteinander wichtig ist. Wir sind gespannt, was Sie an diesem Abend gemeinsam entdecken."
    ),
    "du": (
        "Ihr beide habt in euren Gesprächen mit Viola ähnliche Vorstellungen davon beschrieben, was euch im Alltag "
        "und im Umgang miteinander wichtig ist. Wir sind gespannt, was ihr an diesem Abend gemeinsam entdeckt."
    ),
    "gemischt": (
        "Beide haben in den Gesprächen mit Viola ähnliche Vorstellungen davon beschrieben, was im Alltag und im "
        "Umgang miteinander wichtig ist. Wir sind gespannt, was an diesem Abend gemeinsam entdeckt wird."
    ),
}


def address_mode(form_a: str, form_b: str) -> str:
    """„sie“, wenn beide gesiezt werden; „du“, wenn beide geduzt werden; sonst „gemischt“ (ohne direkte Anrede)."""
    if form_a == form_b and form_a in ("sie", "du"):
        return form_a
    return "gemischt"


def find_art9(text: str | None) -> list[str]:
    """Kategorien mit Treffern (ohne die gefundenen Wörter, damit Berichte selbst nichts preisgeben)."""
    if not text:
        return []
    return [cat for cat, pat in ART9_PATTERNS.items() if pat.search(text)]


@dataclass
class ReasonsCheck:
    ok: bool
    hits: list[str] = field(default_factory=list)


def check_reasons(text: str | None, names: list[str | None] | None = None) -> ReasonsCheck:
    """Prüft „warum Sie beide“ vor dem Speichern. Liefert die Gründe für einen Ersatz (Kategorien, keine Inhalte)."""
    hits: list[str] = []
    if not text or not text.strip():
        return ReasonsCheck(False, ["leer"])
    hits += [f"art9:{c}" for c in find_art9(text)]
    if GENDER_PATTERN.search(text):
        hits.append("geschlecht")
    for name in names or []:
        if name and len(name.strip()) >= 2 and re.search(rf"\b{re.escape(name.strip())}\b", text, _F):
            hits.append("name")
            break
    if PLZ_PATTERN.search(text):
        hits.append("plz")
    hits += [f"ton:{rule}" for rule, pat in TONE_PATTERNS.items() if pat.search(text)]
    if len(text) > MAX_REASONS_CHARS:
        hits.append("zu_lang")
    return ReasonsCheck(not hits, hits)


def polish_reasons(text: str) -> str:
    """Kleine Korrekturen ohne Ersatz: Ausrufezeichen → Punkt, doppelte Leerzeichen raus."""
    text = text.replace("!", ".")
    text = re.sub(r"\.{2,}", ".", text)
    return re.sub(r"\s+", " ", text).strip()


_SENTENCE_SPLIT = re.compile(r"(?<=[.!?;])\s+|\n+")


@dataclass
class SanitizeStats:
    removed_sentences: int = 0
    categories: set[str] = field(default_factory=set)
    names_replaced: int = 0
    gender_neutralized: int = 0

    def merge(self, other: SanitizeStats) -> None:
        self.removed_sentences += other.removed_sentences
        self.categories |= other.categories
        self.names_replaced += other.names_replaced
        self.gender_neutralized += other.gender_neutralized


def neutralize_gender(text: str) -> tuple[str, int]:
    n = 0
    for pat, repl in _GENDER_REPLACEMENTS:
        text, k = pat.subn(repl, text)
        n += k
    return re.sub(r"\s{2,}", " ", text).strip(), n


def sanitize_text(text: str | None, names: list[str | None] | None = None) -> tuple[str, SanitizeStats]:
    """Text für das Sprachmodell bereinigen: Namen ersetzen, Art.-9-Sätze entfernen, Geschlechtshinweise neutralisieren."""
    stats = SanitizeStats()
    if not text:
        return "", stats
    for name in names or []:
        if name and len(name.strip()) >= 2:
            text, k = re.subn(rf"\b{re.escape(name.strip())}\b", "die Person", text, flags=_F)
            stats.names_replaced += k
    kept: list[str] = []
    for sentence in _SENTENCE_SPLIT.split(text):
        if not sentence.strip():
            continue
        cats = find_art9(sentence)
        if cats:
            stats.removed_sentences += 1
            stats.categories.update(cats)
            continue
        kept.append(sentence.strip())
    clean = " ".join(kept)
    clean = PLZ_PATTERN.sub("", clean)
    clean, n = neutralize_gender(clean)
    stats.gender_neutralized += n
    return clean, stats


def sanitize_structure(value: Any, names: list[str | None] | None = None, stats: SanitizeStats | None = None) -> Any:
    """Strukturierte Felder (jsonb) bereinigen: Schlüssel mit Art.-9- oder Geschlechtsbezug entfernen, Texte bereinigen."""
    stats = stats if stats is not None else SanitizeStats()
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for key, val in value.items():
            k = str(key)
            k_words = k.replace("_", " ")
            cats = find_art9(k_words)
            if cats or GENDER_PATTERN.search(k_words):
                stats.removed_sentences += 1
                stats.categories.update(cats or ["geschlecht"])
                continue
            cleaned = sanitize_structure(val, names, stats)
            if cleaned in ("", None, [], {}):
                if val in ("", None, [], {}):
                    out[k] = cleaned
                continue
            out[k] = cleaned
        return out
    if isinstance(value, list):
        items = [sanitize_structure(v, names, stats) for v in value]
        return [v for v in items if v not in ("", None)]
    if isinstance(value, str):
        clean, s = sanitize_text(value, names)
        stats.merge(s)
        return clean
    return value
