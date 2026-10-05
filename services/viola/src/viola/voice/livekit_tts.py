"""Brücke von ``TtsProvider`` zu LiveKit (``tts.TTS``). Audio wird nur durchgereicht, nicht gespeichert."""

from __future__ import annotations

import uuid
from collections.abc import Callable

from livekit.agents import APIConnectOptions, tts
from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS

from viola.tts.base import TtsProvider


class ProviderTTS(tts.TTS):
    """Nicht-streamende TTS: LiveKit zerlegt Violas Antwort in Sätze und ruft je Satz ``synthesize`` auf."""

    def __init__(
        self,
        provider: TtsProvider,
        *,
        on_characters: Callable[[int], None] | None = None,
        on_first_audio: Callable[[], None] | None = None,
    ) -> None:
        super().__init__(capabilities=tts.TTSCapabilities(streaming=False), sample_rate=provider.sample_rate, num_channels=1)
        self.voice_provider = provider
        self.on_characters = on_characters
        self.on_first_audio = on_first_audio

    @property
    def model(self) -> str:
        return self.voice_provider.voice

    @property
    def provider(self) -> str:
        return self.voice_provider.name

    def synthesize(self, text: str, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS) -> tts.ChunkedStream:
        return _ProviderStream(tts=self, input_text=text, conn_options=conn_options)


class _ProviderStream(tts.ChunkedStream):
    def __init__(self, *, tts: ProviderTTS, input_text: str, conn_options: APIConnectOptions) -> None:
        super().__init__(tts=tts, input_text=input_text, conn_options=conn_options)
        self._owner = tts

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        owner = self._owner
        output_emitter.initialize(
            request_id=str(uuid.uuid4()),
            sample_rate=owner.voice_provider.sample_rate,
            num_channels=1,
            mime_type="audio/pcm",
        )
        if owner.on_characters is not None:
            owner.on_characters(owner.voice_provider.billed_characters(self._input_text))
        first = True
        async for chunk in owner.voice_provider.synthesize(self._input_text):
            if first and owner.on_first_audio is not None:
                owner.on_first_audio()
            first = False
            output_emitter.push(chunk)
        output_emitter.flush()
