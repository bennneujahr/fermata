"""Rückweg in die Datenbank – ausschließlich über die Edge Function ``interview-agent`` (PLAN 2.3 Nr. 4).

``HttpBackend`` ruft die Function mit dem Geheimnis im Header ``x-agent-secret`` auf. ``MemoryBackend`` bildet
dieselben Regeln im Speicher nach (KI-Hinweis vor dem ersten Beitrag, Art.-9-Prüfung beim Speichern) und dient
für Tests und lokale Läufe ohne Datenbank.

Es werden nur Text, Zahlen und Zeitpunkte übertragen. Audio kommt hier nie vor.
"""

from __future__ import annotations

import asyncio
import copy
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol

import httpx

from viola import art9
from viola.domain import AddressForm, Kind, Mode, Tier


class BackendError(RuntimeError):
    def __init__(self, status: int, code: str, message: str = "") -> None:
        super().__init__(f"{status} {code} {message}".strip())
        self.status = status
        self.code = code
        self.message = message


class Backend(Protocol):
    async def context(self, session_id: str) -> dict[str, Any]: ...
    async def start(self, session_id: str) -> dict[str, Any]: ...
    async def mark_ai_notice(self, session_id: str, version: str) -> None: ...
    async def append_turns(self, session_id: str, turns: list[dict[str, Any]]) -> int: ...
    async def save_summary_draft(self, session_id: str, text: str, covered_blocks: list[str] | None) -> None: ...
    async def save_analysis(self, session_id: str, analysis: dict[str, Any]) -> dict[str, Any]: ...
    async def mark_analysis(self, session_id: str, status: str) -> None: ...
    async def flag_safety(
        self, session_id: str, kind: str, severity: str, detector: str, turn_index: int | None
    ) -> str | None: ...
    async def record_costs(self, session_id: str, costs: dict[str, Any]) -> None: ...
    async def switch_mode(self, session_id: str, mode: str) -> None: ...
    async def end(self, session_id: str, reason: str, covered_blocks: list[str] | None) -> dict[str, Any]: ...


def _assert_no_audio(payload: Any) -> None:
    """Schutzregel: Es dürfen nie Binärdaten (z. B. Audio) an die Datenbank gehen."""
    if isinstance(payload, (bytes, bytearray, memoryview)):
        raise TypeError("Binärdaten dürfen nicht gespeichert werden (kein Rohaudio, PLAN 2.2)")
    if isinstance(payload, dict):
        for v in payload.values():
            _assert_no_audio(v)
    elif isinstance(payload, (list, tuple)):
        for v in payload:
            _assert_no_audio(v)


class HttpBackend:
    def __init__(
        self,
        url: str,
        secret: str,
        *,
        client: httpx.AsyncClient | None = None,
        timeout: float = 10.0,
        attempts: int = 3,
        backoff: float = 0.3,
    ) -> None:
        if len(secret) < 32:
            raise ValueError("INTERVIEW_AGENT_SECRET muss mindestens 32 Zeichen haben")
        self._url = url
        self._secret = secret
        self._client = client or httpx.AsyncClient(timeout=timeout)
        self._attempts = max(1, attempts)
        self._backoff = backoff

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _call(self, action: str, session_id: str, **body: Any) -> Any:
        payload = {"action": action, "session_id": session_id, **body}
        _assert_no_audio(payload)
        res: httpx.Response | None = None
        for attempt in range(self._attempts):
            try:
                res = await self._client.post(
                    self._url,
                    json=payload,
                    headers={"x-agent-secret": self._secret, "content-type": "application/json"},
                )
            except httpx.TransportError:
                if attempt == self._attempts - 1:
                    raise BackendError(503, "agent_unreachable") from None
                await asyncio.sleep(self._backoff * (attempt + 1))
                continue
            # Kurze Störungen (5xx) noch einmal versuchen; Fachfehler (4xx) sofort melden.
            if res.status_code < 500 or attempt == self._attempts - 1:
                break
            await asyncio.sleep(self._backoff * (attempt + 1))
        assert res is not None
        data: Any
        try:
            data = res.json()
        except ValueError:
            data = {}
        if res.status_code >= 400:
            raise BackendError(res.status_code, str(data.get("error", "http_error")), str(data.get("message", "")))
        return data

    async def context(self, session_id: str) -> dict[str, Any]:
        return dict(await self._call("context", session_id))

    async def start(self, session_id: str) -> dict[str, Any]:
        return dict(await self._call("start", session_id))

    async def mark_ai_notice(self, session_id: str, version: str) -> None:
        await self._call("ai_notice", session_id, version=version)

    async def append_turns(self, session_id: str, turns: list[dict[str, Any]]) -> int:
        return int((await self._call("append_turns", session_id, turns=turns))["total"])

    async def save_summary_draft(self, session_id: str, text: str, covered_blocks: list[str] | None) -> None:
        await self._call("summary_draft", session_id, text=text, covered_blocks=covered_blocks)

    async def save_analysis(self, session_id: str, analysis: dict[str, Any]) -> dict[str, Any]:
        return dict(await self._call("analysis", session_id, analysis=analysis))

    async def mark_analysis(self, session_id: str, status: str) -> None:
        await self._call("analysis_status", session_id, status=status)

    async def flag_safety(self, session_id: str, kind: str, severity: str, detector: str, turn_index: int | None) -> str | None:
        r = await self._call("safety_flag", session_id, kind=kind, severity=severity, detector=detector, turn_index=turn_index)
        return str(r.get("flag_id")) if r.get("flag_id") else None

    async def record_costs(self, session_id: str, costs: dict[str, Any]) -> None:
        await self._call("costs", session_id, costs=costs)

    async def switch_mode(self, session_id: str, mode: str) -> None:
        await self._call("switch_mode", session_id, mode=mode)

    async def end(self, session_id: str, reason: str, covered_blocks: list[str] | None) -> dict[str, Any]:
        return dict(await self._call("end", session_id, reason=reason, covered_blocks=covered_blocks))


@dataclass
class MemorySession:
    context: dict[str, Any]
    status: str = "requested"
    ai_notice_at: datetime | None = None
    turns: list[dict[str, Any]] = field(default_factory=list)
    summary_draft: str | None = None
    covered_blocks: list[str] = field(default_factory=list)
    analysis: dict[str, Any] | None = None
    analysis_status: str = "none"
    flags: list[dict[str, Any]] = field(default_factory=list)
    costs: list[dict[str, Any]] = field(default_factory=list)
    end_reason: str | None = None
    mode: str = "voice"


class MemoryBackend:
    """Datenbank-Attrappe mit denselben Kernregeln wie die SQL-Funktionen."""

    def __init__(self, *, auto_create: bool = False) -> None:
        self.sessions: dict[str, MemorySession] = {}
        self.calls: list[tuple[str, str]] = []
        # Nur für lokale Läufe: unbekannte Sitzungen entstehen beim ersten Zugriff (Erstgespräch, Text, Sie).
        self.auto_create = auto_create

    def create_session(
        self,
        *,
        kind: Kind = Kind.ERSTGESPRAECH,
        mode: Mode = Mode.VOICE,
        address_form: AddressForm = AddressForm.SIE,
        tier: Tier = Tier.AUFTAKT,
        max_minutes: int = 30,
        settings: dict[str, Any] | None = None,
        profile: dict[str, Any] | None = None,
        previous: dict[str, Any] | None = None,
        display_name: str | None = None,
        session_id: str | None = None,
    ) -> str:
        sid = session_id or str(uuid.uuid4())
        ctx = {
            "session": {
                "id": sid,
                "kind": kind.value,
                "mode": mode.value,
                "status": "requested",
                "address_form": address_form.value,
                "tier_depth": tier.value,
                "max_minutes": max_minutes,
                "covered_blocks": [],
            },
            "person": {"display_name": display_name},
            "profile": profile,
            "previous": previous,
            "evening": None,
            "turns": [],
            "settings": settings or {},
        }
        self.sessions[sid] = MemorySession(context=ctx, mode=mode.value)
        return sid

    def _get(self, sid: str) -> MemorySession:
        if sid not in self.sessions:
            if not self.auto_create:
                raise BackendError(404, "session_not_found")
            self.create_session(session_id=sid, mode=Mode.TEXT)
        return self.sessions[sid]

    async def context(self, session_id: str) -> dict[str, Any]:
        self.calls.append(("context", session_id))
        s = self._get(session_id)
        ctx = copy.deepcopy(s.context)
        ctx["session"]["status"] = s.status
        ctx["session"]["mode"] = s.mode
        ctx["turns"] = copy.deepcopy(s.turns) if s.status == "active" else []
        return ctx

    async def start(self, session_id: str) -> dict[str, Any]:
        self.calls.append(("start", session_id))
        s = self._get(session_id)
        if s.status == "active":
            return {"status": "active", "resumed": True}
        if s.status != "requested":
            raise BackendError(409, "session_not_startable")
        s.status = "active"
        return {"status": "active", "resumed": False}

    async def mark_ai_notice(self, session_id: str, version: str) -> None:
        self.calls.append(("ai_notice", session_id))
        s = self._get(session_id)
        if s.status != "active":
            raise BackendError(409, "session_not_active")
        s.ai_notice_at = s.ai_notice_at or datetime.now(UTC)

    async def append_turns(self, session_id: str, turns: list[dict[str, Any]]) -> int:
        self.calls.append(("append_turns", session_id))
        _assert_no_audio(turns)
        s = self._get(session_id)
        if s.status != "active":
            raise BackendError(409, "session_not_active")
        if s.ai_notice_at is None:
            raise BackendError(409, "ai_notice_missing")
        for t in turns:
            if t.get("role") not in ("viola", "person") or not isinstance(t.get("text"), str) or not t["text"]:
                raise BackendError(422, "invalid_turns")
        s.turns.extend(copy.deepcopy(turns))
        return len(s.turns)

    async def save_summary_draft(self, session_id: str, text: str, covered_blocks: list[str] | None) -> None:
        self.calls.append(("summary_draft", session_id))
        s = self._get(session_id)
        if s.end_reason in ("minderjaehrig", "krise", "missbrauch"):
            raise BackendError(409, "session_not_eligible")
        cats = art9.categories(text)
        if cats:
            raise BackendError(422, "art9_content", ",".join(sorted(cats)))
        s.summary_draft = text
        if covered_blocks is not None:
            s.covered_blocks = list(covered_blocks)

    async def save_analysis(self, session_id: str, analysis: dict[str, Any]) -> dict[str, Any]:
        self.calls.append(("analysis", session_id))
        _assert_no_audio(analysis)
        s = self._get(session_id)
        if s.end_reason in ("minderjaehrig", "krise", "missbrauch"):
            raise BackendError(409, "session_not_eligible")
        _, cats = art9.clean_strings(analysis)
        if cats:
            raise BackendError(422, "art9_content", ",".join(sorted(cats)))
        s.analysis = copy.deepcopy(analysis)
        s.analysis_status = "saved"
        return {"wants": len(analysis.get("wants", [])), "dealbreakers": len(analysis.get("dealbreakers", []))}

    async def mark_analysis(self, session_id: str, status: str) -> None:
        self.calls.append(("analysis_status", session_id))
        self._get(session_id).analysis_status = status

    async def flag_safety(self, session_id: str, kind: str, severity: str, detector: str, turn_index: int | None) -> str | None:
        self.calls.append(("safety_flag", session_id))
        s = self._get(session_id)
        order = ["niedrig", "mittel", "hoch", "akut"]
        for f in s.flags:
            if f["kind"] == kind:
                if order.index(severity) > order.index(f["severity"]):
                    f["severity"] = severity
                f["detectors"] = sorted(set(f["detectors"]) | {detector})
                return str(f["id"])
        flag = {"id": str(uuid.uuid4()), "kind": kind, "severity": severity, "detectors": [detector], "turn_index": turn_index}
        s.flags.append(flag)
        return str(flag["id"])

    async def record_costs(self, session_id: str, costs: dict[str, Any]) -> None:
        self.calls.append(("costs", session_id))
        _assert_no_audio(costs)
        self._get(session_id).costs.append(copy.deepcopy(costs))

    async def switch_mode(self, session_id: str, mode: str) -> None:
        self.calls.append(("switch_mode", session_id))
        s = self._get(session_id)
        if s.status != "active":
            raise BackendError(409, "session_not_active")
        s.mode = mode

    async def end(self, session_id: str, reason: str, covered_blocks: list[str] | None) -> dict[str, Any]:
        self.calls.append(("end", session_id))
        s = self._get(session_id)
        if s.status in ("completed", "aborted", "failed"):
            return {"status": s.status, "end_reason": s.end_reason, "already_ended": True}
        s.end_reason = reason
        if reason in ("fertig", "person_beendet", "zeitlimit"):
            s.status = "completed"
        else:
            s.status = "failed" if reason == "technik" else "aborted"
        if covered_blocks is not None:
            s.covered_blocks = list(covered_blocks)
        return {"status": s.status, "end_reason": reason, "already_ended": False}
