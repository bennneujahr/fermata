"""Umsetzungen der Stimme: Amazon Polly, Google Chirp 3 HD, Cartesia, ElevenLabs und eine Attrappe.

Polly ist der Platzhalter bis zum Blindtest (Einstellung voice.tts_provider / voice.tts_voice).
Cartesia und ElevenLabs sind lauffähige Grundgerüste, aber ohne Enterprise-Vertrag nicht für den Echtbetrieb
freigegeben (kein EU-Datenweg, PLAN 5.11) – ``assert_eu_allowed`` verhindert das in Produktion.
"""

from __future__ import annotations

import asyncio
import math
import struct
from collections.abc import AsyncIterator
from typing import Any

import httpx

from viola.tts.base import PROVIDERS, TtsError

CHUNK_BYTES = 3200  # 100 ms bei 16 kHz, 16 Bit mono


class FakeTts:
    """Leiser Ton, Länge passend zum Text (ca. 14 Zeichen je Sekunde). Ohne Netz, deterministisch."""

    name = "fake"

    def __init__(
        self, voice: str = "Testton", sample_rate: int = 16000, latency_s: float = 0.0, chars_per_second: float = 14.0
    ) -> None:
        self.voice = voice
        self.sample_rate = sample_rate
        self.latency_s = latency_s
        self.chars_per_second = chars_per_second
        self.calls: list[str] = []

    def billed_characters(self, text: str) -> int:
        return len(text)

    async def synthesize(self, text: str) -> AsyncIterator[bytes]:
        self.calls.append(text)
        if self.latency_s:
            await asyncio.sleep(self.latency_s)
        seconds = max(0.2, len(text) / self.chars_per_second)
        total = int(seconds * self.sample_rate)
        freq = 180.0 + (sum(map(ord, self.voice)) % 120)
        samples = bytearray()
        for i in range(total):
            value = int(800 * math.sin(2 * math.pi * freq * i / self.sample_rate))
            samples += struct.pack("<h", value)
            if len(samples) >= CHUNK_BYTES:
                yield bytes(samples)
                samples.clear()
        if samples:
            yield bytes(samples)


class PollyTts:
    """Amazon Polly, generative Engine, Frankfurt (eu-central-1)."""

    name = "polly"

    def __init__(self, voice: str = "Vicki", region: str = "eu-central-1", sample_rate: int = 16000, client: Any = None) -> None:
        if not region.startswith("eu-"):
            raise TtsError("Polly nur in einer EU-Region")
        self.voice = voice
        self.sample_rate = sample_rate
        if client is None:
            import boto3

            client = boto3.client("polly", region_name=region)
        self._client = client

    def billed_characters(self, text: str) -> int:
        return len(text)

    async def synthesize(self, text: str) -> AsyncIterator[bytes]:
        def call() -> Any:
            return self._client.synthesize_speech(
                Engine="generative",
                LanguageCode="de-DE",
                OutputFormat="pcm",
                SampleRate=str(self.sample_rate),
                Text=text,
                TextType="text",
                VoiceId=self.voice,
            )

        try:
            response = await asyncio.to_thread(call)
        except Exception as err:  # botocore-Fehler sind vielfältig
            raise TtsError(f"Polly: {type(err).__name__}") from err
        body = response["AudioStream"]
        try:
            while True:
                chunk = await asyncio.to_thread(body.read, CHUNK_BYTES)
                if not chunk:
                    break
                yield chunk
        finally:
            body.close()


def _strip_wav_header(data: bytes) -> bytes:
    if data[:4] == b"RIFF" and b"data" in data[:100]:
        return data[data.index(b"data") + 8 :]
    return data


class GoogleChirpTts:
    """Google Cloud Text-to-Speech, Chirp 3 HD, EU-Endpunkt. Braucht das Extra ``google`` (uv sync --extra google)."""

    name = "google"

    def __init__(
        self,
        voice: str = "de-DE-Chirp3-HD-Aoede",
        endpoint: str = "eu-texttospeech.googleapis.com",
        sample_rate: int = 16000,
        client: Any = None,
    ) -> None:
        if not endpoint.startswith("eu-"):
            raise TtsError("Google TTS nur über den EU-Endpunkt")
        self.voice = voice
        self.sample_rate = sample_rate
        if client is None:
            try:
                from google.cloud import texttospeech
            except ImportError as err:
                raise TtsError("Paket google-cloud-texttospeech fehlt: uv sync --extra google") from err
            client = texttospeech.TextToSpeechAsyncClient(client_options={"api_endpoint": endpoint})
        self._client = client

    def billed_characters(self, text: str) -> int:
        return len(text)

    async def synthesize(self, text: str) -> AsyncIterator[bytes]:
        request = {
            "input": {"text": text},
            "voice": {"language_code": "de-DE", "name": self.voice},
            "audio_config": {"audio_encoding": "LINEAR16", "sample_rate_hertz": self.sample_rate},
        }
        try:
            response = await self._client.synthesize_speech(request=request)
        except Exception as err:
            raise TtsError(f"Google TTS: {type(err).__name__}") from err
        pcm = _strip_wav_header(bytes(response.audio_content))
        for i in range(0, len(pcm), CHUNK_BYTES):
            yield pcm[i : i + CHUNK_BYTES]


class CartesiaTts:
    """Cartesia Sonic über HTTP (Grundgerüst). EU-Regionen nur mit Enterprise-Vertrag."""

    name = "cartesia"

    def __init__(
        self,
        api_key: str,
        voice: str,
        base_url: str = "https://api.cartesia.ai",
        model: str = "sonic-3",
        sample_rate: int = 16000,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        if not api_key or not voice:
            raise TtsError("CARTESIA_API_KEY und CARTESIA_VOICE_ID fehlen")
        self.voice = voice
        self.sample_rate = sample_rate
        self._api_key = api_key
        self._url = base_url.rstrip("/") + "/tts/bytes"
        self._model = model
        self._client = client or httpx.AsyncClient(timeout=20.0)

    def billed_characters(self, text: str) -> int:
        return len(text)

    async def synthesize(self, text: str) -> AsyncIterator[bytes]:
        body = {
            "model_id": self._model,
            "transcript": text,
            "voice": {"mode": "id", "id": self.voice},
            "language": "de",
            "output_format": {"container": "raw", "encoding": "pcm_s16le", "sample_rate": self.sample_rate},
        }
        headers = {"X-API-Key": self._api_key, "Cartesia-Version": "2025-04-16", "content-type": "application/json"}
        async with self._client.stream("POST", self._url, json=body, headers=headers) as res:
            if res.status_code >= 400:
                raise TtsError(f"Cartesia: HTTP {res.status_code}")
            async for chunk in res.aiter_bytes(CHUNK_BYTES):
                yield chunk


class ElevenLabsTts:
    """ElevenLabs über HTTP-Streaming (Grundgerüst). EU-Datenhaltung nur mit Enterprise (eigene Basis-URL)."""

    name = "elevenlabs"

    def __init__(
        self,
        api_key: str,
        voice: str,
        base_url: str = "https://api.elevenlabs.io",
        model: str = "eleven_flash_v2_5",
        sample_rate: int = 16000,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        if not api_key or not voice:
            raise TtsError("ELEVENLABS_API_KEY und ELEVENLABS_VOICE_ID fehlen")
        self.voice = voice
        self.sample_rate = sample_rate
        self._api_key = api_key
        self._base = base_url.rstrip("/")
        self._model = model
        self._client = client or httpx.AsyncClient(timeout=20.0)

    def billed_characters(self, text: str) -> int:
        return len(text)

    async def synthesize(self, text: str) -> AsyncIterator[bytes]:
        url = f"{self._base}/v1/text-to-speech/{self.voice}/stream"
        params = {"output_format": f"pcm_{self.sample_rate}"}
        body = {"text": text, "model_id": self._model, "language_code": "de"}
        headers = {"xi-api-key": self._api_key, "content-type": "application/json"}
        async with self._client.stream("POST", url, params=params, json=body, headers=headers) as res:
            if res.status_code >= 400:
                raise TtsError(f"ElevenLabs: HTTP {res.status_code}")
            async for chunk in res.aiter_bytes(CHUNK_BYTES):
                yield chunk


def assert_eu_allowed(name: str, env: str, *, enterprise_eu: bool = False) -> None:
    """In Produktion nur Anbieter mit EU-Datenweg (oder ausdrücklich bestätigtem Enterprise-Vertrag)."""
    info = PROVIDERS.get(name)
    if info is None:
        raise TtsError(f"Unbekannter Stimmen-Anbieter: {name}")
    if env == "production" and name == "fake":
        raise TtsError("Die Attrappe ist in Produktion nicht erlaubt")
    if env == "production" and not info.eu_without_enterprise and not enterprise_eu:
        raise TtsError(f"{info.title}: {info.eu_route}. Ohne Enterprise-Vertrag nicht für den Echtbetrieb (Frage B4).")
