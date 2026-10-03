"""Stimme (TTS) hinter der Schnittstelle ``TtsProvider``."""

from __future__ import annotations

from viola.config import Config
from viola.tts.base import PROVIDERS, ProviderInfo, TtsError, TtsProvider
from viola.tts.providers import (
    CartesiaTts,
    ElevenLabsTts,
    FakeTts,
    GoogleChirpTts,
    PollyTts,
    assert_eu_allowed,
)

DEFAULT_VOICES = {
    "polly": "Vicki",
    "google": "de-DE-Chirp3-HD-Aoede",
    "fake": "Testton",
}


def build_tts(name: str, voice: str, cfg: Config) -> TtsProvider:
    """Anbieter nach Name. In Produktion nur mit EU-Datenweg (siehe assert_eu_allowed)."""
    assert_eu_allowed(name, cfg.env, enterprise_eu=cfg.tts_enterprise_eu)
    v = voice or DEFAULT_VOICES.get(name, "")
    if name == "polly":
        return PollyTts(voice=v, region=cfg.aws_region)
    if name == "google":
        return GoogleChirpTts(voice=v, endpoint=cfg.google_tts_endpoint)
    if name == "cartesia":
        return CartesiaTts(cfg.cartesia_api_key, cfg.cartesia_voice_id or v, base_url=cfg.cartesia_base_url)
    if name == "elevenlabs":
        return ElevenLabsTts(cfg.elevenlabs_api_key, cfg.elevenlabs_voice_id or v, base_url=cfg.elevenlabs_base_url)
    if name == "fake":
        return FakeTts(voice=v)
    raise TtsError(f"Unbekannter Stimmen-Anbieter: {name}")


__all__ = [
    "PROVIDERS",
    "CartesiaTts",
    "ElevenLabsTts",
    "FakeTts",
    "GoogleChirpTts",
    "PollyTts",
    "ProviderInfo",
    "TtsError",
    "TtsProvider",
    "assert_eu_allowed",
    "build_tts",
]
