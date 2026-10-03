"""Anbindung an Claude (Anthropic SDK) gegen einen nachgebildeten HTTP-Endpunkt – ohne Netz, ohne Zugangsdaten."""

from __future__ import annotations

import json
from typing import Any

import anthropic
import httpx2
import pytest

from viola.llm.anthropic_llm import AnthropicChatModel, model_for_provider
from viola.llm.base import ChatRequest, JsonRequest, LlmUnavailable, TextDelta, TurnDone
from viola.tools import ALL_TOOLS


def sse(events: list[dict[str, Any]]) -> bytes:
    return "".join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n" for e in events).encode()


def message_events(blocks: list[dict[str, Any]], stop_reason: str = "end_turn", stop_details: Any = None) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = [{
        "type": "message_start",
        "message": {"id": "msg_1", "type": "message", "role": "assistant", "model": "claude-sonnet-5-5", "content": [],
                    "stop_reason": None, "stop_sequence": None,
                    "usage": {"input_tokens": 1200, "output_tokens": 1, "cache_read_input_tokens": 5000, "cache_creation_input_tokens": 300}},
    }]
    for i, b in enumerate(blocks):
        if b["type"] == "text":
            events.append({"type": "content_block_start", "index": i, "content_block": {"type": "text", "text": ""}})
            for part in b["parts"]:
                events.append({"type": "content_block_delta", "index": i, "delta": {"type": "text_delta", "text": part}})
        elif b["type"] == "thinking":
            events.append({"type": "content_block_start", "index": i, "content_block": {"type": "thinking", "thinking": "", "signature": ""}})
            events.append({"type": "content_block_delta", "index": i, "delta": {"type": "thinking_delta", "thinking": b["thinking"]}})
            events.append({"type": "content_block_delta", "index": i, "delta": {"type": "signature_delta", "signature": "sig123"}})
        else:
            events.append({"type": "content_block_start", "index": i, "content_block": {"type": "tool_use", "id": b["id"], "name": b["name"], "input": {}}})
            events.append({"type": "content_block_delta", "index": i, "delta": {"type": "input_json_delta", "partial_json": json.dumps(b["input"])}})
        events.append({"type": "content_block_stop", "index": i})
    delta: dict[str, Any] = {"stop_reason": stop_reason, "stop_sequence": None}
    if stop_details is not None:
        delta["stop_details"] = stop_details
    events.append({"type": "message_delta", "delta": delta, "usage": {"output_tokens": 42}})
    events.append({"type": "message_stop"})
    return events


class Recorder:
    def __init__(self, responses: list[httpx2.Response]) -> None:
        self.responses = responses
        self.requests: list[httpx2.Request] = []

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        self.requests.append(request)
        return self.responses.pop(0)

    @property
    def body(self) -> dict[str, Any]:
        return json.loads(self.requests[-1].content)


def first_party(rec: Recorder, **kw: Any) -> AnthropicChatModel:
    client = anthropic.AsyncAnthropic(api_key="test-key", max_retries=0, http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(rec)))
    return AnthropicChatModel(client, provider="anthropic", **kw)


def chat_request() -> ChatRequest:
    return ChatRequest(
        model="eu.anthropic.claude-sonnet-5-5",
        system=[{"type": "text", "text": "System", "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": [{"type": "text", "text": "Hallo"}]}, {"role": "system", "content": "Leitfaden"}],
        tools=[dict(t) for t in ALL_TOOLS],
        max_tokens=2048,
        effort="low",
        thinking="between_tools",
    )


def test_model_id_mapping() -> None:
    assert model_for_provider("eu.anthropic.claude-sonnet-5-5", "anthropic") == "claude-sonnet-5-5"
    assert model_for_provider("eu.anthropic.claude-sonnet-5-5", "bedrock") == "eu.anthropic.claude-sonnet-5-5"


async def test_stream_turn_sends_sonnet_5_5_parameters_and_parses_blocks() -> None:
    rec = Recorder([httpx2.Response(200, headers={"content-type": "text/event-stream"}, content=sse(message_events([
        {"type": "thinking", "thinking": "Kurz notieren."},
        {"type": "text", "parts": ["Schön. ", "Was ist Ihnen wichtig?"]},
        {"type": "tool_use", "id": "toolu_1", "name": "note_profile_fact", "input": {"category": "werte", "fact": "Ruhe", "importance": 2}},
    ], stop_reason="tool_use")))])
    model = first_party(rec)
    items = [i async for i in model.stream_turn(chat_request())]
    deltas = [i.text for i in items if isinstance(i, TextDelta)]
    assert deltas == ["Schön. ", "Was ist Ihnen wichtig?"]
    done = items[-1]
    assert isinstance(done, TurnDone)
    r = done.result
    assert r.text == "Schön. Was ist Ihnen wichtig?" and r.stop_reason == "tool_use"
    assert r.tool_uses[0].name == "note_profile_fact" and r.tool_uses[0].input["category"] == "werte"
    assert r.content[0] == {"type": "thinking", "thinking": "Kurz notieren.", "signature": "sig123"}, "thinking unverändert für den Verlauf"
    assert (r.usage.input_tokens, r.usage.output_tokens, r.usage.cache_read_tokens, r.usage.cache_write_tokens) == (1200, 42, 5000, 300)
    assert r.ttft_ms is not None

    body = rec.body
    assert body["model"] == "claude-sonnet-5-5"
    assert body["thinking"] == {"type": "between_tools"}
    assert body["output_config"] == {"effort": "low"}
    assert body["tool_choice"] == {"type": "auto"}
    assert body["cache_control"] == {"type": "ephemeral"}
    assert all(t["strict"] is True for t in body["tools"])
    assert not {"temperature", "top_p", "top_k"} & set(body), "Sonnet 5.5 lehnt Sampling-Parameter ab"
    assert all("eager_input_streaming" not in t for t in body["tools"])
    assert body["messages"][-1] == {"role": "system", "content": "Leitfaden"}


async def test_eager_tool_streaming_can_be_enabled() -> None:
    rec = Recorder([httpx2.Response(200, headers={"content-type": "text/event-stream"},
                                    content=sse(message_events([{"type": "text", "parts": ["Ok."]}])))])
    _ = [i async for i in first_party(rec, eager_tool_streaming=True).stream_turn(chat_request())]
    assert all(t["eager_input_streaming"] is True for t in rec.body["tools"])


async def test_refusal_is_reported() -> None:
    rec = Recorder([httpx2.Response(200, headers={"content-type": "text/event-stream"}, content=sse(message_events(
        [], stop_reason="refusal", stop_details={"type": "refusal", "category": "general_harms", "explanation": "x"})))])
    items = [i async for i in first_party(rec).stream_turn(chat_request())]
    done = items[-1]
    assert isinstance(done, TurnDone) and done.result.stop_reason == "refusal"
    assert done.result.refusal_category in ("general_harms", "unbekannt")


async def test_api_errors_become_llm_unavailable() -> None:
    rec = Recorder([httpx2.Response(529, json={"type": "error", "error": {"type": "overloaded_error", "message": "busy"}})])
    with pytest.raises(LlmUnavailable):
        _ = [i async for i in first_party(rec).stream_turn(chat_request())]


async def test_complete_json_uses_structured_outputs() -> None:
    payload = {"id": "msg_2", "type": "message", "role": "assistant", "model": "claude-sonnet-5-5",
               "content": [{"type": "text", "text": json.dumps({"flags": []})}], "stop_reason": "end_turn", "stop_sequence": None,
               "usage": {"input_tokens": 100, "output_tokens": 10}}
    rec = Recorder([httpx2.Response(200, json=payload)])
    schema = {"type": "object", "properties": {"flags": {"type": "array", "items": {"type": "string"}}}, "required": ["flags"],
              "additionalProperties": False}
    result = await first_party(rec).complete_json(JsonRequest(model="eu.anthropic.claude-sonnet-5-5", system="S", user="U", schema=schema))
    assert result.data == {"flags": []}
    body = rec.body
    assert body["output_config"]["format"] == {"type": "json_schema", "schema": schema}
    assert body["output_config"]["effort"] == "medium"
    assert body["thinking"] == {"type": "adaptive"}
    assert body["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert "tool_choice" not in body and "temperature" not in body


async def test_complete_json_handles_refusal_and_bad_json() -> None:
    base = {"id": "m", "type": "message", "role": "assistant", "model": "claude-sonnet-5-5", "stop_sequence": None,
            "usage": {"input_tokens": 1, "output_tokens": 1}}
    rec = Recorder([
        httpx2.Response(200, json={**base, "content": [], "stop_reason": "refusal"}),
        httpx2.Response(200, json={**base, "content": [{"type": "text", "text": "kein json"}], "stop_reason": "end_turn"}),
    ])
    model = first_party(rec)
    req = JsonRequest(model="m", system="S", user="U", schema={"type": "object", "properties": {}, "required": [], "additionalProperties": False})
    assert (await model.complete_json(req)).data is None
    assert (await model.complete_json(req)).stop_reason == "invalid_json"


async def test_bedrock_mantle_client_targets_eu_endpoint() -> None:
    rec = Recorder([httpx2.Response(200, headers={"content-type": "text/event-stream"},
                                    content=sse(message_events([{"type": "text", "parts": ["Ok."]}])))])
    client = anthropic.AsyncAnthropicBedrockMantle(
        aws_region="eu-central-1", aws_access_key="AKIATEST", aws_secret_key="secret", max_retries=0,
        http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(rec)),
    )
    model = AnthropicChatModel(client, provider="bedrock")
    _ = [i async for i in model.stream_turn(chat_request())]
    req = rec.requests[0]
    assert "eu-central-1" in str(req.url)
    assert rec.body["model"] == "eu.anthropic.claude-sonnet-5-5"
    assert "authorization" in {k.lower() for k in req.headers}


def test_bedrock_outside_eu_is_refused() -> None:
    with pytest.raises(ValueError):
        AnthropicChatModel.for_bedrock("us-east-1")
