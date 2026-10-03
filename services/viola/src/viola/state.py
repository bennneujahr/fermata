"""Zustandsautomat des Gesprächs (ohne Netz, ohne Modell, vollständig testbar).

Phasen: Begrüßung (mit KI-Hinweis) → Themenblöcke → Zusammenfassung zum Bestätigen → Abschluss → beendet.
Jede Phase kann jederzeit mit einem Grund beendet werden (Person, Zeit, Technik, Sicherheit).

Die Steuerung gibt dem Modell Hinweise (``Notice``): welcher Themenblock gerade dran ist, wann es weitergeht,
wann die Zeit knapp wird. Ein Block gilt als besprochen, wenn die Person mindestens ``min`` Antworten gegeben
und Viola mindestens eine Tatsache notiert hat, spätestens nach ``max`` Antworten (Tiefe je Stufe).
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass, field

from viola.context import TierDepth
from viola.domain import BLOCKS_BY_KIND, Block, EndReason, Kind, Phase

ALLOWED: dict[Phase, frozenset[Phase]] = {
    Phase.BEGRUESSUNG: frozenset({Phase.THEMEN, Phase.ZUSAMMENFASSUNG, Phase.BEENDET}),
    Phase.THEMEN: frozenset({Phase.ZUSAMMENFASSUNG, Phase.BEENDET}),
    Phase.ZUSAMMENFASSUNG: frozenset({Phase.ZUSAMMENFASSUNG, Phase.ABSCHLUSS, Phase.BEENDET}),
    Phase.ABSCHLUSS: frozenset({Phase.ZUSAMMENFASSUNG, Phase.BEENDET}),
    Phase.BEENDET: frozenset(),
}


class InvalidTransition(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class Notice:
    """Hinweis an das Modell; ``key`` verweist auf prompts/hinweise.md."""

    key: str
    values: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class Limits:
    max_minutes: int
    wrapup_minutes: int = 4
    grace_minutes: int = 2

    def __post_init__(self) -> None:
        if self.max_minutes <= 0:
            raise ValueError("max_minutes muss größer als 0 sein")


@dataclass(frozen=True, slots=True)
class TimeStatus:
    elapsed_s: float
    remaining_s: float
    wrapup_due: bool
    time_up: bool
    force_end: bool


class ConversationState:
    def __init__(
        self,
        kind: Kind,
        depth: TierDepth,
        limits: Limits,
        *,
        covered_before: tuple[Block, ...] = (),
        count_first_reply: bool | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.kind = kind
        self.depth = depth
        self.limits = limits
        self._clock = clock
        self.blocks: list[Block] = [b for b in BLOCKS_BY_KIND[kind] if b not in covered_before]
        self.covered: list[Block] = []
        self.phase = Phase.BEGRUESSUNG
        self.block_index = 0
        self.turns_in_block = 0
        self.facts_in_block = 0
        self.started_at: float | None = None
        self.end_reason: EndReason | None = None
        self.wrapup_sent = False
        self.time_up_sent = False
        self.summary_proposed = False
        self.summary_partial = False
        self.awaiting_summary_reply = False
        # Im Erstgespräch und in der Vertiefung endet die Begrüßung mit „Wollen wir anfangen?“ – die Antwort darauf
        # zählt nicht als Antwort im ersten Themenblock.
        self._skip_next_reply = (
            not count_first_reply if count_first_reply is not None
            else kind in (Kind.ERSTGESPRAECH, Kind.VERTIEFUNG) or bool(covered_before)
        )

    # -- Grundlagen -------------------------------------------------------
    def _go(self, phase: Phase) -> None:
        if phase not in ALLOWED[self.phase]:
            raise InvalidTransition(f"{self.phase.value} → {phase.value} ist nicht erlaubt")
        self.phase = phase

    @property
    def current_block(self) -> Block | None:
        if self.phase is not Phase.THEMEN or self.block_index >= len(self.blocks):
            return None
        return self.blocks[self.block_index]

    def remaining_blocks(self) -> list[Block]:
        return [b for b in self.blocks if b not in self.covered]

    def covered_blocks(self) -> list[Block]:
        return list(self.covered)

    @property
    def ended(self) -> bool:
        return self.phase is Phase.BEENDET

    def time_status(self) -> TimeStatus:
        if self.started_at is None:
            return TimeStatus(0.0, self.limits.max_minutes * 60.0, False, False, False)
        elapsed = self._clock() - self.started_at
        total = self.limits.max_minutes * 60.0
        remaining = total - elapsed
        return TimeStatus(
            elapsed_s=elapsed,
            remaining_s=remaining,
            wrapup_due=remaining <= self.limits.wrapup_minutes * 60.0,
            time_up=remaining <= 0,
            force_end=elapsed >= total + self.limits.grace_minutes * 60.0,
        )

    # -- Übergänge ---------------------------------------------------------
    def begin(self) -> None:
        if self.started_at is not None:
            raise InvalidTransition("Gespräch läuft bereits")
        self.started_at = self._clock()

    def greeting_done(self) -> list[Notice]:
        if self.phase is not Phase.BEGRUESSUNG:
            raise InvalidTransition("Begrüßung ist schon vorbei")
        if self.started_at is None:
            self.begin()
        if not self.blocks:
            self._go(Phase.ZUSAMMENFASSUNG)
            return [Notice("alle_bloecke")]
        self._go(Phase.THEMEN)
        return [Notice("block_start", {"block": self.blocks[0].value})]

    def on_person_turn(self) -> list[Notice]:
        """Eine Antwort der Person ist da. Liefert die Hinweise für Violas nächste Antwort."""
        if self.phase in (Phase.BEGRUESSUNG, Phase.BEENDET):
            raise InvalidTransition(f"Keine Antwort erwartet in Phase {self.phase.value}")
        notices: list[Notice] = []
        status = self.time_status()
        if status.time_up and not self.time_up_sent:
            self.time_up_sent = True
            if self.phase is Phase.THEMEN:
                self._mark_current_covered_if_started()
                self._go(Phase.ZUSAMMENFASSUNG)
            return [Notice("zeit_um")]

        if self.awaiting_summary_reply:
            self.awaiting_summary_reply = False
            self._go(Phase.ABSCHLUSS)
            return [Notice("nach_zusammenfassung_teil" if self.summary_partial else "nach_zusammenfassung")]

        if status.wrapup_due and not self.wrapup_sent and self.phase is Phase.THEMEN:
            self.wrapup_sent = True
            self._mark_current_covered_if_started()
            self._go(Phase.ZUSAMMENFASSUNG)
            minutes = max(1, round(status.remaining_s / 60))
            open_blocks = ", ".join(b.value for b in self.remaining_blocks()) or "keine"
            return [Notice("wrapup", {"minuten": str(minutes), "offen": open_blocks})]

        if self.phase is Phase.THEMEN:
            if self._skip_next_reply:
                self._skip_next_reply = False
                return notices
            self.turns_in_block += 1
            if self.turns_in_block >= self.depth.max_turns_per_block or (
                self.turns_in_block >= self.depth.min_turns_per_block and self.facts_in_block >= 1
            ):
                notices.extend(self._advance())
        return notices

    def _mark_current_covered_if_started(self) -> None:
        block = self.current_block
        if block is not None and (self.turns_in_block > 0 or self.facts_in_block > 0) and block not in self.covered:
            self.covered.append(block)

    def _advance(self) -> list[Notice]:
        done = self.blocks[self.block_index]
        if done not in self.covered:
            self.covered.append(done)
        self.block_index += 1
        self.turns_in_block = 0
        self.facts_in_block = 0
        if self.block_index < len(self.blocks):
            return [Notice("block_wechsel", {"alt": done.value, "neu": self.blocks[self.block_index].value})]
        self._go(Phase.ZUSAMMENFASSUNG)
        return [Notice("alle_bloecke")]

    def on_fact(self) -> None:
        if self.phase is Phase.THEMEN:
            self.facts_in_block += 1

    def on_summary_proposed(self, partial: bool) -> None:
        if self.phase is Phase.THEMEN:
            self._mark_current_covered_if_started()
        if self.phase is Phase.BEGRUESSUNG:
            raise InvalidTransition("Zusammenfassung vor der Begrüßung")
        self._go(Phase.ZUSAMMENFASSUNG)
        self.summary_proposed = True
        self.summary_partial = partial
        self.awaiting_summary_reply = True

    def end(self, reason: EndReason) -> None:
        if self.phase is Phase.BEENDET:
            return
        self._go(Phase.BEENDET)
        self.end_reason = reason
