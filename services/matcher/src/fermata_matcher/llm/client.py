"""Zugang zum Sprachmodell: Claude Sonnet 5.5 über Amazon Bedrock (EU) oder eine Attrappe für Tests.

Anfrage (laut Anthropic-Leitfaden für Sonnet 5.5):
- `model`: aus analysis.llm_model_id (EU-Geo-Profil `eu.anthropic.claude-sonnet-5-5`, bedrock-runtime) oder beim
  Mantle-Endpunkt `anthropic.claude-sonnet-5-5` in eu-central-1,
- Denken adaptiv (Standard bei Sonnet 5.5, `thinking` wird nicht gesetzt; `disabled` lehnt das Modell ab),
  Aufwand über `output_config.effort` (matching.llm_effort, Standard „low“),
- kein `temperature`/`top_p`/`top_k` (Sonnet 5.5 lehnt abweichende Werte ab),
- strukturierte Ausgabe über `output_config.format` (JSON-Schema), kein erzwungener Werkzeugaufruf,
- die feste Rubrik als `system`-Block mit `cache_control` (Prompt-Caching),
- `stop_reason == "refusal"` wird vor dem Lesen des Inhalts geprüft; dann gilt für das Paar nur der Regel-Score.
"""

from __future__ import annotations

import hashlib
import json
import random
import threading
from dataclasses import dataclass, field
from typing import Any, Protocol

from ..art9 import GENDER_PATTERN, find_art9
from .prompts import RUBRIC_SYSTEM
from .templates import template_reasons


@dataclass
class LLMUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0

    def add(self, other: LLMUsage) -> None:
        self.input_tokens += other.input_tokens
        self.output_tokens += other.output_tokens
        self.cache_read_tokens += other.cache_read_tokens
        self.cache_write_tokens += other.cache_write_tokens

    def cost_usd(self, prices: dict[str, float]) -> float:
        return (
            self.input_tokens * prices.get("input", 0.0)
            + self.output_tokens * prices.get("output", 0.0)
            + self.cache_read_tokens * prices.get("cache_read", 0.0)
            + self.cache_write_tokens * prices.get("cache_write", 0.0)
        ) / 1_000_000


@dataclass
class LLMResponse:
    data: dict[str, Any] | None
    usage: LLMUsage = field(default_factory=LLMUsage)
    stop_reason: str | None = None
    error: str | None = None


class LLMClient(Protocol):
    model_id: str
    backend: str

    def complete_json(
        self, *, system: str, user: str, schema: dict[str, Any], max_tokens: int, effort: str
    ) -> LLMResponse: ...


def mantle_model_id(model_id: str) -> str:
    """`eu.anthropic.claude-sonnet-5-5` → `anthropic.claude-sonnet-5-5` (Mantle nutzt keine Geo-Profile)."""
    for prefix in ("eu.", "us.", "apac.", "global."):
        if model_id.startswith(prefix):
            return model_id[len(prefix) :]
    return model_id


class AnthropicBedrockLLM:
    """Echter Zugang über das Anthropic-SDK (`anthropic[bedrock]`). AWS-Zugang aus der Umgebung (IAM-Rolle)."""

    def __init__(self, backend: str, region: str, model_id: str, timeout: float = 120.0, max_retries: int = 4):
        import anthropic

        self._anthropic = anthropic
        self.backend = backend
        if backend == "bedrock-mantle":
            self.client = anthropic.AnthropicBedrockMantle(aws_region=region, timeout=timeout, max_retries=max_retries)
            self.model_id = mantle_model_id(model_id)
        elif backend == "bedrock":
            self.client = anthropic.AnthropicBedrock(aws_region=region, timeout=timeout, max_retries=max_retries)
            self.model_id = model_id
        else:
            raise ValueError(f"Unbekanntes LLM-Backend: {backend}")

    def complete_json(
        self, *, system: str, user: str, schema: dict[str, Any], max_tokens: int, effort: str
    ) -> LLMResponse:
        a = self._anthropic
        try:
            resp = self.client.messages.create(
                model=self.model_id,
                max_tokens=max_tokens,
                system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
                messages=[{"role": "user", "content": user}],
                output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
            )
        except a.BadRequestError as e:
            return LLMResponse(None, error=f"bad_request: {e.message}")
        except a.RateLimitError:
            return LLMResponse(None, error="rate_limit")
        except a.APIStatusError as e:
            return LLMResponse(None, error=f"api_status_{e.status_code}")
        except a.APIConnectionError:
            return LLMResponse(None, error="connection")
        u = resp.usage
        usage = LLMUsage(
            input_tokens=int(getattr(u, "input_tokens", 0) or 0),
            output_tokens=int(getattr(u, "output_tokens", 0) or 0),
            cache_read_tokens=int(getattr(u, "cache_read_input_tokens", 0) or 0),
            cache_write_tokens=int(getattr(u, "cache_creation_input_tokens", 0) or 0),
        )
        if resp.stop_reason == "refusal":
            details = getattr(resp, "stop_details", None)
            category = getattr(details, "category", None) if details else None
            return LLMResponse(None, usage, "refusal", f"refusal:{category or 'unbekannt'}")
        if resp.stop_reason == "max_tokens":
            return LLMResponse(None, usage, "max_tokens", "max_tokens")
        text = next((b.text for b in resp.content if b.type == "text"), None)
        if text is None:
            return LLMResponse(None, usage, resp.stop_reason, "kein_text")
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            return LLMResponse(None, usage, resp.stop_reason, "json")
        return LLMResponse(data, usage, resp.stop_reason)


def _approx_tokens(text: str) -> int:
    # Deutsch: grob 3,2 Zeichen je Token (nur für die Kostenschätzung der Attrappe).
    return max(1, round(len(text) / 3.2))


class FakeLLM:
    """Deterministische Attrappe: gleiche Ein- und Ausgabeform wie das echte Modell, ohne Netzwerk.

    Der Score folgt grob den strukturierten Angaben (Werte, Persönlichkeit, Interessen, Kinderwunsch) plus einem
    festen Rauschen je Eingabe. `art9_rate` mischt absichtlich Art.-9-Inhalte in einen Teil der Texte, damit
    Simulation und Tests den Filter sehen.
    """

    backend = "fake"

    def __init__(self, model_id: str = "fake.claude-sonnet-5-5", art9_rate: float = 0.0, fail_rate: float = 0.0):
        self.model_id = model_id
        self.art9_rate = art9_rate
        self.fail_rate = fail_rate
        self.calls = 0
        self.requests: list[dict[str, Any]] = []
        self._lock = threading.Lock()
        self._warm: set[str] = set()

    def _usage(self, system: str, user: str, output: str) -> LLMUsage:
        key = hashlib.sha256(system.encode()).hexdigest()
        with self._lock:
            warm = key in self._warm
            self._warm.add(key)
        sys_tokens = _approx_tokens(system)
        return LLMUsage(
            input_tokens=_approx_tokens(user),
            output_tokens=_approx_tokens(output) + 150,  # plus kurzes Denken bei effort low
            cache_read_tokens=sys_tokens if warm else 0,
            cache_write_tokens=0 if warm else sys_tokens,
        )

    def complete_json(
        self, *, system: str, user: str, schema: dict[str, Any], max_tokens: int, effort: str
    ) -> LLMResponse:
        with self._lock:
            self.calls += 1
            if len(self.requests) < 200:  # nur die ersten Anfragen merken (Tests), sonst wächst der Speicher
                self.requests.append(
                    {"system": system, "user": user, "schema": schema, "max_tokens": max_tokens, "effort": effort}
                )
        payload = json.loads(user[user.index("{") :])
        digest = hashlib.sha256(user.encode()).digest()
        rnd = random.Random(digest)
        if self.fail_rate and rnd.random() < self.fail_rate:
            return LLMResponse(None, LLMUsage(input_tokens=_approx_tokens(user)), "refusal", "refusal:general_harms")
        data = self._rubric(payload, rnd) if system == RUBRIC_SYSTEM else self._review(payload)
        out = json.dumps(data, ensure_ascii=False)
        return LLMResponse(data, self._usage(system, user, out), "end_turn")

    def _rubric(self, payload: dict[str, Any], rnd: random.Random) -> dict[str, Any]:
        a, b = payload["person_a"], payload["person_b"]
        parts: list[float] = []
        wa, wb = a.get("werte") or {}, b.get("werte") or {}
        shared = set(wa) & set(wb)
        if shared:
            parts.append(1 - sum(abs(float(wa[k]) - float(wb[k])) for k in shared) / len(shared))
        pa, pb = a.get("persoenlichkeit") or {}, b.get("persoenlichkeit") or {}
        shared = {k for k in set(pa) & set(pb) if isinstance(pa[k], int | float) and isinstance(pb[k], int | float)}
        if shared:
            parts.append(1 - sum(abs(float(pa[k]) - float(pb[k])) for k in shared) / len(shared))
        ia = {str(x).lower() for x in (a.get("lebensumstaende") or {}).get("interessen") or []}
        ib = {str(x).lower() for x in (b.get("lebensumstaende") or {}).get("interessen") or []}
        if ia and ib:
            parts.append(min(1.0, 2 * len(ia & ib) / min(len(ia), len(ib))))
        base = sum(parts) / len(parts) if parts else 0.6
        if {a.get("kinderwunsch"), b.get("kinderwunsch")} == {"ja", "nein"}:
            base -= 0.35
        score = max(0.0, min(1.0, 0.2 + 0.8 * base + rnd.uniform(-0.08, 0.08)))
        mode = (payload.get("paar") or {}).get("anrede", "sie")
        reasons = template_reasons(a, b, mode)
        if self.art9_rate and rnd.random() < self.art9_rate:
            reasons += " Auch der gemeinsame Glaube verbindet Sie." if mode == "sie" else " Auch der Glaube verbindet."
        concerns = []
        if score < 0.6:
            concerns.append("Werte und Interessen liegen eher auseinander.")
        if {a.get("kinderwunsch"), b.get("kinderwunsch")} == {"ja", "nein"}:
            concerns.append("Gegensätzliche Kinderwünsche.")
        return {
            "score": round(score, 2),
            "begruendung": "Attrappe: Bewertung aus Werten, Persönlichkeit und gemeinsamen Interessen.",
            "bedenken": concerns,
            "warum_sie_beide": reasons,
        }

    def _review(self, payload: dict[str, Any]) -> dict[str, Any]:
        text = payload.get("warum_sie_beide") or ""
        suspicious = bool(find_art9(text) or GENDER_PATTERN.search(text))
        risks: list[str] = []
        subs = (payload.get("scores") or {}).get("teil_scores") or {}
        for key, label in (("werte", "Werte"), ("wuensche", "Wünsche"), ("persoenlichkeit", "Persönlichkeit")):
            v = subs.get(key)
            if isinstance(v, int | float) and v < 0.4:
                risks.append(f"{label} passen nach den Regeln wenig zusammen.")
        lokal = payload.get("lokal") or {}
        if lokal and not lokal.get("verhaeltnis_ok", True):
            risks.append("Anfahrt sehr ungleich verteilt.")
        risks += [str(h) for h in payload.get("hinweise") or []]
        return {
            "plausibel": not suspicious,
            "einschaetzung": "Attrappe: Angaben und Begründung wurden auf Widersprüche geprüft.",
            "risiken": risks,
            "art9_verdacht": suspicious,
            "art9_hinweis": "Der Text berührt ein geschütztes Thema." if suspicious else "",
            "empfehlung": "genauer_pruefen" if (risks or suspicious) else "freigeben",
        }


def make_llm(backend: str, *, region: str, model_id: str, override: str | None = None, art9_rate: float = 0.0):
    """Erzeugt das LLM-Backend oder None (backend „none“: nur Regeln)."""
    if backend == "none":
        return None
    if backend == "fake":
        return FakeLLM(art9_rate=art9_rate)
    return AnthropicBedrockLLM(backend, region, override or model_id)
