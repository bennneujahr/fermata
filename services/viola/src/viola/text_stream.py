"""Text im Fluss: Sätze erkennen, sobald sie fertig sind, und kurze Antworten erzwingen (PLAN 5.8).

``SentenceSplitter`` macht aus Textstücken des Modells ganze Sätze (für die Stimme: der erste Satz kann gesprochen
werden, bevor der Rest fertig ist). ``BrevityGuard`` lässt höchstens ``max_sentences`` Sätze durch: die ersten
sofort, danach bevorzugt die erste Frage – „höchstens zwei Sätze, dann eine Frage“.
"""

from __future__ import annotations

import re

_ABBREVIATIONS = {
    "z",
    "b",
    "d",
    "h",
    "u",
    "a",
    "ca",
    "bzw",
    "usw",
    "etc",
    "evtl",
    "ggf",
    "inkl",
    "nr",
    "dr",
    "fr",
    "hr",
    "str",
    "tel",
    "vgl",
    "bspw",
    "min",
    "max",
    "std",
    "mio",
    "mrd",
    "uhr",
    "ggü",
    "o",
    "ä",
    "s",
}
_TERMINATORS = ".?!…"


def _is_abbreviation(before: str) -> bool:
    m = re.search(r"([\wäöüß]+)\s*$", before, re.IGNORECASE)
    if not m:
        return False
    token = m.group(1).lower()
    return token.isdigit() or token in _ABBREVIATIONS or len(token) == 1


class SentenceSplitter:
    def __init__(self) -> None:
        self._buf = ""

    def push(self, delta: str) -> list[str]:
        self._buf += delta
        out: list[str] = []
        start = 0
        i = 0
        while i < len(self._buf):
            ch = self._buf[i]
            if ch in _TERMINATORS:
                j = i + 1
                while j < len(self._buf) and self._buf[j] in _TERMINATORS + "\"“”»«')":
                    j += 1
                if j < len(self._buf) and self._buf[j].isspace():
                    if ch == "." and _is_abbreviation(self._buf[start:i]):
                        i = j
                        continue
                    sentence = self._buf[start:j].strip()
                    if sentence:
                        out.append(sentence)
                    start = j
                    i = j
                    continue
            i += 1
        self._buf = self._buf[start:]
        return out

    def flush(self) -> list[str]:
        rest = self._buf.strip()
        self._buf = ""
        return [rest] if rest else []


def is_question(sentence: str) -> bool:
    return sentence.rstrip("\"“”»«') ").endswith("?")


class BrevityGuard:
    def __init__(self, max_sentences: int = 3) -> None:
        self.max = max(2, max_sentences)
        self.emitted: list[str] = []
        self.held: list[str] = []
        self.cut = 0

    def push(self, sentence: str) -> list[str]:
        if len(self.emitted) < self.max - 1:
            self.emitted.append(sentence)
            return [sentence]
        self.held.append(sentence)
        return []

    def finish(self) -> list[str]:
        if not self.held:
            return []
        has_question = any(is_question(s) for s in self.emitted)
        pick = None
        if not has_question:
            pick = next((s for s in self.held if is_question(s)), None)
        if pick is None:
            pick = self.held[0]
        self.cut = len(self.held) - 1
        self.emitted.append(pick)
        self.held = []
        return [pick]

    @property
    def text(self) -> str:
        return " ".join(self.emitted)
