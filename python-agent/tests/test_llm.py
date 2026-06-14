"""Tests for app.llm.build_chat_model — provider/model switching via env."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.llm import build_chat_model


def test_defaults_to_openai_when_no_env(monkeypatch):
    monkeypatch.delenv("LLM_BASE_URL", raising=False)
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    model = build_chat_model("gpt-4o-mini")
    assert model.id == "gpt-4o-mini"
    # No custom base_url forced when env is unset (uses OpenAI default).
    assert getattr(model, "base_url", None) in (None, "")


def test_routes_to_verboo_when_env_set(monkeypatch):
    monkeypatch.setenv("LLM_BASE_URL", "https://code.verboo.ai/router/v1")
    monkeypatch.setenv("LLM_API_KEY", "vbk_test")
    model = build_chat_model("deepseek-v4-flash")
    assert model.id == "deepseek-v4-flash"
    assert model.base_url == "https://code.verboo.ai/router/v1"
    assert model.api_key == "vbk_test"
    # role_map forces classic "system" (not OpenAI's "developer") for the router.
    assert model.role_map is not None
    assert model.role_map["system"] == "system"


def test_no_role_map_override_for_default_openai(monkeypatch):
    monkeypatch.delenv("LLM_BASE_URL", raising=False)
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    model = build_chat_model("gpt-4o-mini")
    # Real OpenAI keeps Agno's default mapping (system -> developer).
    assert model.role_map is None


def test_build_reasoning_model_sets_reasoning_flag(monkeypatch):
    monkeypatch.delenv("LLM_BASE_URL", raising=False)
    from app.llm import build_reasoning_model

    model = build_reasoning_model("o4-mini")

    assert model.id == "o4-mini"
    assert getattr(model, "reasoning_effort", None) in {"medium", "high", None}


def test_build_reasoning_model_degrades_for_openai_compatible_router(monkeypatch):
    monkeypatch.setenv("LLM_BASE_URL", "https://code.verboo.ai/router/v1")
    monkeypatch.setenv("LLM_API_KEY", "vbk_test")
    from app.llm import build_reasoning_model

    model = build_reasoning_model("deepseek-reasoner", effort="high")

    assert model.id == "deepseek-reasoner"
    assert model.base_url == "https://code.verboo.ai/router/v1"
    assert model.api_key == "vbk_test"
    assert model.role_map is not None
    assert getattr(model, "reasoning_effort", None) is None
