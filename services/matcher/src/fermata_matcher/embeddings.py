"""Embeddings für die Vorauswahl (PLAN 2.5): Amazon Titan Text Embeddings V2, 1024 Dimensionen, normalisiert.

Eingabe ist dieselbe bereinigte Zusammenfassung wie für das Sprachmodell (ohne Namen, ohne Art.-9-Sätze).
Neu gerechnet wird nur, wenn sich der Text oder das Modell geändert hat (source_hash).
Die Ähnlichkeit rechnet die Datenbank (pgvector, Kosinus).
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol

DIMENSIONS = 1024


class Embedder(Protocol):
    model_id: str

    def embed(self, text: str) -> tuple[list[float], int]: ...


class TitanEmbedder:
    """Bedrock InvokeModel mit amazon.titan-embed-text-v2:0 (Frankfurt)."""

    def __init__(self, region: str, model_id: str = "amazon.titan-embed-text-v2:0"):
        import boto3

        self.model_id = model_id
        self.client = boto3.client("bedrock-runtime", region_name=region)

    def embed(self, text: str) -> tuple[list[float], int]:
        body = json.dumps({"inputText": text[:40000], "dimensions": DIMENSIONS, "normalize": True})
        resp = self.client.invoke_model(
            modelId=self.model_id, body=body, contentType="application/json", accept="application/json"
        )
        data = json.loads(resp["body"].read())
        return [float(x) for x in data["embedding"]], int(data.get("inputTextTokenCount", 0))


_WORD = re.compile(r"[a-zäöüß]{3,}", re.IGNORECASE)


class FakeEmbedder:
    """Attrappe ohne Netzwerk: Merkmals-Hashing der Wörter (mit Vorzeichen), normalisiert.

    Texte mit vielen gemeinsamen Wörtern liegen nah beieinander – genug, um die Vorauswahl in Simulation und Tests
    sinnvoll zu testen.
    """

    model_id = "fake.hashed-bow-1024"

    def embed(self, text: str) -> tuple[list[float], int]:
        vec = [0.0] * DIMENSIONS
        words = _WORD.findall(text.lower())
        for w in words:
            h = hashlib.blake2b(w.encode(), digest_size=8).digest()
            idx = int.from_bytes(h[:4], "little") % DIMENSIONS
            sign = 1.0 if h[4] & 1 else -1.0
            vec[idx] += sign
        norm = math.sqrt(sum(x * x for x in vec)) or 1.0
        return [x / norm for x in vec], len(words)


def make_embedder(backend: str, *, region: str, model_id: str) -> Embedder | None:
    if backend == "none":
        return None
    if backend == "fake":
        return FakeEmbedder()
    if backend == "titan":
        return TitanEmbedder(region, model_id)
    raise ValueError(f"Unbekanntes Embedding-Backend: {backend}")


def source_hash(model_id: str, text: str) -> str:
    return hashlib.sha256(f"{model_id}\n{text}".encode()).hexdigest()


def vector_literal(vec: list[float]) -> str:
    return "[" + ",".join(f"{x:.6f}" for x in vec) + "]"


@dataclass
class EmbeddingStats:
    present: int = 0
    computed: int = 0
    failed: int = 0
    skipped_empty: int = 0
    tokens: int = 0

    def as_json(self) -> dict[str, Any]:
        return {
            "vorhanden": self.present,
            "neu_berechnet": self.computed,
            "fehlgeschlagen": self.failed,
            "ohne_text": self.skipped_empty,
            "token": self.tokens,
        }


def plan_embeddings(
    texts: dict[str, str], existing: dict[str, tuple[str, str]], model_id: str
) -> tuple[list[str], int]:
    """Welche Personen brauchen ein neues Embedding? existing: user_id → (model, source_hash)."""
    todo = []
    up_to_date = 0
    for uid, text in texts.items():
        if not text.strip():
            continue
        h = source_hash(model_id, text)
        old = existing.get(uid)
        if old and old[0] == model_id and old[1] == h:
            up_to_date += 1
        else:
            todo.append(uid)
    return todo, up_to_date


def compute_embeddings(
    embedder: Embedder, texts: dict[str, str], todo: list[str], on_error: Callable[[str, Exception], None] | None = None
) -> tuple[dict[str, tuple[list[float], str]], EmbeddingStats]:
    stats = EmbeddingStats()
    out: dict[str, tuple[list[float], str]] = {}
    for uid in todo:
        try:
            vec, tokens = embedder.embed(texts[uid])
        except Exception as e:  # Netzwerk, Drosselung: Person läuft ohne Embedding (nur Regeln)
            stats.failed += 1
            if on_error:
                on_error(uid, e)
            continue
        stats.computed += 1
        stats.tokens += tokens
        out[uid] = (vec, source_hash(embedder.model_id, texts[uid]))
    return out, stats
