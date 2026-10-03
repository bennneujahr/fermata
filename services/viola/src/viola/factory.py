"""Bausteine aus der Konfiguration: Sprachmodell, Rückweg, Optionen des Gesprächskerns."""

from __future__ import annotations

from viola.backend import Backend, HttpBackend, MemoryBackend
from viola.config import Config
from viola.engine import EngineOptions
from viola.llm.anthropic_llm import AnthropicChatModel
from viola.llm.base import ChatModel
from viola.llm.fake import FakeChatModel


def build_model(cfg: Config) -> ChatModel:
    if cfg.llm_provider == "bedrock":
        return AnthropicChatModel.for_bedrock(cfg.aws_region, eager_tool_streaming=cfg.eager_tool_streaming)
    if cfg.llm_provider == "anthropic":
        return AnthropicChatModel.for_first_party(eager_tool_streaming=cfg.eager_tool_streaming)
    return FakeChatModel()


def build_backend(cfg: Config) -> Backend:
    if cfg.backend == "http":
        return HttpBackend(cfg.agent_url, cfg.agent_secret)
    return MemoryBackend(auto_create=cfg.env in ("local", "test"))


def engine_options(cfg: Config) -> EngineOptions:
    return EngineOptions(
        notice_style=cfg.notice_style,
        max_tokens=cfg.llm_max_tokens,
        model_override=cfg.llm_model_override,
        analysis_model_override=cfg.analysis_model_override,
        analysis_max_tokens=cfg.analysis_max_tokens,
    )
