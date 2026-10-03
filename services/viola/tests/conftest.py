from __future__ import annotations

from typing import Any

import pytest

from viola.backend import MemoryBackend
from viola.context import SessionContext
from viola.domain import AddressForm, Kind, Mode, Tier


class FakeClock:
    """Steuerbare Uhr für Zeitlimits und Antwortzeiten."""

    def __init__(self, start: float = 1000.0) -> None:
        self.t = start

    def __call__(self) -> float:
        return self.t

    def advance(self, seconds: float) -> None:
        self.t += seconds


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def backend() -> MemoryBackend:
    return MemoryBackend()


async def make_context(
    backend: MemoryBackend,
    *,
    kind: Kind = Kind.ERSTGESPRAECH,
    mode: Mode = Mode.TEXT,
    form: AddressForm = AddressForm.SIE,
    tier: Tier = Tier.AUFTAKT,
    max_minutes: int = 30,
    settings: dict[str, Any] | None = None,
    profile: dict[str, Any] | None = None,
    previous: dict[str, Any] | None = None,
    display_name: str | None = None,
) -> SessionContext:
    sid = backend.create_session(
        kind=kind, mode=mode, address_form=form, tier=tier, max_minutes=max_minutes,
        settings=settings, profile=profile, previous=previous, display_name=display_name,
    )
    return SessionContext.from_json(await backend.context(sid))
