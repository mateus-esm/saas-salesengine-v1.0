"""Tests for app.cascade.enricher — dictionary-bounded enrichment router.

All Agno/LLM/DB calls are monkeypatched. No live connections.
"""

import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from app.schemas import ActionPlan, PlannedAction
from app.cascade import enricher
from app.security import TenantContext


def _ctx() -> TenantContext:
    return TenantContext(equipe_id="team-1", actor_user_id="u1", role="authenticated")


def _fake_settings():
    s = MagicMock()
    s.doorman_model = "gpt-4o-mini"
    return s


class _Query:
    def __init__(self, client, table):
        self.client, self.table = client, table

    def select(self, *_):
        return self

    def eq(self, *_):
        return self

    def limit(self, *_):
        return self

    def execute(self):
        data = self.client.selects.get(self.table, [])
        data = data.pop(0) if data else []
        return SimpleNamespace(data=data, error=None)


class _Client:
    def __init__(self, selects=None):
        self.selects = selects or {}

    def table(self, table):
        return _Query(self, table)


def _pipeline_client():
    return _Client({
        "pipelines": [[{
            "custom_fields_schema": [
                {"field_id": "f_valor", "key": "valor_conta", "label": "Valor da Conta",
                 "type": "currency", "description": "Valor mensal da conta."},
                {"field_id": "f_conta", "key": "conta_energia", "label": "Conta de Energia",
                 "type": "file"},
            ]
        }]]
    })


def _patch_run(monkeypatch, plan: ActionPlan):
    async def fake_run(agent, message):
        return type("R", (), {"content": plan})()
    monkeypatch.setattr(enricher, "_arun_agent", fake_run)


@pytest.mark.asyncio
async def test_keeps_contact_fact_in_canonical_dictionary(monkeypatch):
    monkeypatch.setattr(enricher, "get_settings", _fake_settings)
    _patch_run(monkeypatch, ActionPlan(
        relevant=True, confidence=0.8, reason="cargo",
        actions=[PlannedAction(verb="set_contact_field", args={"key": "cargo", "value": "CFO"})]))

    plan = await enricher.enrich(
        ctx=_ctx(), conversation="sou o CFO", lead={"id": "l1"},
        opportunity={"id": "o1"}, rules={}, client=object())

    assert plan.relevant is True
    assert plan.actions[0].args["key"] == "cargo"


@pytest.mark.asyncio
async def test_drops_contact_fact_not_in_dictionary(monkeypatch):
    monkeypatch.setattr(enricher, "get_settings", _fake_settings)
    _patch_run(monkeypatch, ActionPlan(
        relevant=True, confidence=0.8, reason="invented",
        actions=[PlannedAction(verb="set_contact_field", args={"key": "cor_favorita", "value": "azul"})]))

    plan = await enricher.enrich(
        ctx=_ctx(), conversation="minha cor favorita é azul", lead={"id": "l1"},
        opportunity={"id": "o1"}, rules={}, client=object())

    assert plan.relevant is False          # invented field dropped → noop
    assert plan.actions == []


@pytest.mark.asyncio
async def test_keeps_pipeline_field_present_in_schema(monkeypatch):
    monkeypatch.setattr(enricher, "get_settings", _fake_settings)
    _patch_run(monkeypatch, ActionPlan(
        relevant=True, confidence=0.8, reason="valor",
        actions=[PlannedAction(verb="set_field", args={"field_id": "f_valor", "value": "1000"})]))

    plan = await enricher.enrich(
        ctx=_ctx(), conversation="minha conta é 1000 reais", lead={"id": "l1"},
        opportunity={"id": "o1", "pipeline_id": "p1"}, rules={}, client=_pipeline_client())

    assert plan.actions[0].verb == "set_field"
    assert plan.actions[0].args["field_id"] == "f_valor"


@pytest.mark.asyncio
async def test_attach_file_only_for_file_type_field(monkeypatch):
    monkeypatch.setattr(enricher, "get_settings", _fake_settings)
    _patch_run(monkeypatch, ActionPlan(
        relevant=True, confidence=0.8, reason="foto da conta",
        actions=[
            PlannedAction(verb="attach_file", args={"field_id": "f_conta", "file_url": "https://x/c.jpg"}),
            PlannedAction(verb="attach_file", args={"field_id": "f_valor", "file_url": "https://x/c.jpg"}),
        ]))

    plan = await enricher.enrich(
        ctx=_ctx(), conversation="segue foto da conta", lead={"id": "l1"},
        opportunity={"id": "o1", "pipeline_id": "p1"}, rules={}, client=_pipeline_client())

    # f_conta is type "file" → kept; f_valor is currency → dropped.
    assert len(plan.actions) == 1
    assert plan.actions[0].args["field_id"] == "f_conta"


# ---------------------------------------------------------------------------
# Lead-Memory wiring tests (W2.5 restore)
# ---------------------------------------------------------------------------

def test_build_agent_with_storage_wires_lead_memory(monkeypatch):
    """When _get_storage() returns a non-None sentinel, _build_agent must pass
    db=<sentinel>, enable_agentic_memory=True, and user_id=<lead_id> to Agent."""
    storage_sentinel = object()

    captured_kwargs: dict = {}

    class _FakeAgent:
        def __init__(self, **kwargs):
            captured_kwargs.update(kwargs)

    monkeypatch.setattr(enricher, "Agent", _FakeAgent)
    monkeypatch.setattr(enricher, "build_chat_model", lambda model_id: MagicMock())
    monkeypatch.setattr(enricher, "_get_storage", lambda: storage_sentinel)

    enricher._build_agent(model_id="m", lead_id="lead-9", system_prompt="x")

    assert captured_kwargs.get("enable_agentic_memory") is True
    assert captured_kwargs.get("user_id") == "lead-9"
    assert captured_kwargs.get("db") is storage_sentinel


def test_build_agent_without_storage_omits_lead_memory(monkeypatch):
    """When _get_storage() returns None, _build_agent must NOT include
    db, enable_agentic_memory, or user_id in the Agent kwargs."""
    captured_kwargs: dict = {}

    class _FakeAgent:
        def __init__(self, **kwargs):
            captured_kwargs.update(kwargs)

    monkeypatch.setattr(enricher, "Agent", _FakeAgent)
    monkeypatch.setattr(enricher, "build_chat_model", lambda model_id: MagicMock())
    monkeypatch.setattr(enricher, "_get_storage", lambda: None)

    enricher._build_agent(model_id="m", lead_id="lead-9", system_prompt="x")

    assert "enable_agentic_memory" not in captured_kwargs
    assert "user_id" not in captured_kwargs
    assert "db" not in captured_kwargs
