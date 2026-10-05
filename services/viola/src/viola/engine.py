"""Gesprächskern von Viola – unabhängig von Stimme oder Text, von LiveKit und vom Modellanbieter.

Ein ``Conversation``-Objekt führt genau ein Gespräch (eine Sitzung):

1. ``open()`` startet die Sitzung und liefert die feste Begrüßung mit KI-Hinweis (Art. 50 AI Act).
2. ``greeting_delivered()`` vermerkt den KI-Hinweis; erst danach werden Beiträge gespeichert.
3. ``respond(text)`` liefert Violas Antwort Satz für Satz (für die Stimme: sofort sprechbar).
4. ``finish()`` läuft nach dem Ende: Auswertung, Art.-9-Filter, Sicherheits-Agent, Kostenprotokoll.

Der Verlauf an das Modell wird nur angehängt, nie verändert (preserved thinking, Prompt-Caching).
Hinweise der Steuerung (Themenblock, Zeit, Sicherheit) gehen als system-Nachricht oder gekennzeichneter Text mit.
"""

from __future__ import annotations

import asyncio
import contextlib
import functools
import logging
import re
import time
from collections.abc import AsyncGenerator, AsyncIterator, Callable
from dataclasses import dataclass, field
from typing import Any

from viola import art9, prompts
from viola.analysis import AnalysisAgent, Art9Guard
from viola.backend import Backend, BackendError
from viola.context import SessionContext
from viola.domain import (
    BLOCK_TITLES,
    SAFETY_END_REASONS,
    Block,
    EndReason,
    Kind,
    Mode,
    Phase,
    SafetyKind,
    Severity,
    Turn,
)
from viola.llm.base import ChatModel, ChatRequest, LlmUnavailable, TextDelta, TurnResult
from viola.metrics import CostMeter, LatencyTracker, cost_record
from viola.safety import SafetyAgent, SafetyDetector
from viola.state import ConversationState, Limits, Notice
from viola.text_stream import BrevityGuard, SentenceSplitter
from viola.tools import ToolInputError, tools_for, validate

log = logging.getLogger("viola.engine")

MAX_TOOL_STEPS = 3
MAX_LLM_FAILURES = 2


@dataclass(frozen=True, slots=True)
class EngineEvent:
    """Ereignis für die Oberfläche (Text-API) bzw. den Daten-Kanal von LiveKit."""

    type: str
    data: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class EngineOptions:
    notice_style: str = "system_message"
    max_tokens: int = 2048
    model_override: str = ""
    analysis_model_override: str = ""
    analysis_max_tokens: int = 16000
    record_latency: bool = True


class _Writer:
    """Schreibt Beiträge und Hinweise geordnet im Hintergrund, damit die Antwort nicht wartet."""

    def __init__(self) -> None:
        self._queue: asyncio.Queue[Callable[[], Any] | None] = asyncio.Queue()
        self._task: asyncio.Task[None] | None = None
        self.errors: list[str] = []

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run(), name="viola-writer")

    async def _run(self) -> None:
        while True:
            job = await self._queue.get()
            try:
                if job is None:
                    return
                await job()
            except BackendError as err:
                self.errors.append(err.code)
                log.warning("Schreiben fehlgeschlagen: %s", err.code)
            except Exception as err:
                self.errors.append(type(err).__name__)
                log.exception("Schreiben fehlgeschlagen")
            finally:
                self._queue.task_done()

    def put(self, job: Callable[[], Any]) -> None:
        self.start()
        self._queue.put_nowait(job)

    async def flush(self) -> None:
        if self._task is not None:
            await self._queue.join()

    async def close(self) -> None:
        if self._task is not None:
            await self.flush()
            self._queue.put_nowait(None)
            with contextlib.suppress(Exception):
                await self._task
            self._task = None


class Conversation:
    def __init__(
        self,
        ctx: SessionContext,
        model: ChatModel,
        backend: Backend,
        *,
        options: EngineOptions | None = None,
        clock: Callable[[], float] = time.monotonic,
        detector: SafetyDetector | None = None,
    ) -> None:
        self.ctx = ctx
        self.model = model
        self.backend = backend
        self.options = options or EngineOptions()
        self.form = ctx.address_form
        self.settings = ctx.settings
        self.mode = ctx.mode
        self._clock = clock
        self.detector = detector or SafetyDetector()
        covered_before = ctx.previous.covered_blocks if ctx.previous else ctx.covered_blocks
        self.state = ConversationState(
            ctx.kind,
            self.settings.tier_depth,
            Limits(ctx.max_minutes, self.settings.wrapup_minutes, self.settings.grace_minutes),
            covered_before=covered_before,
            clock=clock,
        )
        self.meter = CostMeter()
        self.latency = LatencyTracker()
        # Wie das gespeicherte Transkript: bei Wiederaufnahme die bisherigen Beiträge, dann die Begrüßung usw.
        # (turn_index in Sicherheits-Hinweisen zeigt so auf denselben Eintrag wie in app.interview_transcripts).
        self.turns: list[Turn] = list(ctx.turns)
        self.notes: list[dict[str, Any]] = []
        self.proposed_summary: str | None = None
        self.events: list[EngineEvent] = []
        self.messages: list[dict[str, Any]] = []
        self.system: list[dict[str, Any]] = []
        self.ended = False
        self.end_reason: EndReason | None = None
        self.harassment_count = 0
        self.silence_count = 0
        self.llm_failures = 0
        self._pending_notices: list[Notice] = []
        self._pending_tool_results: list[dict[str, Any]] = []
        self._lock = asyncio.Lock()
        self._writer = _Writer()
        self._opened = False
        self._greeted = False
        self._finished = False
        self._flagged: set[tuple[str, str]] = set()
        self._started_wall: float | None = None

    # ------------------------------------------------------------------ Hilfen
    @property
    def session_id(self) -> str:
        return self.ctx.session_id

    @property
    def opened(self) -> bool:
        return self._opened

    @property
    def model_id(self) -> str:
        return self.options.model_override or self.settings.llm_model_id

    def _sentence(self, key: str, **values: str) -> str:
        defaults = {"telefonseelsorge": self._crisis_numbers(), "notruf": str(self.settings.crisis_lines.get("notruf", "112"))}
        return prompts.sentence(key, self.form, **{**defaults, **values})

    def _crisis_numbers(self) -> str:
        lines = self.settings.crisis_lines.get("telefonseelsorge") or []
        return " oder ".join(str(x) for x in (lines if isinstance(lines, list) else [lines]))

    def _render_notice(self, n: Notice) -> str:
        values = dict(n.values)
        if n.key in ("block_start", "block_wechsel"):
            for k in ("block", "alt", "neu"):
                if k in values:
                    values[k] = BLOCK_TITLES[Block(values[k])]
        if n.key == "wrapup" and values.get("offen") not in (None, "keine"):
            values["offen"] = ", ".join(BLOCK_TITLES[Block(b.strip())] for b in values["offen"].split(","))
        values.setdefault("telefonseelsorge", self._crisis_numbers())
        values.setdefault("notruf", str(self.settings.crisis_lines.get("notruf", "112")))
        return prompts.notice(n.key, self.form, **values)

    async def flush(self) -> None:
        """Wartet, bis alle Beiträge und Hinweise gespeichert sind."""
        await self._writer.flush()

    def take_events(self) -> list[EngineEvent]:
        out, self.events = self.events, []
        return out

    def elapsed_minutes(self) -> float:
        if self._started_wall is None:
            return 0.0
        return max(0.0, (self._clock() - self._started_wall) / 60.0)

    # ------------------------------------------------------------------ Beginn
    def _context_message(self) -> str:
        c = self.ctx
        parts = [
            self._render_notice(
                Notice("kontext_kopf", {"art": c.kind.value, "stufe": c.tier.value, "minuten": str(c.max_minutes)})
            )
        ]
        if c.display_name:
            parts.append(self._render_notice(Notice("kontext_name", {"name": c.display_name})))
        if c.profile and c.profile.get("summary_text") and c.kind is not Kind.ERSTGESPRAECH:
            parts.append(self._render_notice(Notice("kontext_profil", {"profil": str(c.profile["summary_text"])})))
        if c.previous:
            blocks = ", ".join(BLOCK_TITLES[b] for b in c.previous.covered_blocks) or "noch nichts"
            parts.append(
                self._render_notice(
                    Notice("kontext_fortsetzung", {"zusammenfassung": c.previous.summary_draft or "keine", "bloecke": blocks})
                )
            )
        if c.evening:
            parts.append(
                self._render_notice(
                    Notice(
                        "kontext_abend",
                        {
                            "datum": str(c.evening.get("starts_at") or "unbekannt"),
                            "lokal": str(c.evening.get("venue_name") or "unbekannt"),
                        },
                    )
                )
            )
        if c.turns:
            history = "\n".join(f"{'Viola' if t.role == 'viola' else 'Person'}: {t.text}" for t in c.turns)
            parts.append(f"Bisheriger Verlauf dieser Sitzung vor einer Unterbrechung:\n{history}")
        return "\n\n".join(parts)

    def greeting_text(self) -> str:
        c = self.ctx
        name = f", {c.display_name}" if c.display_name else ""
        days = self.settings.transcript_retention_days
        keep = f"{days} Tage" if days != 1 else "einen Tag"
        gruss = self._sentence("gruss", gruss_name=name)
        if c.turns:
            return f"{gruss} {self._sentence('zweck_fortsetzung')}"
        data_key = "datenhinweis_voice" if self.mode is Mode.VOICE else "datenhinweis_text"
        purpose_key = "zweck_fortsetzung" if c.previous else f"zweck_{c.kind.value}"
        return f"{gruss} {self._sentence(data_key, aufbewahrung=keep)} {self._sentence(purpose_key)}"

    async def open(self) -> str:
        """Startet die Sitzung und liefert die Begrüßung. Sie beginnt immer mit dem KI-Hinweis."""
        if self._opened:
            raise RuntimeError("Gespräch ist bereits geöffnet")
        self._opened = True
        await self.backend.start(self.session_id)
        self.system = [
            {
                "type": "text",
                "text": prompts.system_prompt(self.ctx.kind, self.ctx.tier, self.form, self.settings.crisis_lines),
                "cache_control": {"type": "ephemeral"},
            }
        ]
        greeting = self.greeting_text()
        self.messages = [
            {"role": "user", "content": [{"type": "text", "text": self._context_message()}]},
            {"role": "assistant", "content": [{"type": "text", "text": greeting}]},
        ]
        self.state.begin()
        self._started_wall = self._clock()
        self._writer.start()
        return greeting

    async def greeting_delivered(self) -> None:
        """Die Begrüßung wurde gesprochen bzw. angezeigt: KI-Hinweis vermerken, dann Beiträge speichern."""
        if self._greeted:
            return
        self._greeted = True
        await self.backend.mark_ai_notice(self.session_id, self.settings.ai_notice_version)
        greeting = self.messages[1]["content"][0]["text"]
        self.turns.append(Turn("viola", greeting, mode=self.mode))
        self._persist(self.turns[-1], verbatim=True)
        if self.state.phase is Phase.BEGRUESSUNG:
            self._pending_notices.extend(self.state.greeting_done())

    # ------------------------------------------------------------------ Speichern
    def _persist(self, turn: Turn, *, verbatim: bool = False) -> None:
        text = turn.text
        if self.settings.redact_art9_in_transcripts and not verbatim:
            text = art9.redact_sentences(text).text or art9.REDACTED
        payload = {**turn.to_json(), "text": text[:4000]}
        sid = self.session_id
        self._writer.put(lambda: self.backend.append_turns(sid, [payload]))

    def _queue_flag(self, kind: SafetyKind, severity: Severity, detector: str, turn_index: int | None) -> None:
        key = (kind.value, detector)
        if key in self._flagged and severity.rank < Severity.AKUT.rank:
            return
        self._flagged.add(key)
        sid = self.session_id
        self._writer.put(lambda: self.backend.flag_safety(sid, kind.value, severity.value, detector, turn_index))

    # ------------------------------------------------------------------ Antworten
    async def respond(self, person_text: str) -> AsyncIterator[str]:
        """Antwort auf einen Beitrag der Person, Satz für Satz."""
        async with self._lock:
            inner = self._respond(person_text)
            try:
                async for sentence in inner:
                    yield sentence
            finally:
                # Bei Unterbrechung sofort aufräumen (nicht erst bei der Speicherbereinigung).
                await inner.aclose()

    async def _respond(self, person_text: str) -> AsyncGenerator[str, None]:
        if self.ended:
            return
        if not self._greeted:
            await self.greeting_delivered()
        text = " ".join(person_text.split())[:4000]
        if not text:
            return
        started = self._clock()
        self.silence_count = 0

        if self.state.time_status().force_end:
            closing = self._sentence("zeitlimit_ende")
            self.turns += [Turn("person", text, mode=self.mode), Turn("viola", closing, mode=self.mode)]
            self._persist(self.turns[-2])
            self._persist(self.turns[-1])
            yield closing
            await self._end(EndReason.ZEITLIMIT)
            return

        person_index = len(self.turns)
        self.turns.append(Turn("person", text, mode=self.mode))
        notices = list(self._pending_notices)
        self._pending_notices.clear()

        # Sicherheit zuerst (Regeln, sofort)
        hits = self.detector.scan(text)
        crisis_severity: Severity | None = None
        forced_end: EndReason | None = None
        for hit in hits:
            self._queue_flag(hit.kind, hit.severity, "regel", person_index)
            if hit.kind is SafetyKind.KRISE:
                crisis_severity = hit.severity
                notices.append(Notice("sicherheit_krise"))
                self.events.append(EngineEvent("crisis_resources", {"lines": dict(self.settings.crisis_lines)}))
            elif hit.kind is SafetyKind.MINDERJAEHRIG:
                notices.append(Notice("sicherheit_minderjaehrig"))
            elif hit.kind is SafetyKind.GEWALT:
                notices.append(Notice("sicherheit_gewalt"))
            elif hit.kind is SafetyKind.BELAESTIGUNG:
                self.harassment_count += 1
                if self.harassment_count >= 2:
                    notices.append(Notice("sicherheit_belaestigung_2"))
                    forced_end = EndReason.MISSBRAUCH
                else:
                    notices.append(Notice("sicherheit_belaestigung_1"))
        if art9.contains_art9(text):
            notices.append(Notice("art9_gehoert"))

        # Leitfaden und Zeit
        time_up_before = self.state.time_up_sent
        if self.state.phase in (Phase.THEMEN, Phase.ZUSAMMENFASSUNG, Phase.ABSCHLUSS):
            notices.extend(self.state.on_person_turn())
        time_up_now = self.state.time_up_sent and not time_up_before

        self._persist(self.turns[-1], verbatim=bool(hits))

        content: list[dict[str, Any]] = [*self._pending_tool_results, {"type": "text", "text": text}]
        self._pending_tool_results = []
        rendered = [self._render_notice(n) for n in notices]
        if rendered and self.options.notice_style == "user_text":
            content.append({"type": "text", "text": '<hinweis von="fermata">' + " ".join(rendered) + "</hinweis>"})
        self.messages.append({"role": "user", "content": content})
        if rendered and self.options.notice_style == "system_message":
            self.messages.append({"role": "system", "content": "\n".join(rendered)})

        guard = BrevityGuard(self.settings.max_sentences)
        spoken: list[str] = []
        latency_noted = False
        completed = False
        end_requested: EndReason | None = None

        def emit(sentence: str) -> str:
            nonlocal latency_noted
            if not latency_noted:
                if self.options.record_latency:
                    self.latency.add((self._clock() - started) * 1000)
                latency_noted = True
            spoken.append(sentence)
            return sentence

        try:
            try:
                for step in range(MAX_TOOL_STEPS):
                    splitter = SentenceSplitter()
                    result: TurnResult | None = None
                    async for item in self.model.stream_turn(self._request()):
                        if isinstance(item, TextDelta):
                            for s in splitter.push(item.text):
                                for out in guard.push(s):
                                    yield emit(out)
                        else:
                            result = item.result
                    for s in splitter.flush():
                        for out in guard.push(s):
                            yield emit(out)
                    if result is None:
                        raise LlmUnavailable("Keine Antwort vom Modell")
                    self.llm_failures = 0
                    if result.stop_reason == "refusal" and not spoken:
                        yield emit(self._sentence("ablehnung"))
                    # Eine leere Antwort wäre im Verlauf ungültig; dann steht dort, was gesagt wurde.
                    content = result.content or [{"type": "text", "text": " ".join(spoken) or "…"}]
                    self.messages.append({"role": "assistant", "content": content})
                    self.meter.conversation.add(result.usage)
                    self.latency.add_ttft(result.ttft_ms)
                    if result.stop_reason == "refusal":
                        self.meter.refusals += 1
                        log.info("Modell hat abgelehnt (Kategorie %s)", result.refusal_category)
                        break
                    if not result.tool_uses:
                        break
                    tool_results, terminal, reason = await self._run_tools(result, person_index)
                    if reason is not None:
                        end_requested = reason
                    said = result.text.strip()
                    continue_now = not terminal and (not said or not said.endswith("?"))
                    if terminal or not continue_now or step == MAX_TOOL_STEPS - 1:
                        if reason is None:
                            # Ergebnisse gehen mit dem nächsten Beitrag der Person mit (spart eine Anfrage).
                            self._pending_tool_results = tool_results
                        break
                    self.messages.append({"role": "user", "content": tool_results})
            except LlmUnavailable as err:
                self.llm_failures += 1
                log.warning("Sprachmodell nicht verfügbar: %s", err)
                if self.llm_failures >= MAX_LLM_FAILURES:
                    yield emit(self._sentence("technik_ende"))
                    forced_end = EndReason.TECHNIK
                else:
                    yield emit(self._sentence("technik_fehler"))
                self._close_open_turn(spoken)

            for out in guard.finish():
                yield emit(out)
            self.meter.brevity_cuts += guard.cut

            # Feste Sicherheitszusagen, unabhängig vom Modell
            if crisis_severity is not None and crisis_severity.rank >= Severity.HOCH.rank:
                numbers = [re.sub(r"\D", "", str(n)) for n in (self.settings.crisis_lines.get("telefonseelsorge") or [])]
                said_digits = re.sub(r"\D", "", " ".join(spoken))
                if not any(n and n in said_digits for n in numbers):
                    yield emit(self._sentence("krise_hilfe"))
                if crisis_severity is Severity.AKUT and end_requested is None:
                    end_requested = EndReason.KRISE
            if forced_end is not None and end_requested is None:
                if forced_end is EndReason.MISSBRAUCH:
                    yield emit(self._sentence("missbrauch_ende"))
                end_requested = forced_end
            if time_up_now and end_requested is None:
                yield emit(self._sentence("zeitlimit_ende"))
                end_requested = EndReason.ZEITLIMIT
            if not spoken and end_requested is None:
                yield emit(self._sentence("weiter"))
            completed = True
        finally:
            if not completed:
                # Unterbrochen (z. B. die Person redet dazwischen): Verlauf gültig halten, nur anhängen.
                self._close_open_turn(spoken)
            viola_text = " ".join(spoken)
            if viola_text:
                self.turns.append(Turn("viola", viola_text, mode=self.mode))
                self._persist(self.turns[-1], verbatim=crisis_severity is not None)
            self.meter.turns += 1
        if end_requested is not None:
            await self._end(end_requested)

    def _close_open_turn(self, spoken: list[str]) -> None:
        """Hält den Verlauf für die nächste Anfrage gültig, ohne Früheres zu ändern.

        - Endet der Verlauf mit Werkzeugaufrufen ohne Ergebnis, gehen Ergebnisse mit dem nächsten Beitrag mit.
        - Endet er mit einer Nachricht der Person oder der Steuerung, folgt eine Antwort mit dem Gesagten.
        """
        last = self.messages[-1]
        if last["role"] == "assistant":
            pending = {r["tool_use_id"] for r in self._pending_tool_results}
            open_ids = [
                b["id"] for b in last["content"] if isinstance(b, dict) and b.get("type") == "tool_use" and b["id"] not in pending
            ]
            self._pending_tool_results.extend(
                {"type": "tool_result", "tool_use_id": i, "is_error": True, "content": "Unterbrochen."} for i in open_ids
            )
        else:
            self.messages.append({"role": "assistant", "content": [{"type": "text", "text": " ".join(spoken) or "…"}]})

    def _request(self) -> ChatRequest:
        thinking = "between_tools" if self.settings.llm_thinking == "between_tools" else "adaptive"
        return ChatRequest(
            model=self.model_id,
            system=self.system,
            messages=self.messages,
            tools=tools_for(self.mode is Mode.VOICE),
            max_tokens=self.options.max_tokens,
            effort=self.settings.llm_effort,
            thinking=thinking,  # type: ignore[arg-type]
        )

    def _tool_result(self, tool_use_id: str, key: str, *, error: bool = False, **values: str) -> dict[str, Any]:
        block: dict[str, Any] = {
            "type": "tool_result",
            "tool_use_id": tool_use_id,
            "content": self._render_notice(Notice(key, values)),
        }
        if error:
            block["is_error"] = True
        return block

    async def _run_tools(self, result: TurnResult, person_index: int) -> tuple[list[dict[str, Any]], bool, EndReason | None]:
        results: list[dict[str, Any]] = []
        terminal = False
        end_reason: EndReason | None = None
        for use in result.tool_uses:
            try:
                call = validate(use.name, use.input)
            except ToolInputError as err:
                results.append(self._tool_result(use.id, "tool_fehler", error=True, fehler=str(err)))
                continue
            if call.name == "note_profile_fact":
                if art9.contains_art9(call.args["fact"]):
                    msg = self._render_notice(Notice("tool_art9_abgelehnt"))
                else:
                    self.notes.append(
                        {"category": call.args["category"], "fact": call.args["fact"], "importance": call.args["importance"]}
                    )
                    self.state.on_fact()
                    msg = self._render_notice(Notice("tool_notiert"))
                results.append({"type": "tool_result", "tool_use_id": use.id, "content": msg})
            elif call.name == "propose_summary":
                cleaned = art9.drop_sentences(call.args["summary"])
                if len(cleaned.text) < 20:
                    results.append(
                        self._tool_result(
                            use.id, "tool_fehler", error=True, fehler="Zusammenfassung zu kurz oder nur geschützte Angaben"
                        )
                    )
                    continue
                self.proposed_summary = cleaned.text
                if not self.state.ended:
                    self.state.on_summary_proposed(bool(call.args["is_partial"]))
                partial = bool(call.args["is_partial"])
                self.events.append(EngineEvent("summary_proposed", {"text": cleaned.text, "partial": partial}))
                msg = self._render_notice(Notice("tool_zusammenfassung"))
                if cleaned.changed:
                    msg += " " + self._render_notice(Notice("tool_zusammenfassung_bereinigt"))
                results.append({"type": "tool_result", "tool_use_id": use.id, "content": msg})
            elif call.name == "flag_safety":
                self._queue_flag(SafetyKind(call.args["kind"]), Severity(call.args["severity"]), "viola", person_index)
                results.append(self._tool_result(use.id, "tool_gemeldet"))
            elif call.name == "end_conversation":
                end_reason = EndReason(call.args["reason"])
                terminal = True
                results.append(self._tool_result(use.id, "tool_beendet"))
            elif call.name == "switch_to_text":
                terminal = True
                if self.mode is Mode.VOICE:
                    self.mode = Mode.TEXT
                    self._writer.put(functools.partial(self.backend.switch_mode, self.session_id, "text"))
                    self.events.append(EngineEvent("switch_to_text", {"reason": call.args["reason"]}))
                results.append(self._tool_result(use.id, "tool_text"))
        return results, terminal, end_reason

    # ------------------------------------------------------------------ Stille, Zeit, Unterbrechung
    async def on_silence(self) -> str | None:
        """Die Person schweigt (Stimme). Liefert einen festen Satz oder beendet nach zu vielen Nachfragen."""
        async with self._lock:
            if self.ended or not self._greeted:
                return None
            self.silence_count += 1
            if self.silence_count <= self.settings.max_silence_prompts:
                text = self._sentence("stille_1" if self.silence_count == 1 else "stille_2")
                self.turns.append(Turn("viola", text, mode=self.mode))
                self._persist(self.turns[-1])
                return text
            text = self._sentence("stille_ende")
            self.turns.append(Turn("viola", text, mode=self.mode))
            self._persist(self.turns[-1])
            await self._end(EndReason.PERSON_BEENDET)
            return text

    async def tick(self) -> str | None:
        """Regelmäßig aufrufen (Stimme): beendet das Gespräch, wenn die Zeit samt Nachfrist überschritten ist."""
        async with self._lock:
            if self.ended or not self._greeted or not self.state.time_status().force_end:
                return None
            text = self._sentence("zeitlimit_ende")
            self.turns.append(Turn("viola", text, mode=self.mode))
            self._persist(self.turns[-1])
            await self._end(EndReason.ZEITLIMIT)
            return text

    def note_interruption(self, heard: str) -> None:
        """Die Person hat Viola unterbrochen; das Modell erfährt beim nächsten Zug, was gehört wurde."""
        heard = " ".join(heard.split())[:300]
        self._pending_notices.append(Notice("unterbrochen", {"gehoert": heard or "nichts"}))

    def switch_to_text(self) -> None:
        """Wechsel durch die Oberfläche (Knopf „Text statt Stimme“)."""
        if self.mode is Mode.VOICE and not self.ended:
            self.mode = Mode.TEXT
            self._pending_notices.append(Notice("text_modus"))
            sid = self.session_id
            self._writer.put(lambda: self.backend.switch_mode(sid, "text"))

    # ------------------------------------------------------------------ Ende
    async def end_by_person(self) -> None:
        async with self._lock:
            if not self.ended:
                await self._end(EndReason.PERSON_BEENDET)

    async def end_by_technical_problem(self) -> None:
        async with self._lock:
            if not self.ended:
                await self._end(EndReason.TECHNIK)

    async def _end(self, reason: EndReason) -> None:
        if self.ended:
            return
        self.ended = True
        self.end_reason = reason
        self.state.end(reason)
        self.events.append(EngineEvent("ended", {"reason": reason.value, "summary_pending": reason not in SAFETY_END_REASONS}))
        await self._writer.flush()
        try:
            await self.backend.end(self.session_id, reason.value, [b.value for b in self.state.covered_blocks()])
        except BackendError as err:
            log.warning("Ende nicht gespeichert: %s", err.code)

    async def finish(self, *, analyze: bool = True) -> None:
        """Nach dem Ende: Auswertung, Sicherheits-Agent, Kosten. Mehrfacher Aufruf ist harmlos."""
        if self._finished:
            return
        self._finished = True
        if not self.ended:
            await self._end(EndReason.TECHNIK)
        await self._writer.flush()
        analysis_model = self.options.analysis_model_override or self.settings.analysis_model_id
        sid = self.session_id
        person_turns = [t for t in self.turns if t.role == "person"]

        # 1. Profil und Zusammenfassung
        if self.end_reason in SAFETY_END_REASONS or len(person_turns) < 2 or not analyze:
            await self._safe(self.backend.mark_analysis(sid, "skipped"))
        else:
            guard = Art9Guard(self.model, analysis_model, effort="low")
            agent = AnalysisAgent(self.model, analysis_model, self.settings.analysis_effort, self.options.analysis_max_tokens)
            result = await agent.run(
                turns=self.turns,
                notes=self.notes,
                profile=self.ctx.profile,
                kind=self.ctx.kind,
                address_form=self.form,
                proposed_summary=self.proposed_summary,
                guard=guard,
            )
            self.meter.analysis.add(result.usage)
            blocks = [b.value for b in self.state.covered_blocks()]
            saved = False
            if result.analysis is not None:
                saved = await self._safe(self.backend.save_analysis(sid, result.analysis))
            summary = result.summary
            if summary is None and self.proposed_summary:
                summary = await guard.clean_summary(self.proposed_summary)
            if summary and len(summary) >= 20:
                await self._safe(self.backend.save_summary_draft(sid, summary, blocks))
            if not saved:
                await self._safe(self.backend.mark_analysis(sid, "failed"))

        # 2. Sicherheits-Agent über alle Beiträge (wörtlich, nur im Speicher)
        safety = SafetyAgent(self.model, analysis_model, self.settings.analysis_effort)
        for flag in await safety.review(self.turns):
            self._queue_flag(flag.kind, flag.severity, "analyse", flag.turn_index)
        self.meter.analysis.add(safety.usage)
        await self._writer.flush()

        # 3. Kostenprotokoll
        minutes = self.elapsed_minutes()
        if self.ctx.mode is Mode.VOICE and self.meter.media_minutes == 0:
            self.meter.media_minutes = minutes
        record = cost_record(
            self.meter,
            self.latency,
            minutes=minutes,
            prices=self.settings.prices,
            tts_provider=self.settings.tts_provider if self.ctx.mode is Mode.VOICE else "fake",
            livekit_path=self.settings.livekit_path,
            mode=self.ctx.mode.value,
            target_ms_p90=self.settings.latency_target_ms_p90,
        )
        await self._safe(self.backend.record_costs(sid, record))
        await self._writer.close()

    async def _safe(self, awaitable: Any) -> bool:
        try:
            await awaitable
            return True
        except BackendError as err:
            log.warning("Speichern fehlgeschlagen: %s %s", err.code, err.message)
            return False
