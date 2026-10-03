"""Zustandsautomat: Phasen, Themenblöcke je Stufe, Zeitlimit, Fortsetzung."""

from __future__ import annotations

import pytest

from viola.context import TierDepth
from viola.domain import BLOCKS_BY_KIND, Block, EndReason, Kind, Phase
from viola.state import ConversationState, InvalidTransition, Limits

from .conftest import FakeClock

AUFTAKT = TierDepth(target_minutes=20, min_turns_per_block=2, max_turns_per_block=3)


def make(kind: Kind = Kind.ERSTGESPRAECH, clock: FakeClock | None = None, **kw: object) -> ConversationState:
    return ConversationState(kind, kw.pop("depth", AUFTAKT), kw.pop("limits", Limits(30, 4, 2)), clock=clock or FakeClock(), **kw)  # type: ignore[arg-type]


def test_starts_with_greeting_then_first_block() -> None:
    s = make()
    assert s.phase is Phase.BEGRUESSUNG
    s.begin()
    notices = s.greeting_done()
    assert s.phase is Phase.THEMEN
    assert [n.key for n in notices] == ["block_start"]
    assert s.current_block is Block.PERSOENLICHKEIT


def test_no_person_turn_during_greeting() -> None:
    s = make()
    with pytest.raises(InvalidTransition):
        s.on_person_turn()


def test_block_advances_after_max_turns_without_facts() -> None:
    s = make()
    s.greeting_done()
    assert s.on_person_turn() == []  # „Ja, gern“ auf „Wollen wir anfangen?“ zählt nicht
    assert s.on_person_turn() == []
    assert s.on_person_turn() == []
    notices = s.on_person_turn()
    assert notices[0].key == "block_wechsel"
    assert notices[0].values == {"alt": "persoenlichkeit", "neu": "werte"}
    assert s.covered_blocks() == [Block.PERSOENLICHKEIT]


def test_block_advances_after_min_turns_with_fact() -> None:
    s = make()
    s.greeting_done()
    s.on_person_turn()
    s.on_person_turn()
    s.on_fact()
    notices = s.on_person_turn()
    assert notices and notices[0].key == "block_wechsel"


def test_all_blocks_lead_to_summary_then_closing() -> None:
    s = make()
    s.greeting_done()
    s.on_person_turn()
    keys: list[str] = []
    for _ in range(len(BLOCKS_BY_KIND[Kind.ERSTGESPRAECH]) * 3):
        keys += [n.key for n in s.on_person_turn()]
    assert keys[-1] == "alle_bloecke"
    assert s.phase is Phase.ZUSAMMENFASSUNG
    assert s.remaining_blocks() == []
    s.on_summary_proposed(partial=False)
    assert [n.key for n in s.on_person_turn()] == ["nach_zusammenfassung"]
    assert s.phase is Phase.ABSCHLUSS
    s.end(EndReason.FERTIG)
    assert s.ended and s.end_reason is EndReason.FERTIG


def test_correction_after_summary_goes_back_to_summary() -> None:
    s = make(Kind.KORREKTUR)
    s.greeting_done()
    s.on_summary_proposed(partial=False)
    s.on_person_turn()
    assert s.phase is Phase.ABSCHLUSS
    s.on_summary_proposed(partial=False)
    assert s.phase is Phase.ZUSAMMENFASSUNG


def test_wrapup_notice_when_time_runs_short() -> None:
    clock = FakeClock()
    s = make(clock=clock)
    s.greeting_done()
    s.on_person_turn()
    s.on_person_turn()
    clock.advance(27 * 60)
    notices = s.on_person_turn()
    assert notices[0].key == "wrapup"
    assert notices[0].values["minuten"] == "3"
    assert "werte" in notices[0].values["offen"]
    assert s.phase is Phase.ZUSAMMENFASSUNG
    assert Block.PERSOENLICHKEIT in s.covered_blocks()


def test_time_up_and_force_end() -> None:
    clock = FakeClock()
    s = make(clock=clock)
    s.greeting_done()
    clock.advance(30 * 60 + 1)
    assert [n.key for n in s.on_person_turn()] == ["zeit_um"]
    assert s.time_status().time_up and not s.time_status().force_end
    clock.advance(2 * 60)
    assert s.time_status().force_end


def test_partial_summary_leads_to_partial_closing() -> None:
    clock = FakeClock()
    s = make(clock=clock)
    s.greeting_done()
    s.on_person_turn()
    clock.advance(27 * 60)
    s.on_person_turn()
    s.on_summary_proposed(partial=True)
    assert [n.key for n in s.on_person_turn()] == ["nach_zusammenfassung_teil"]


def test_continuation_skips_covered_blocks_and_first_reply() -> None:
    s = make(covered_before=(Block.PERSOENLICHKEIT, Block.WERTE))
    notices = s.greeting_done()
    assert notices[0].values["block"] == "wuensche"
    assert s.on_person_turn() == []
    assert s.turns_in_block == 0


def test_all_blocks_covered_goes_straight_to_summary() -> None:
    s = make(covered_before=tuple(BLOCKS_BY_KIND[Kind.ERSTGESPRAECH]))
    assert [n.key for n in s.greeting_done()] == ["alle_bloecke"]
    assert s.phase is Phase.ZUSAMMENFASSUNG


def test_debrief_counts_first_reply() -> None:
    s = make(Kind.NACHBESPRECHUNG)
    s.greeting_done()
    s.on_person_turn()
    assert s.turns_in_block == 1
    assert s.current_block is Block.ABEND_EINDRUCK


def test_deeper_tiers_need_more_turns() -> None:
    loge = make(depth=TierDepth(45, 4, 7))
    loge.greeting_done()
    loge.on_person_turn()
    for _ in range(3):
        loge.on_fact()
        assert loge.on_person_turn() == []
    assert loge.on_person_turn()[0].key == "block_wechsel"


def test_invalid_transitions_raise() -> None:
    s = make()
    s.begin()
    with pytest.raises(InvalidTransition):
        s.begin()
    s.greeting_done()
    with pytest.raises(InvalidTransition):
        s.greeting_done()
    s.end(EndReason.PERSON_BEENDET)
    s.end(EndReason.FERTIG)  # zweites Ende wird ignoriert
    assert s.end_reason is EndReason.PERSON_BEENDET
    with pytest.raises(InvalidTransition):
        s.on_person_turn()


def test_limits_validation() -> None:
    with pytest.raises(ValueError):
        Limits(0)
