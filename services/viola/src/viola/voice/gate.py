"""Stille nicht an die Spracherkennung senden (PLAN 5.8): Sprach-Tor vor Deepgram.

Ein Detektor (Silero-VAD im Betrieb, Energie-Schwelle in Tests) meldet, ob gerade gesprochen wird. Nur dann
gehen Audio-Rahmen an die Spracherkennung – mit kurzem Vorlauf (damit der Wortanfang nicht fehlt) und
Nachlauf (damit das Wortende nicht fehlt). Schließt das Tor, wird die Erkennung abgeschlossen (Finalize).
Gezählt wird nur, was wirklich gesendet wurde (Kosten: STT-Sekunden). Audio wird dabei nur durchgereicht,
nie gespeichert.
"""

from __future__ import annotations

import asyncio
import contextlib
from collections import deque
from collections.abc import AsyncIterable, AsyncIterator, Callable
from typing import Any, Protocol

import numpy as np


class Frame(Protocol):
    @property
    def data(self) -> Any: ...
    @property
    def sample_rate(self) -> int: ...
    @property
    def samples_per_channel(self) -> int: ...


class SpeechDetector(Protocol):
    def push(self, frame: Any) -> None: ...
    def is_speaking(self) -> bool: ...
    async def aclose(self) -> None: ...


class FLUSH:
    """Signal: Tor geschlossen – Erkennung abschließen."""


def frame_seconds(frame: Any) -> float:
    return float(frame.samples_per_channel) / float(frame.sample_rate)


class EnergyDetector:
    """Einfacher Detektor über den Effektivwert (für Tests und als Rückfall ohne Silero)."""

    def __init__(self, threshold: float = 300.0) -> None:
        self.threshold = threshold
        self._speaking = False

    def push(self, frame: Any) -> None:
        samples = np.frombuffer(bytes(frame.data), dtype=np.int16).astype(np.float64)
        rms = float(np.sqrt(np.mean(samples * samples))) if samples.size else 0.0
        self._speaking = rms >= self.threshold

    def is_speaking(self) -> bool:
        return self._speaking

    async def aclose(self) -> None:
        return None


class SileroDetector:
    """Silero-VAD von LiveKit: Ereignisse START/END_OF_SPEECH schalten den Zustand."""

    def __init__(self, vad: Any) -> None:
        from livekit.agents.vad import VADEventType

        self._stream = vad.stream()
        self._speaking = False
        self._start = VADEventType.START_OF_SPEECH
        self._end = VADEventType.END_OF_SPEECH
        self._task = asyncio.create_task(self._run(), name="viola-vad")

    async def _run(self) -> None:
        async for ev in self._stream:
            if ev.type == self._start:
                self._speaking = True
            elif ev.type == self._end:
                self._speaking = False

    def push(self, frame: Any) -> None:
        self._stream.push_frame(frame)

    def is_speaking(self) -> bool:
        return self._speaking

    async def aclose(self) -> None:
        self._task.cancel()
        with contextlib.suppress(asyncio.CancelledError, Exception):
            await self._task
        await self._stream.aclose()


class SpeechGate:
    def __init__(
        self,
        detector: SpeechDetector,
        *,
        preroll_s: float = 0.5,
        hangover_s: float = 0.8,
        on_forward: Callable[[float], None] | None = None,
    ) -> None:
        self.detector = detector
        self.preroll_s = preroll_s
        self.hangover_s = hangover_s
        self.on_forward = on_forward
        self.forwarded_s = 0.0
        self.total_s = 0.0

    def _count(self, frame: Any) -> None:
        d = frame_seconds(frame)
        self.forwarded_s += d
        if self.on_forward is not None:
            self.on_forward(d)

    async def process(self, frames: AsyncIterable[Any]) -> AsyncIterator[Any]:
        """Liefert die zu sendenden Rahmen und ``FLUSH`` beim Schließen des Tors.

        Gerechnet wird in ganzen Millisekunden, damit Vor- und Nachlauf nicht durch Rundungsfehler schwanken.
        """
        preroll: deque[tuple[Any, int]] = deque()
        preroll_ms = 0
        preroll_limit = round(self.preroll_s * 1000)
        hangover_limit = round(self.hangover_s * 1000)
        open_ = False
        hangover_left = 0
        async for frame in frames:
            self.detector.push(frame)
            await asyncio.sleep(0)  # dem Detektor Zeit zum Auswerten geben
            d_ms = round(frame_seconds(frame) * 1000)
            self.total_s += frame_seconds(frame)
            if self.detector.is_speaking():
                if not open_:
                    while preroll:
                        f, _ = preroll.popleft()
                        self._count(f)
                        yield f
                    preroll_ms = 0
                    open_ = True
                hangover_left = hangover_limit
                self._count(frame)
                yield frame
            elif open_ and hangover_left > 0:
                hangover_left -= d_ms
                self._count(frame)
                yield frame
            else:
                if open_:
                    open_ = False
                    yield FLUSH
                preroll.append((frame, d_ms))
                preroll_ms += d_ms
                while preroll and preroll_ms > preroll_limit:
                    preroll_ms -= preroll.popleft()[1]
        if open_:
            yield FLUSH
