"""Gesprächskern mit Attrappen: Ablauf, Werkzeuge, Sicherheit, Zeit, Verlauf nur anhängen."""

from __future__ import annotations

from typing import Any

import pytest

from viola import art9
from viola.backend import MemoryBackend
from viola.domain import AddressForm, Block, EndReason, Kind, Mode, Phase, Tier
from viola.engine import Conversation, EngineOptions
from viola.llm.base import ChatRequest, LlmUnavailable
from viola.llm.fake import FakeChatModel, FakeReply

from .conftest import FakeClock, make_context

ASK = "Danke, das ist schön. Was ist Ihnen wichtig?"


async def say(conv: Conversation, text: str) -> str:
    return " ".join([s async for s in conv.respond(text)])


def assert_valid_history(messages: list[dict[str, Any]]) -> None:
    """Regeln der Messages API: erst user; system nur nach user; jedes tool_use bekommt ein Ergebnis."""
    assert messages[0]["role"] == "user"
    for i, m in enumerate(messages):
        if m["role"] == "system":
            assert messages[i - 1]["role"] == "user"
            assert i == len(messages) - 1 or messages[i + 1]["role"] == "assistant"
        if m["role"] == "assistant":
            ids = [b["id"] for b in m["content"] if b.get("type") == "tool_use"]
            if ids and i + 1 < len(messages):
                nxt = messages[i + 1]
                assert nxt["role"] == "user"
                results = [b["tool_use_id"] for b in nxt["content"] if b.get("type") == "tool_result"]
                assert set(ids) <= set(results)
            assert m["content"], "keine leere Antwort"


async def open_conv(
    backend: MemoryBackend,
    model: FakeChatModel,
    clock: FakeClock | None = None,
    options: EngineOptions | None = None,
    **ctx_kw: Any,
) -> Conversation:
    ctx = await make_context(backend, **ctx_kw)
    conv = Conversation(ctx, model, backend, options=options, clock=clock or FakeClock())
    await conv.open()
    await conv.greeting_delivered()
    return conv


async def test_greeting_begins_with_ai_notice_and_notice_is_recorded_first(backend: MemoryBackend) -> None:
    ctx = await make_context(backend, mode=Mode.VOICE)
    conv = Conversation(ctx, FakeChatModel(), backend)
    greeting = await conv.open()
    assert greeting.startswith("Guten Tag. Ich bin Viola, eine künstliche Intelligenz von Fermata, kein Mensch.")
    assert "nicht aufgezeichnet" in greeting and "30 Tage" in greeting
    assert greeting.endswith("Wollen wir anfangen?")
    await conv.greeting_delivered()
    await conv.flush()
    names = [c[0] for c in backend.calls]
    assert names == ["context", "start", "ai_notice", "append_turns"]
    assert backend.sessions[ctx.session_id].turns[0]["text"] == greeting


async def test_du_form_and_display_name(backend: MemoryBackend) -> None:
    ctx = await make_context(backend, form=AddressForm.DU, display_name="Mia", mode=Mode.TEXT)
    greeting = await Conversation(ctx, FakeChatModel(), backend).open()
    assert greeting.startswith("Hallo, Mia. Ich bin Viola, eine künstliche Intelligenz")
    assert "Du kannst jederzeit aufhören" in greeting and "Sie " not in greeting


async def test_request_parameters_follow_sonnet_5_5_rules(backend: MemoryBackend) -> None:
    model = FakeChatModel([FakeReply(ASK)])
    conv = await open_conv(backend, model)
    await say(conv, "Ja, gern.")
    req = model.requests[0]
    assert req.model == "eu.anthropic.claude-sonnet-5-5"
    assert req.effort == "low" and req.thinking == "between_tools"
    assert [t["name"] for t in req.tools] == ["note_profile_fact", "propose_summary", "flag_safety", "end_conversation", "switch_to_text"]
    assert req.system[0]["cache_control"] == {"type": "ephemeral"}
    assert req.system[0]["text"].startswith("Anrede im Gespräch: Sie")


async def test_history_is_append_only_and_valid(backend: MemoryBackend) -> None:
    model = FakeChatModel([
        FakeReply("Schön. Was machen Sie gern?", [("note_profile_fact", {"category": "persoenlichkeit", "fact": "Die Person wandert gern.", "importance": 2})]),
        FakeReply("Verstehe. Und was noch?"),
        FakeReply("", [("note_profile_fact", {"category": "werte", "fact": "Ehrlichkeit ist wichtig.", "importance": 3})]),
        FakeReply("Danke. Wie wichtig ist Ihnen Zeit für sich?"),
    ])
    conv = await open_conv(backend, model)
    for text in ("Ja, gern.", "Ich wandere gern.", "Ehrlichkeit ist mir wichtig."):
        await say(conv, text)
    for earlier, later in zip(model.requests, model.requests[1:], strict=False):
        assert later.messages[: len(earlier.messages)] == earlier.messages
        assert later.system == earlier.system and later.tools == earlier.tools
    for req in model.requests:
        assert_valid_history(req.messages)
    assert len(model.requests) == 4  # dritter Zug: Werkzeug ohne Text → sofort weiter
    assert [n["fact"] for n in conv.notes] == ["Die Person wandert gern.", "Ehrlichkeit ist wichtig."]


async def test_tool_results_ride_along_with_next_person_message(backend: MemoryBackend) -> None:
    model = FakeChatModel([
        FakeReply(ASK, [("note_profile_fact", {"category": "werte", "fact": "Verlässlichkeit zählt.", "importance": 3})]),
        FakeReply(ASK),
    ])
    conv = await open_conv(backend, model)
    await say(conv, "Ja.")
    await say(conv, "Verlässlichkeit.")
    second = model.requests[1].messages
    user = [m for m in second if m["role"] == "user"][-1]
    assert user["content"][0]["type"] == "tool_result"
    assert user["content"][0]["content"] == "Notiert."
    assert user["content"][-1] == {"type": "text", "text": "Verlässlichkeit."}


async def test_notices_as_system_message_or_marked_text(backend: MemoryBackend) -> None:
    model = FakeChatModel([FakeReply(ASK)])
    await say(await open_conv(backend, model), "Ja.")
    msgs = model.requests[0].messages
    assert msgs[-1]["role"] == "system"
    assert "Leitfaden: Aktueller Themenblock: Persönlichkeit." in msgs[-1]["content"]

    model2 = FakeChatModel([FakeReply(ASK)])
    conv2 = await open_conv(MemoryBackend(), model2, options=EngineOptions(notice_style="user_text"))
    await say(conv2, "Ja.")
    last = model2.requests[0].messages[-1]
    assert last["role"] == "user"
    assert last["content"][-1]["text"].startswith('<hinweis von="fermata">Leitfaden')


async def test_art9_fact_is_not_noted_and_model_is_told(backend: MemoryBackend) -> None:
    model = FakeChatModel([
        FakeReply("Danke. Was ist Ihnen sonst wichtig?", [("note_profile_fact", {"category": "werte", "fact": "Die Person ist sehr gläubig.", "importance": 3})]),
        FakeReply(ASK),
    ])
    conv = await open_conv(backend, model)
    await say(conv, "Ich bin sehr gläubig und gehe jeden Sonntag in die Kirche.")
    await say(conv, "Und ich wandere.")
    assert conv.notes == []
    second = model.requests[1].messages
    assert "Nicht notiert" in str(second)
    # Der Hinweis „geschützter Bereich“ ging an das Modell, das Transkript ist geschwärzt
    first_system = [m for m in model.requests[0].messages if m["role"] == "system"][-1]["content"]
    assert "geschützten Bereich" in first_system
    await conv.flush()
    stored = backend.sessions[conv.session_id].turns
    assert stored[1]["text"] == art9.REDACTED
    assert stored[3]["text"] == "Und ich wandere."


async def test_summary_flow_end_and_finish_saves_profile(backend: MemoryBackend) -> None:
    analysis = {
        "summary": "Sie sind ruhig und neugierig. Sie gehen sonntags in die Kirche. Sie wünschen sich ein Gegenüber mit Humor.",
        "personality": {"traits": ["ruhig", "neugierig"], "interests": ["Wandern"], "notes": ""},
        "values_profile": {"values": ["Ehrlichkeit"], "relationship": ["Verlässlichkeit"], "notes": ""},
        "life_circumstances": {"work": "Schuldienst", "living": "Wismar", "family": None, "free_evenings": ["fr", "sa"],
                               "free_time_notes": None},
        "age_min": 35, "age_max": 50, "travel_modes": ["oepnv", "rad"], "travel_max_minutes": 40, "travel_max_km": None,
        "smoking": "nein", "has_children": False, "wants_children": "offen",
        "wants": [{"category": "persoenlichkeit", "text": "Humor", "importance": 3}],
        "dealbreakers": [{"kind": "raucht", "text": "Rauchen"}],
        "personal_weights": {"werte": 3, "wuensche": 3, "lebensumstaende": 1, "persoenlichkeit": 2, "zeiten": 1},
    }
    model = FakeChatModel(
        [
            FakeReply(ASK),
            FakeReply("Ich fasse kurz zusammen. Stimmt das so?", [("propose_summary", {
                "summary": "Sie sind ruhig. Sie sind Christin. Sie wandern gern und mögen Humor.", "is_partial": False})]),
            FakeReply("Danke, dann ist alles bereit.", [("end_conversation", {"reason": "fertig"})]),
        ],
        json_replies=[analysis, {"flagged": []}, {"flagged": []}, {"flags": []}],
    )
    conv = await open_conv(backend, model)
    await say(conv, "Ja.")
    out = await say(conv, "Das war es von mir.")
    assert out.endswith("Stimmt das so?")
    events = conv.take_events()
    assert events[0].type == "summary_proposed"
    assert events[0].data["text"] == "Sie sind ruhig. Sie wandern gern und mögen Humor."
    assert conv.state.phase is Phase.ZUSAMMENFASSUNG
    await say(conv, "Ja, das passt.")
    notice = [m for m in model.requests[2].messages if m["role"] == "system"][-1]["content"]
    assert "Die Person hat auf die Zusammenfassung geantwortet" in notice
    assert conv.ended and conv.end_reason is EndReason.FERTIG
    assert backend.sessions[conv.session_id].status == "completed"

    await conv.finish()
    s = backend.sessions[conv.session_id]
    assert s.analysis is not None and s.analysis_status == "saved"
    assert s.analysis["wants"] == [{"category": "persoenlichkeit", "text": "Humor", "importance": 3}]
    assert sum(s.analysis["personal_weights"].values()) == pytest.approx(1.0)
    assert s.summary_draft == "Sie sind ruhig und neugierig. Sie wünschen sich ein Gegenüber mit Humor."
    assert s.costs and s.costs[0]["llm_input_tokens"] > 0 and s.costs[0]["details"]["mode"] == "text"
    analysis_request = model.json_requests[0]
    assert "Person: Das war es von mir." in analysis_request.user and "<anrede>Sie</anrede>" in analysis_request.user
    await conv.finish()  # zweiter Aufruf ändert nichts
    assert len(s.costs) == 1


async def test_finish_falls_back_to_proposed_summary(backend: MemoryBackend) -> None:
    model = FakeChatModel([
        FakeReply(ASK),
        FakeReply("Passt das?", [("propose_summary", {"summary": "Sie sind ruhig und wandern gern an der See.", "is_partial": False})]),
    ])
    conv = await open_conv(backend, model)
    await say(conv, "Ja.")
    await say(conv, "Ich wandere.")
    await conv.end_by_person()
    await conv.finish()
    s = backend.sessions[conv.session_id]
    assert s.summary_draft == "Sie sind ruhig und wandern gern an der See."
    assert s.analysis_status == "failed"
    assert s.end_reason == "person_beendet"


async def test_crisis_gets_hotlines_flag_and_gentle_end(backend: MemoryBackend) -> None:
    model = FakeChatModel([FakeReply(ASK), FakeReply("Das klingt sehr schwer. Ich bin froh, dass Sie es sagen.")], json_replies=[{"flags": []}])
    conv = await open_conv(backend, model, mode=Mode.VOICE)
    await say(conv, "Ja.")
    out = await say(conv, "Ich will mich umbringen.")
    assert "0800 1110111" in out and "112" in out
    assert conv.ended and conv.end_reason is EndReason.KRISE
    assert any(e.type == "crisis_resources" for e in conv.take_events())
    notice = [m for m in model.requests[1].messages if m["role"] == "system"][-1]["content"]
    assert "Krisen-Leitfaden" in notice
    await conv.finish()
    s = backend.sessions[conv.session_id]
    assert s.flags[0]["kind"] == "krise" and s.flags[0]["severity"] == "akut" and s.flags[0]["detectors"] == ["regel"]
    assert s.analysis_status == "skipped" and s.summary_draft is None
    assert s.turns[3]["text"] == "Ich will mich umbringen."  # Sicherheits-Treffer bleibt wörtlich (Prüfung durch Benn)


async def test_minor_ends_via_tool_and_no_profile(backend: MemoryBackend) -> None:
    model = FakeChatModel([
        FakeReply(ASK),
        FakeReply("Fermata ist erst ab 18, deshalb beende ich unser Gespräch jetzt.",
                  [("flag_safety", {"kind": "minderjaehrig", "severity": "hoch"}), ("end_conversation", {"reason": "minderjaehrig"})]),
    ], json_replies=[{"flags": []}])
    conv = await open_conv(backend, model)
    await say(conv, "Ja.")
    await say(conv, "Ich bin 16 Jahre alt.")
    assert conv.end_reason is EndReason.MINDERJAEHRIG
    await conv.finish()
    s = backend.sessions[conv.session_id]
    assert s.status == "aborted" and s.analysis_status == "skipped"
    assert {d for f in s.flags for d in f["detectors"]} == {"regel", "viola"}


async def test_harassment_boundary_then_forced_end(backend: MemoryBackend) -> None:
    model = FakeChatModel([FakeReply(ASK), FakeReply("So möchte ich nicht angesprochen werden. Wollen wir respektvoll weitermachen?"),
                           FakeReply("Das ist schade.")])
    conv = await open_conv(backend, model)
    await say(conv, "Ja.")
    await say(conv, "Halt die Fresse.")
    assert not conv.ended
    out = await say(conv, "Fick dich.")
    assert out.endswith("Ich beende das Gespräch jetzt. Fermata sieht sich den Verlauf an.")
    assert conv.end_reason is EndReason.MISSBRAUCH


async def test_llm_failures_lead_to_fixed_sentences(backend: MemoryBackend) -> None:
    model = FakeChatModel([FakeReply(fail=LlmUnavailable("weg")), FakeReply(fail=LlmUnavailable("weg"))])
    conv = await open_conv(backend, model)
    first = await say(conv, "Ja.")
    assert first.startswith("Entschuldigung, bei mir hakt gerade die Technik.")
    assert not conv.ended
    second = await say(conv, "Hallo?")
    assert second.startswith("Leider klappt die Technik gerade nicht.")
    assert conv.end_reason is EndReason.TECHNIK
    assert_valid_history(conv.messages)


async def test_refusal_gets_calm_fixed_answer(backend: MemoryBackend) -> None:
    model = FakeChatModel([FakeReply(refusal="general_harms")])
    conv = await open_conv(backend, model)
    out = await say(conv, "Ja.")
    assert out == "Darauf kann ich nicht eingehen. Wollen wir beim Gespräch über Sie bleiben?"
    assert conv.meter.refusals == 1


async def test_brevity_two_sentences_then_one_question(backend: MemoryBackend) -> None:
    model = FakeChatModel([FakeReply("Eins. Zwei. Drei. Vier. Was meinen Sie dazu?")])
    conv = await open_conv(backend, model)
    assert await say(conv, "Ja.") == "Eins. Zwei. Was meinen Sie dazu?"
    assert conv.meter.brevity_cuts == 2


async def test_time_limit_wrapup_then_forced_end(backend: MemoryBackend) -> None:
    clock = FakeClock()
    model = FakeChatModel([FakeReply(ASK), FakeReply("Ich fasse kurz zusammen. Passt das?")])
    conv = await open_conv(backend, model, clock=clock, max_minutes=10)
    await say(conv, "Ja.")
    clock.advance(7 * 60)
    await say(conv, "Ich erzähle weiter.")
    notice = [m for m in model.requests[1].messages if m["role"] == "system"][-1]["content"]
    assert notice.startswith("Zeit: Es bleiben noch etwa 3 Minuten.")
    clock.advance(6 * 60)  # 13 Minuten > 10 + 2 Minuten Nachfrist
    out = await say(conv, "Noch etwas.")
    assert out.startswith("Unsere Zeit für dieses Gespräch ist um.")
    assert conv.end_reason is EndReason.ZEITLIMIT
    assert len(model.requests) == 2


async def test_time_up_without_goodbye_from_model_is_closed_by_engine(backend: MemoryBackend) -> None:
    clock = FakeClock()
    model = FakeChatModel([FakeReply(ASK), FakeReply("Danke für Ihre Offenheit.")])
    conv = await open_conv(backend, model, clock=clock, max_minutes=10)
    await say(conv, "Ja.")
    clock.advance(10 * 60 + 5)
    out = await say(conv, "Und dann noch.")
    assert "zeit_um" not in out and out.endswith("Bis bald.")
    assert conv.end_reason is EndReason.ZEITLIMIT


async def test_interruption_keeps_history_valid(backend: MemoryBackend) -> None:
    model = FakeChatModel([
        FakeReply("Erster Satz. Zweiter Satz mit Frage?", [("note_profile_fact", {"category": "werte", "fact": "Ruhe ist wichtig.", "importance": 2})]),
        FakeReply("Ah, Sie wollten noch etwas sagen. Was denn?"),
    ])
    conv = await open_conv(backend, model, mode=Mode.VOICE)
    gen = conv.respond("Ja.")
    first = await gen.__anext__()
    assert first == "Erster Satz."
    await gen.aclose()  # Die Person redet dazwischen
    conv.note_interruption("Erster Satz.")
    await say(conv, "Moment, noch etwas.")
    last = model.requests[-1]
    assert_valid_history(last.messages)
    assert "Gehört hat sie" not in str(last.messages)
    assert "nur diesen Anfang gehört: Erster Satz." in str(last.messages)


async def test_interruption_during_stream_appends_placeholder_answer(backend: MemoryBackend) -> None:
    model = FakeChatModel([FakeReply("Eins. Zwei. Drei?"), FakeReply(ASK)])
    conv = await open_conv(backend, model, mode=Mode.VOICE)
    gen = conv.respond("Ja.")
    await gen.__anext__()
    await gen.aclose()
    await say(conv, "Weiter.")
    assert_valid_history(model.requests[-1].messages)


async def test_silence_prompts_then_end(backend: MemoryBackend) -> None:
    conv = await open_conv(backend, FakeChatModel(), mode=Mode.VOICE)
    assert await conv.on_silence() == "Sind Sie noch da? Lassen Sie sich ruhig Zeit."
    assert (await conv.on_silence() or "").startswith("Ich bin weiter da.")
    assert (await conv.on_silence() or "").startswith("Ich beende unser Gespräch jetzt.")
    assert conv.end_reason is EndReason.PERSON_BEENDET
    assert await conv.on_silence() is None


async def test_switch_to_text_tool_in_voice(backend: MemoryBackend) -> None:
    model = FakeChatModel([FakeReply("Gern, dann schreiben wir weiter.", [("switch_to_text", {"reason": "wunsch_der_person"})]), FakeReply(ASK)])
    conv = await open_conv(backend, model, mode=Mode.VOICE)
    await say(conv, "Ich schreibe lieber.")
    await conv.flush()
    assert conv.mode is Mode.TEXT and backend.sessions[conv.session_id].mode == "text"
    assert [e.type for e in conv.take_events()] == ["switch_to_text"]
    await say(conv, "Hallo, hier schreibe ich.")
    assert_valid_history(model.requests[-1].messages)


async def test_resume_after_restart_uses_stored_turns(backend: MemoryBackend) -> None:
    ctx = await make_context(backend)
    first = Conversation(ctx, FakeChatModel([FakeReply(ASK)]), backend)
    await first.open()
    await first.greeting_delivered()
    await say(first, "Ich wandere gern.")
    await first.flush()
    from viola.context import SessionContext

    ctx2 = SessionContext.from_json(await backend.context(ctx.session_id))
    assert len(ctx2.turns) == 3
    model = FakeChatModel([FakeReply(ASK)])
    second = Conversation(ctx2, model, backend)
    greeting = await second.open()
    assert greeting.startswith("Guten Tag. Ich bin Viola, eine künstliche Intelligenz")
    assert "Schön, dass wir weitermachen" in greeting
    await say(second, "Weiter geht's.")
    assert "Person: Ich wandere gern." in model.requests[0].messages[0]["content"][0]["text"]


async def test_continuation_uses_previous_summary(backend: MemoryBackend) -> None:
    model = FakeChatModel([FakeReply(ASK)])
    conv = await open_conv(
        backend, model, tier=Tier.LOGE,
        previous={"session_id": "00000000-0000-0000-0000-000000000001", "summary_draft": "Sie sind ruhig.",
                  "covered_blocks": ["persoenlichkeit", "werte"]},
    )
    assert conv.state.blocks[0] is Block.WUENSCHE
    await say(conv, "Ja.")
    context_text = model.requests[0].messages[0]["content"][0]["text"]
    assert "Zusammenfassung der letzten Sitzung: Sie sind ruhig." in context_text
    assert "Bereits besprochen: Persönlichkeit, Werte" in context_text


async def test_latency_and_turn_metrics(backend: MemoryBackend) -> None:
    clock = FakeClock()

    def slow(_req: ChatRequest) -> FakeReply:
        clock.advance(1.2)
        return FakeReply(ASK)

    conv = await open_conv(backend, FakeChatModel([slow, slow]), clock=clock)
    await say(conv, "Ja.")
    await say(conv, "Gut.")
    assert conv.latency.samples_ms == [pytest.approx(1200.0), pytest.approx(1200.0)]
    assert conv.meter.turns == 2


async def test_debrief_greeting_does_not_mention_counterpart(backend: MemoryBackend) -> None:
    ctx = await make_context(backend, kind=Kind.NACHBESPRECHUNG, tier=Tier.ANDANTE, form=AddressForm.DU)
    greeting = await Conversation(ctx, FakeChatModel(), backend).open()
    assert "Über dein Gegenüber spreche ich dabei nicht." in greeting
    assert greeting.endswith("Wie war der Abend für dich?")
