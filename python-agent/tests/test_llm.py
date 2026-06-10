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
