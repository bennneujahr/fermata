"""LLM-Teil: Anfrageform an Bedrock, Fehlerfälle, input_hash und Wiederverwendung, Eingaben ohne sensible Daten."""

from __future__ import annotations

import json
import types

import anthropic
import pytest

from fermata_matcher.llm import client as llm_client
from fermata_matcher.llm.client import AnthropicBedrockLLM, FakeLLM, LLMUsage, mantle_model_id
from fermata_matcher.llm.evaluate import LLMStats, canonical, evaluate_pairs, input_hash, pair_payload, person_input
from fermata_matcher.llm.prompts import REVIEW_SCHEMA, RUBRIC_SCHEMA, RUBRIC_SYSTEM, RUBRIC_VERSION
from fermata_matcher.llm.review import ReviewInput, review_pairings
from fermata_matcher.models import Dealbreaker, Want

from conftest import make_person


class FakeMessages:
    def __init__(self, response):
        self.response = response
        self.kwargs = None

    def create(self, **kwargs):
        self.kwargs = kwargs
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


def make_response(
    text='{"score": 0.8, "begruendung": "b", "bedenken": [], "warum_sie_beide": "w"}',
    stop_reason="end_turn",
    stop_details=None,
):
    usage = types.SimpleNamespace(
        input_tokens=100, output_tokens=50, cache_read_input_tokens=900, cache_creation_input_tokens=0
    )
    content = [types.SimpleNamespace(type="thinking", thinking=""), types.SimpleNamespace(type="text", text=text)]
    return types.SimpleNamespace(usage=usage, content=content, stop_reason=stop_reason, stop_details=stop_details)


def bedrock_with(response) -> tuple[AnthropicBedrockLLM, FakeMessages]:
    llm = AnthropicBedrockLLM.__new__(AnthropicBedrockLLM)
    llm._anthropic = anthropic
    llm.backend = "bedrock"
    llm.model_id = "eu.anthropic.claude-sonnet-5-5"
    msgs = FakeMessages(response)
    llm.client = types.SimpleNamespace(messages=msgs)
    return llm, msgs


def test_request_shape_for_sonnet_5_5():
    llm, msgs = bedrock_with(make_response())
    resp = llm.complete_json(system=RUBRIC_SYSTEM, user="{}", schema=RUBRIC_SCHEMA, max_tokens=4000, effort="low")
    kw = msgs.kwargs
    assert kw["model"] == "eu.anthropic.claude-sonnet-5-5"
    assert kw["output_config"] == {"effort": "low", "format": {"type": "json_schema", "schema": RUBRIC_SCHEMA}}
    assert kw["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert kw["system"][0]["text"] == RUBRIC_SYSTEM
    for forbidden in ("temperature", "top_p", "top_k", "tool_choice", "thinking"):
        assert forbidden not in kw
    assert resp.data["score"] == 0.8  # Text-Block wird nach Typ gefunden, nicht nach Position
    assert resp.usage.cache_read_tokens == 900


def test_schemas_are_strict():
    for schema in (RUBRIC_SCHEMA, REVIEW_SCHEMA):
        assert schema["additionalProperties"] is False
        assert set(schema["required"]) == set(schema["properties"])


def test_refusal_and_max_tokens_and_bad_json():
    llm, _ = bedrock_with(
        make_response(stop_reason="refusal", stop_details=types.SimpleNamespace(category="general_harms"))
    )
    r = llm.complete_json(system="s", user="{}", schema={}, max_tokens=10, effort="low")
    assert r.data is None and r.error == "refusal:general_harms"
    llm, _ = bedrock_with(make_response(stop_reason="max_tokens"))
    assert llm.complete_json(system="s", user="{}", schema={}, max_tokens=10, effort="low").error == "max_tokens"
    llm, _ = bedrock_with(make_response(text="kein json"))
    assert llm.complete_json(system="s", user="{}", schema={}, max_tokens=10, effort="low").error == "json"


def test_connection_error_is_reported_not_raised():
    import httpx2

    err = anthropic.APIConnectionError(request=httpx2.Request("POST", "https://bedrock.example"))
    llm, _ = bedrock_with(err)
    assert llm.complete_json(system="s", user="{}", schema={}, max_tokens=10, effort="low").error == "connection"


def test_mantle_model_id():
    assert mantle_model_id("eu.anthropic.claude-sonnet-5-5") == "anthropic.claude-sonnet-5-5"
    assert mantle_model_id("anthropic.claude-sonnet-5-5") == "anthropic.claude-sonnet-5-5"


def test_make_llm_backends(monkeypatch):
    assert llm_client.make_llm("none", region="eu-central-1", model_id="x") is None
    assert isinstance(llm_client.make_llm("fake", region="eu-central-1", model_id="x"), FakeLLM)
    created = {}

    class Dummy:
        def __init__(self, backend, region, model_id):
            created.update(backend=backend, region=region, model_id=model_id)

    monkeypatch.setattr(llm_client, "AnthropicBedrockLLM", Dummy)
    llm_client.make_llm("bedrock", region="eu-central-1", model_id="eu.anthropic.claude-sonnet-5-5")
    assert created == {"backend": "bedrock", "region": "eu-central-1", "model_id": "eu.anthropic.claude-sonnet-5-5"}


def test_person_input_has_no_names_plz_or_art9():
    p = make_person(
        display_name="Christian",
        summary_text="Christian, Sie wohnen in 19053 und wandern gern. Ihr Glaube ist Ihnen wichtig.",
        life={"interessen": ["Wandern", "Gottesdienst"], "religion": "evangelisch"},
        wants=[Want("werte", "Jemand, der katholisch ist.", 3), Want("persoenlichkeit", "Humor", 2)],
        dealbreakers=[Dealbreaker("sonstiges", {}, "Keine Raucher, Christian mag das nicht.")],
    )
    data = person_input(p)
    text = canonical(data)
    for forbidden in ("Christian", "19053", "Glaube", "Gottesdienst", "evangelisch", "katholisch", "religion"):
        assert forbidden not in text
    assert data["wuensche"] == [{"kategorie": "persoenlichkeit", "text": "Humor", "wichtigkeit": 2}]
    assert data["weitere_ausschluesse"] == ["Keine Raucher, die Person mag das nicht."]
    assert "lat" not in text and "user_id" not in text


def test_input_hash_depends_on_inputs_rubric_and_model():
    a, b = person_input(make_person()), person_input(make_person(age=41))
    payload = pair_payload(a, b, 12.4, "sie")
    h = input_hash(payload, "m1")
    assert h == input_hash(json.loads(canonical(payload)), "m1")  # Reihenfolge der Schlüssel egal
    assert h != input_hash(payload, "m2")
    assert h != input_hash(payload, "m1", rubric_version=RUBRIC_VERSION + "x")
    assert h != input_hash(pair_payload(a, b, 12.4, "du"), "m1")
    assert h == input_hash(pair_payload(a, b, 11.0, "sie"), "m1")  # Entfernung auf 5 km gerundet
    assert h != input_hash(pair_payload(a, b, 13.6, "sie"), "m1")
    changed = make_person(summary_text="Sie segeln gern.")
    assert h != input_hash(pair_payload(person_input(changed), b, 12.4, "sie"), "m1")


def test_evaluate_reuses_prior_by_hash():
    fake = FakeLLM()
    a, b, c = person_input(make_person()), person_input(make_person(age=41)), person_input(make_person(age=45))
    payloads = {(0, 1): pair_payload(a, b, 5, "sie"), (0, 2): pair_payload(a, c, 5, "sie")}
    h01 = input_hash(payloads[(0, 1)], fake.model_id)
    prior = {h01: {"llm_score": 0.77, "llm_rationale": "alt", "reasons_draft": "alt", "concerns": ["x"]}}
    stats = LLMStats()
    out = evaluate_pairs(fake, payloads, prior, effort="low", concurrency=2, stats=stats)
    assert out[(0, 1)].reused and out[(0, 1)].score == 0.77 and out[(0, 1)].concerns == ["x"]
    assert not out[(0, 2)].reused and out[(0, 2)].score is not None
    assert stats.requested == 2 and stats.reused == 1 and stats.calls == 1 and fake.calls == 1
    assert fake.requests[0]["effort"] == "low"


def test_evaluate_counts_errors_and_refusals():
    fake = FakeLLM(fail_rate=1.0)
    payloads = {(0, 1): pair_payload(person_input(make_person()), person_input(make_person()), 5, "sie")}
    stats = LLMStats()
    out = evaluate_pairs(fake, payloads, {}, effort="low", concurrency=1, stats=stats)
    assert out[(0, 1)].error.startswith("refusal") and out[(0, 1)].score is None
    assert stats.errors == 1 and stats.refusals == 1 and stats.error_kinds == {"refusal": 1}


def test_fake_rubric_reasons_follow_address_form():
    fake = FakeLLM()
    a = person_input(make_person())
    for mode, lead in (("sie", "Sie beide"), ("du", "Ihr beide"), ("gemischt", "Beide")):
        payload = pair_payload(a, a, 5, mode)
        r = fake.complete_json(
            system=RUBRIC_SYSTEM, user="x" + canonical(payload), schema=RUBRIC_SCHEMA, max_tokens=100, effort="low"
        )
        assert r.data["warum_sie_beide"].startswith(lead)
        assert 0 <= r.data["score"] <= 1


def test_usage_cost():
    u = LLMUsage(input_tokens=1_000_000, output_tokens=100_000, cache_read_tokens=2_000_000, cache_write_tokens=0)
    assert u.cost_usd({"input": 2.2, "output": 11.0, "cache_read": 0.22, "cache_write": 2.75}) == pytest.approx(
        2.2 + 1.1 + 0.44
    )


def review_item(draft: str, mode: str = "sie") -> ReviewInput:
    a = person_input(make_person())
    return ReviewInput(
        key="k",
        person_a=a,
        person_b=a,
        names=["Anna", "Jonas"],
        mode=mode,
        scores={"teil_scores": {}},
        rationale="r",
        concerns=[],
        reasons_draft=draft,
        venue={"verhaeltnis_ok": True},
        hints=[],
    )


def test_review_keeps_clean_text():
    stats = LLMStats()
    out = review_pairings(
        FakeLLM(), [review_item("Sie beide mögen Jazz! Das passt.")], effort="low", concurrency=1, stats=stats
    )["k"]
    assert out.reasons_clean and out.reasons_text == "Sie beide mögen Jazz. Das passt."
    assert out.notes["agent"]["empfehlung"] == "freigeben"
    assert stats.review_calls == 1


@pytest.mark.parametrize("draft", ["Ihr Glaube verbindet Sie beide.", "Anna und Sie mögen Jazz.", "Er mag Jazz."])
def test_review_replaces_problematic_text(draft):
    out = review_pairings(FakeLLM(), [review_item(draft)], effort="low", concurrency=1, stats=LLMStats())["k"]
    assert not out.reasons_clean
    assert out.reasons_text.startswith("Sie beide haben in Ihren Gesprächen")
    assert out.notes["ersatztext_verwendet"] and not out.notes["art9_filter"]["ok"]
    assert any("Ersatztext" in h for h in out.notes["hinweise"])


def test_review_agent_verdict_alone_triggers_replacement():
    class Suspicious(FakeLLM):
        def _review(self, payload):
            data = super()._review(payload)
            data.update(art9_verdacht=True, art9_hinweis="angedeutet", empfehlung="genauer_pruefen")
            return data

    out = review_pairings(
        Suspicious(), [review_item("Sie beide mögen Jazz.", "du")], effort="low", concurrency=1, stats=LLMStats()
    )["k"]
    assert out.notes["art9_filter"]["ok"] and out.notes["ersatztext_verwendet"]
    assert out.reasons_text.startswith("Ihr beide")


def test_review_without_llm_uses_rules_only():
    out = review_pairings(None, [review_item("Sie beide mögen Jazz.")], effort="low", concurrency=1, stats=LLMStats())[
        "k"
    ]
    assert out.reasons_clean and out.notes["agent"] is None
