"""Stimmen-Anbieter hinter TtsProvider – alle ohne Netz getestet (Stubber, nachgebildete HTTP-Antworten)."""

from __future__ import annotations

import io
import json
import struct
from typing import Any

import boto3
import httpx
import pytest
from botocore.response import StreamingBody
from botocore.stub import Stubber

from viola.config import Config
from viola.tts import (
    PROVIDERS,
    CartesiaTts,
    ElevenLabsTts,
    FakeTts,
    GoogleChirpTts,
    PollyTts,
    TtsError,
    assert_eu_allowed,
    build_tts,
)


async def collect(provider: Any, text: str) -> bytes:
    return b"".join([c async for c in provider.synthesize(text)])


async def test_fake_tts_produces_pcm_of_plausible_length() -> None:
    tts = FakeTts(chars_per_second=10)
    audio = await collect(tts, "x" * 20)
    assert len(audio) == 2 * 16000 * 2  # 2 Sekunden, 16 Bit, 16 kHz
    assert audio == await collect(FakeTts(chars_per_second=10), "x" * 20), "deterministisch"
    assert max(abs(v) for (v,) in struct.iter_unpack("<h", audio[:2000])) <= 800, "leise"
    assert tts.billed_characters("Hallo") == 5


async def test_polly_generative_vicki_in_frankfurt() -> None:
    client = boto3.client("polly", region_name="eu-central-1", aws_access_key_id="x", aws_secret_access_key="y")
    pcm = b"\x01\x00" * 4000
    with Stubber(client) as stub:
        stub.add_response(
            "synthesize_speech",
            {"AudioStream": StreamingBody(io.BytesIO(pcm), len(pcm)), "ContentType": "audio/pcm", "RequestCharacters": 5},
            {
                "Engine": "generative",
                "LanguageCode": "de-DE",
                "OutputFormat": "pcm",
                "SampleRate": "16000",
                "Text": "Hallo",
                "TextType": "text",
                "VoiceId": "Vicki",
            },
        )
        tts = PollyTts(client=client)
        assert await collect(tts, "Hallo") == pcm
    assert client.meta.region_name == "eu-central-1"


async def test_polly_errors_and_region() -> None:
    client = boto3.client("polly", region_name="eu-central-1", aws_access_key_id="x", aws_secret_access_key="y")
    with Stubber(client) as stub:
        stub.add_client_error("synthesize_speech", "ThrottlingException")
        with pytest.raises(TtsError):
            await collect(PollyTts(client=client), "Hallo")
    with pytest.raises(TtsError):
        PollyTts(region="us-east-1", client=object())


async def test_google_chirp_uses_eu_endpoint_and_strips_wav_header() -> None:
    class FakeGoogle:
        def __init__(self) -> None:
            self.requests: list[dict[str, Any]] = []

        async def synthesize_speech(self, request: dict[str, Any]) -> Any:
            self.requests.append(request)
            wav = b"RIFF\x00\x00\x00\x00WAVEfmt " + b"\x00" * 16 + b"data" + b"\x00\x00\x00\x00" + b"\x02\x00" * 10
            return type("R", (), {"audio_content": wav})()

    fake = FakeGoogle()
    tts = GoogleChirpTts(client=fake)
    assert await collect(tts, "Guten Tag") == b"\x02\x00" * 10
    assert fake.requests[0]["voice"] == {"language_code": "de-DE", "name": "de-DE-Chirp3-HD-Aoede"}
    assert fake.requests[0]["audio_config"]["audio_encoding"] == "LINEAR16"
    with pytest.raises(TtsError):
        GoogleChirpTts(endpoint="texttospeech.googleapis.com", client=fake)


async def test_cartesia_http_contract() -> None:
    seen: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return httpx.Response(200, content=b"\x03\x00" * 50)

    tts = CartesiaTts("key", "voice-1", client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    assert await collect(tts, "Hallo") == b"\x03\x00" * 50
    body = json.loads(seen[0].content)
    assert str(seen[0].url) == "https://api.cartesia.ai/tts/bytes"
    assert seen[0].headers["x-api-key"] == "key"
    assert body["output_format"] == {"container": "raw", "encoding": "pcm_s16le", "sample_rate": 16000}
    assert body["language"] == "de" and body["voice"] == {"mode": "id", "id": "voice-1"}
    failing = CartesiaTts("key", "v", client=httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(401))))
    with pytest.raises(TtsError):
        await collect(failing, "x")
    with pytest.raises(TtsError):
        CartesiaTts("", "")


async def test_elevenlabs_http_contract_with_eu_residency_url() -> None:
    seen: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return httpx.Response(200, content=b"\x04\x00" * 20)

    tts = ElevenLabsTts(
        "key",
        "voice-2",
        base_url="https://api.eu.residency.elevenlabs.io",
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )
    assert await collect(tts, "Hallo") == b"\x04\x00" * 20
    url = seen[0].url
    assert url.host == "api.eu.residency.elevenlabs.io" and url.path == "/v1/text-to-speech/voice-2/stream"
    assert url.params["output_format"] == "pcm_16000"
    assert seen[0].headers["xi-api-key"] == "key"
    assert json.loads(seen[0].content)["language_code"] == "de"


def test_eu_rules_for_production() -> None:
    assert PROVIDERS["polly"].eu_without_enterprise and PROVIDERS["google"].eu_without_enterprise
    assert not PROVIDERS["cartesia"].eu_without_enterprise and not PROVIDERS["elevenlabs"].eu_without_enterprise
    assert_eu_allowed("polly", "production")
    assert_eu_allowed("cartesia", "local")
    with pytest.raises(TtsError, match="Enterprise"):
        assert_eu_allowed("elevenlabs", "production")
    assert_eu_allowed("elevenlabs", "production", enterprise_eu=True)
    with pytest.raises(TtsError):
        assert_eu_allowed("fake", "production")
    with pytest.raises(TtsError):
        assert_eu_allowed("unbekannt", "local")


def test_build_tts_from_config() -> None:
    cfg = Config.from_env(
        {"CARTESIA_API_KEY": "k", "CARTESIA_VOICE_ID": "v", "ELEVENLABS_API_KEY": "k", "ELEVENLABS_VOICE_ID": "v"}
    )
    assert isinstance(build_tts("fake", "", cfg), FakeTts)
    assert isinstance(build_tts("cartesia", "", cfg), CartesiaTts)
    assert isinstance(build_tts("elevenlabs", "", cfg), ElevenLabsTts)
    polly = build_tts("polly", "", cfg)
    assert isinstance(polly, PollyTts) and polly.voice == "Vicki"
    with pytest.raises(TtsError):
        build_tts("google", "", cfg)  # Extra „google“ ist im Test nicht installiert
