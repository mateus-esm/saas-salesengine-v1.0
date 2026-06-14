"""Tests for app.cascade.enricher — Contact Base Enricher + persistent Lead Memory.

All Agno/LLM/DB calls are monkeypatched. No live connections.
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from app.schemas import ActionPlan, PlannedAction
from app.cascade import enricher
from app.security import TenantContext


def _ctx() -> TenantContext:
    return TenantContext(equipe_id="e1", actor_user_id="u1", role="authenticated")


def _fake_settings():
    """Return a minimal Settings stub so tests never hit env-var validation."""
    s = MagicMock()
    s.doorman_model = "gpt-4o-mini"
    return s


# ---------------------------------------------------------------------------
# Test 1: happy-path extraction
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_enricher_extracts_fields_into_plan(monkeypatch):
    monkeypatch.setattr(enricher, "get_settings", _fake_settings)

    async def fake_run(agent, message):
        return type("R", (), {"content": ActionPlan(
            relevant=True, confidence=0.77, reason="extracted kWh",
            actions=[PlannedAction(verb="set_contact_field", args={"key": "kwh", "value": "12"})])})()

    monkeypatch.setattr(enricher, "_arun_agent", fake_run)

    plan = await enricher.enrich(
        ctx=_ctx(),
        conversation="consumo 12 kWp",
        lead={"id": "l1"},
        opportunity={"id": "o1"},
        rules={},
        client=object(),
    )
    assert plan.relevant is True
    assert plan.actions[0].verb == "set_contact_field"
    assert plan.actions[0].args["key"] == "kwh"


# ---------------------------------------------------------------------------
# Test 2: non-ActionPlan content → graceful noop
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_enricher_returns_noop_on_non_actionplan_content(monkeypatch):
    monkeypatch.setattr(enricher, "get_settings", _fake_settings)

    async def fake_run(agent, message):
        return type("R", (), {"content": None})()

    monkeypatch.setattr(enricher, "_arun_agent", fake_run)

    plan = await enricher.enrich(
        ctx=_ctx(),
        conversation="oi",
        lead={"id": "l1"},
        opportunity={"id": "o1"},
        rules={},
        client=object(),
    )
    assert plan.relevant is False
    assert plan.actions == []
    assert plan.confidence == 0.0


# ---------------------------------------------------------------------------
# Test 3a: memory wiring when storage IS present
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_enricher_wires_memory_when_storage_present(monkeypatch):
    monkeypatch.setattr(enricher, "get_settings", _fake_settings)

    sentinel_storage = object()
    captured_kwargs = {}

    # Stub _get_storage to return a non-None sentinel.
    monkeypatch.setattr(enricher, "_get_storage", lambda: sentinel_storage)

    # Stub the Agent constructor to capture kwargs without actually building an agent.
    class FakeAgent:
        def __init__(self, **kw):
            captured_kwargs.update(kw)

    monkeypatch.setattr(enricher, "Agent", FakeAgent)

    # Stub _arun_agent so it never calls agent.arun (FakeAgent has none).
    async def fake_run(agent, message):
        return type("R", (), {"content": ActionPlan(
            relevant=False, confidence=0.0, reason="stub", actions=[])})()

    monkeypatch.setattr(enricher, "_arun_agent", fake_run)

    await enricher.enrich(
        ctx=_ctx(),
        conversation="test",
        lead={"id": "l1"},
        opportunity={"id": "o1"},
        rules={},
        client=object(),
    )

    assert captured_kwargs.get("enable_agentic_memory") is True
    assert captured_kwargs.get("user_id") == "l1"
    assert captured_kwargs.get("db") is sentinel_storage


# ---------------------------------------------------------------------------
# Test 3b: no memory kwargs when storage is None (unit-test-safe default)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_enricher_omits_memory_kwargs_when_storage_absent(monkeypatch):
    monkeypatch.setattr(enricher, "get_settings", _fake_settings)

    captured_kwargs = {}

    monkeypatch.setattr(enricher, "_get_storage", lambda: None)

    class FakeAgent:
        def __init__(self, **kw):
            captured_kwargs.update(kw)

    monkeypatch.setattr(enricher, "Agent", FakeAgent)

    async def fake_run(agent, message):
        return type("R", (), {"content": ActionPlan(
            relevant=False, confidence=0.0, reason="stub", actions=[])})()

    monkeypatch.setattr(enricher, "_arun_agent", fake_run)

    await enricher.enrich(
        ctx=_ctx(),
        conversation="test",
        lead={"id": "l1"},
        opportunity={"id": "o1"},
        rules={},
        client=object(),
    )

    assert "enable_agentic_memory" not in captured_kwargs
    assert "user_id" not in captured_kwargs
    assert "db" not in captured_kwargs
