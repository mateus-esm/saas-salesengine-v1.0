import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.cascade.worker import is_pipeline_relevant, run_worker
from app.schemas import ActionResult, IntentDecision
from app.security import TenantContext
from app.skills.registry import register


# Mock skill to test deterministic dispatch
@register
class MockTestSkill:
    name = "mock_test_skill"

    def __init__(self, client, equipe_id, actor):
        self.client = client
        self.equipe_id = equipe_id
        self.actor = actor

    async def do_something(self, arg1, arg2="default"):
        return ActionResult(success=True, detail={"arg1": arg1, "arg2": arg2, "actor": self.actor})

    async def need_opportunity(self, opportunity_id):
        return ActionResult(success=True, detail={"opportunity_id": opportunity_id})

    async def need_lead(self, lead_id):
        return ActionResult(success=True, detail={"lead_id": lead_id})


@pytest.fixture
def dummy_context():
    return TenantContext(
        equipe_id="tenant-123",
        actor_user_id="user-456",
        role="authenticated"
    )


def test_is_pipeline_relevant_empty():
    assert not is_pipeline_relevant(None)
    assert not is_pipeline_relevant("")
    assert not is_pipeline_relevant("   ")
    assert not is_pipeline_relevant([])
    assert not is_pipeline_relevant({})


def test_is_pipeline_relevant_string():
    assert is_pipeline_relevant("Gostei da proposta")
    assert not is_pipeline_relevant("a")  # length <= 1


def test_is_pipeline_relevant_list():
    assert is_pipeline_relevant(["Gostei"])
    assert not is_pipeline_relevant(["a"])
    assert is_pipeline_relevant([{"content": "Quero agendar"}])
    assert is_pipeline_relevant([{"text": "Sim, segunda de manhã"}])
    assert not is_pipeline_relevant([{"content": ""}])
    assert not is_pipeline_relevant([{"content": "   "}])
    assert not is_pipeline_relevant([{"content": "a"}])


def test_is_pipeline_relevant_dict():
    assert is_pipeline_relevant({"messages": [{"content": "Quero agendar"}]})
    assert is_pipeline_relevant({"rows": ["Sim, segunda"]})
    assert not is_pipeline_relevant({"messages": []})


@pytest.mark.asyncio
async def test_run_worker_none(dummy_context):
    decision = IntentDecision(
        relevant=True,
        automation_kind="none",
        confidence=1.0,
        reason="no automation needed"
    )
    res = await run_worker(
        ctx=dummy_context,
        decision=decision,
        opportunity=None,
        lead=None,
        rules=None
    )
    assert res.success
    assert "no action taken" in res.detail["info"]


@pytest.mark.asyncio
async def test_run_worker_agentic_fallback(dummy_context):
    decision = IntentDecision(
        relevant=True,
        automation_kind="agentic",
        confidence=1.0,
        reason="agentic routing"
    )
    res = await run_worker(
        ctx=dummy_context,
        decision=decision,
        opportunity=None,
        lead=None,
        rules=None
    )
    # E4 landed: agentic now delegates to run_autonomous. With no rules (and thus
    # no autonomy_cost_ceiling), autonomy is disabled and the model never runs.
    assert not res.success
    assert res.error == "autonomy_disabled"


@pytest.mark.asyncio
async def test_run_worker_deterministic_missing_fields(dummy_context):
    # Missing skill name
    decision = IntentDecision(
        relevant=True,
        automation_kind="deterministic",
        skill=None,
        confidence=1.0,
        reason="deterministic without skill name"
    )
    res = await run_worker(ctx=dummy_context, decision=decision, opportunity=None, lead=None, rules=None)
    assert not res.success
    assert "missing_skill" in res.error

    # Unknown skill name
    decision = IntentDecision(
        relevant=True,
        automation_kind="deterministic",
        skill="nonexistent_skill",
        confidence=1.0,
        reason="unknown skill"
    )
    res = await run_worker(ctx=dummy_context, decision=decision, opportunity=None, lead=None, rules=None)
    assert not res.success
    assert "unknown skill" in res.error

    # Missing verb
    decision = IntentDecision(
        relevant=True,
        automation_kind="deterministic",
        skill="mock_test_skill",
        args={},
        confidence=1.0,
        reason="missing verb"
    )
    res = await run_worker(ctx=dummy_context, decision=decision, opportunity=None, lead=None, rules=None)
    assert not res.success
    assert "missing_verb" in res.error

    # Unknown verb
    decision = IntentDecision(
        relevant=True,
        automation_kind="deterministic",
        skill="mock_test_skill",
        args={"verb": "nonexistent_verb"},
        confidence=1.0,
        reason="unknown verb"
    )
    res = await run_worker(ctx=dummy_context, decision=decision, opportunity=None, lead=None, rules=None)
    assert not res.success
    assert "unknown_verb" in res.error


@pytest.mark.asyncio
async def test_run_worker_deterministic_success(dummy_context):
    decision = IntentDecision(
        relevant=True,
        automation_kind="deterministic",
        skill="mock_test_skill",
        args={"verb": "do_something", "arg1": "hello", "arg2": "world"},
        confidence=1.0,
        reason="test success"
    )
    res = await run_worker(
        ctx=dummy_context,
        decision=decision,
        opportunity=None,
        lead=None,
        rules=None,
        client=MagicMock()
    )
    assert res.success
    assert res.detail["arg1"] == "hello"
    assert res.detail["arg2"] == "world"
    assert res.detail["actor"] == "user-456"


@pytest.mark.asyncio
async def test_run_worker_deterministic_injection(dummy_context):
    # Test opportunity_id injection
    decision = IntentDecision(
        relevant=True,
        automation_kind="deterministic",
        skill="mock_test_skill",
        args={"verb": "need_opportunity"},
        confidence=1.0,
        reason="test opportunity injection"
    )
    opp = {"id": "opp-999", "equipe_id": "tenant-123"}
    res = await run_worker(
        ctx=dummy_context,
        decision=decision,
        opportunity=opp,
        lead=None,
        rules=None,
        client=MagicMock()
    )
    assert res.success
    assert res.detail["opportunity_id"] == "opp-999"

    # Test lead_id injection
    decision = IntentDecision(
        relevant=True,
        automation_kind="deterministic",
        skill="mock_test_skill",
        args={"verb": "need_lead"},
        confidence=1.0,
        reason="test lead injection"
    )
    lead = {"id": "lead-888", "equipe_id": "tenant-123"}
    res = await run_worker(
        ctx=dummy_context,
        decision=decision,
        opportunity=None,
        lead=lead,
        rules=None,
        client=MagicMock()
    )
    assert res.success
    assert res.detail["lead_id"] == "lead-888"

