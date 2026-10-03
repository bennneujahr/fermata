"""Schnittstelle für die Stimme (Text → Audio), unabhängig vom Anbieter (PLAN 5.11, Frage B4).

Jeder Anbieter liefert rohes PCM (16 Bit, mono) in Stücken, sobald es da ist. Audio wird nur durchgereicht
(an LiveKit bzw. an den Blindtest) und nie gespeichert.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class ProviderInfo:
    name: str
    title: str
    eu_route: str
    eu_without_enterprise: bool
    note: str


PROVIDERS: dict[str, ProviderInfo] = {
    "polly": ProviderInfo(
        "polly",
        "Amazon Polly Generative",
        "AWS eu-central-1 (Frankfurt), gleicher Anbieter wie Bedrock",
        True,
        "Generative Stimme „Vicki“ (de-DE); Streaming laut AWS in Frankfurt verfügbar.",
    ),
    "google": ProviderInfo(
        "google",
        "Google Chirp 3 HD",
        "EU-Endpunkt eu-texttospeech.googleapis.com",
        True,
        "Eigener Google-Cloud-Vertrag nötig; Stimmen de-DE-Chirp3-HD-*.",
    ),
    "cartesia": ProviderInfo(
        "cartesia",
        "Cartesia Sonic",
        "EU-Regionen nur für Enterprise-Kunden, sonst Drittland (USA)",
        False,
        "Ohne Enterprise-Vertrag nicht für Echtbetrieb; Teilnahme am Blindtest nur nach Entscheidung B4.",
    ),
    "elevenlabs": ProviderInfo(
        "elevenlabs",
        "ElevenLabs",
        "EU-Datenhaltung nur für Enterprise-Kunden (api.eu.residency.elevenlabs.io), sonst Drittland",
        False,
        "„Zero Retention Mode“ laut Anbieter nur in bestimmten Tarifen; ohne Enterprise nicht für Echtbetrieb.",
    ),
    "fake": ProviderInfo(
        "fake", "Attrappe", "lokal, kein Netz", True, "Erzeugt einen leisen Ton passender Länge (Tests, Blindtest offline)."
    ),
}


class TtsProvider(Protocol):
    name: str
    voice: str
    sample_rate: int

    def synthesize(self, text: str) -> AsyncIterator[bytes]:
        """PCM 16 Bit little-endian, mono, ``sample_rate`` Hz, in Stücken."""
        ...

    def billed_characters(self, text: str) -> int: ...


class TtsError(RuntimeError):
    pass
