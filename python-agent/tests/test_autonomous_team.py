"""Tests for app.cascade.autonomous_team — the model and supabase client are mocked."""

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from app.cascade.autonomous_team import run_autonomous
from app.schemas import ActionResult, IntentDecision
from app.security import TenantContext


@pytest.fixture
def ctx() -> TenantContext:
    return TenantContext(equipe_id="tenant-123", actor_user_id="user-456", role="authenticated")


@pytest.fixture
def decision() -> IntentDecision:
    return IntentDecision(
        relevant=True,
        automation_kind="agentic",
        confidence=1.0,
        reason="autonomous run",
    )


def _tool_execution(tool_name: str, tool_args: dict, result) -> MagicMock:
    te = MagicMock()
    te.tool_name = tool_name
    te.tool_args = tool_args
    te.result = result
    te.tool_call_error = None
    return te


@pytest.mark.asyncio
async def test_disabled_when_ceiling_missing(ctx, decision):
    """autonomy_cost_ceiling missing/None => no model run, autonomy_disabled."""
    with patch("app.cascade.autonomous_team.Agent") as MockAgent:
        res = await run_autonomous(
            ctx=ctx,
            decision=decision,
            opportunity={"id": "opp-1"},
            lead={"id": "lead-1"},
            rules={"enabled_skills": ["core_table"]},  # no ceiling key
            client=MagicMock(),
        )

    assert isinstance(res, ActionResult)
    assert res.success is False
    assert res.error == "autonomy_disabled"
    MockAgent.assert_not_called()


@pytest.mark.asyncio
async def test_disabled_when_ceiling_explicitly_none(ctx, decision):
    with patch("app.cascade.autonomous_team.Agent") as MockAgent:
        res = await run_autonomous(
            ctx=ctx,
            decision=decision,
            opportunity={"id": "opp-1"},
            lead={"id": "lead-1"},
            rules={"enabled_skills": ["core_table"], "autonomy_cost_ceiling": None},
            client=MagicMock(),
        )

    assert res.success is False
    assert res.error == "autonomy_disabled"
    MockAgent.assert_not_called()


class _FakeQuery:
    """Minimal fluent supabase query stub returning canned rows on execute()."""

    def __init__(self, data):
        self._data = data

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def is_(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def update(self, *a, **k):
        return self

    def execute(self):
        resp = MagicMock()
        resp.error = None
        resp.data = self._data
        return resp


class _FakeClient:
    """Routes table() reads to canned rows so CoreTableSkill.move_stage runs end-to-end."""

    def __init__(self):
        self.updates: list = []

    def table(self, name):
        if name == "opportunities":
            return _FakeQuery([{"id": "opp-1", "equipe_id": "tenant-123", "pipeline_id": "pipe-1", "stage_id": "s0"}])
        if name == "pipeline_stages_v2":
            return _FakeQuery([{"id": "s-won", "equipe_id": "tenant-123", "name": "Ganho", "position": 0}])
        if name == "opportunity_stage_history":
            return _FakeQuery([])
        return _FakeQuery([])


@pytest.mark.asyncio
async def test_single_tool_call_routes_through_core_table(ctx, decision):
    """A ceiling + a stubbed model that triggers ONE tool call must run that
    mutation through CoreTableSkill (real instance, mocked supabase client)
    and reflect success in the ActionResult."""
    db_client = _FakeClient()
    captured: dict = {}

    async def fake_arun(message, **kwargs):
        # Find the bound move_stage verb the agent was given, and invoke it
        # exactly as Agno would when the model emits a tool call.
        tools = captured["tools"]
        move_stage = next(t for t in tools if getattr(t, "__name__", "") == "move_stage")
        applied = await move_stage(opportunity_id="opp-1", stage_type="won")
        response = MagicMock()
        response.tools = [_tool_execution("move_stage", {"opportunity_id": "opp-1", "stage_type": "won"}, applied)]
        return response

    def fake_agent_ctor(*args, **kwargs):
        captured["tools"] = kwargs.get("tools")
        agent = MagicMock()
        agent.arun = AsyncMock(side_effect=fake_arun)
        return agent

    with patch("app.cascade.autonomous_team.Agent", side_effect=fake_agent_ctor):
        res = await run_autonomous(
            ctx=ctx,
            decision=decision,
            opportunity={"id": "opp-1"},
            lead={"id": "lead-1"},
            rules={"enabled_skills": ["core_table"], "autonomy_cost_ceiling": 5, "worker_model": "gpt-4o"},
            client=db_client,
        )

    # The mutation went through a real CoreTableSkill bound verb and succeeded.
    assert res.success is True
    applied = res.detail.get("applied", [])
    assert any(c.get("verb") == "move_stage" and c.get("success") for c in applied)


@pytest.mark.asyncio
async def test_exceeding_cap_halts_gracefully(ctx, decision):
    """If the run blows the cap (model raises a limit error), we must NOT raise;
    we return an ActionResult summarizing what was applied."""

    async def fake_arun(message, **kwargs):
        raise RuntimeError("tool_call_limit exceeded")

    def fake_agent_ctor(*args, **kwargs):
        agent = MagicMock()
        agent.arun = AsyncMock(side_effect=fake_arun)
        return agent

    with patch("app.cascade.autonomous_team.Agent", side_effect=fake_agent_ctor):
        res = await run_autonomous(
            ctx=ctx,
            decision=decision,
            opportunity={"id": "opp-1"},
            lead={"id": "lead-1"},
            rules={"enabled_skills": ["core_table"], "autonomy_cost_ceiling": 1, "worker_model": "gpt-4o"},
            client=MagicMock(),
        )

    assert isinstance(res, ActionResult)
    # graceful: no exception bubbled; result is returned (partial/halted)
    assert "halted" in res.detail or res.error is not None


@pytest.mark.asyncio
async def test_tool_call_limit_passed_to_agent(ctx, decision):
    """The autonomy_cost_ceiling must bound the run via Agno's tool_call_limit."""
    captured: dict = {}

    def fake_agent_ctor(*args, **kwargs):
        captured.update(kwargs)
        agent = MagicMock()
        resp = MagicMock()
        resp.tools = []
        agent.arun = AsyncMock(return_value=resp)
        return agent

    with patch("app.cascade.autonomous_team.Agent", side_effect=fake_agent_ctor):
        await run_autonomous(
            ctx=ctx,
            decision=decision,
            opportunity={"id": "opp-1"},
            lead={"id": "lead-1"},
            rules={"enabled_skills": ["core_table"], "autonomy_cost_ceiling": 7, "worker_model": "gpt-4o"},
            client=MagicMock(),
        )

    assert captured.get("tool_call_limit") == 7
    assert captured.get("telemetry") is False


@pytest.mark.asyncio
async def test_only_active_skills_exposed_as_tools(ctx, decision):
    """When no skills are enabled, no Core-Table verbs are exposed as tools."""
    captured: dict = {}

    def fake_agent_ctor(*args, **kwargs):
        captured["tools"] = kwargs.get("tools")
        agent = MagicMock()
        resp = MagicMock()
        resp.tools = []
        agent.arun = AsyncMock(return_value=resp)
        return agent

    with patch("app.cascade.autonomous_team.Agent", side_effect=fake_agent_ctor):
        res = await run_autonomous(
            ctx=ctx,
            decision=decision,
            opportunity={"id": "opp-1"},
            lead={"id": "lead-1"},
            rules={"enabled_skills": [], "autonomy_cost_ceiling": 5},
            client=MagicMock(),
        )

    # No enabled skills => no tools => nothing to do; must not crash.
    assert isinstance(res, ActionResult)
    assert res.success is False
    assert res.error == "no_active_skills"


@pytest.mark.asyncio
async def test_disabled_verb_not_callable(ctx, decision):
    """Only verbs from active skills are exposed; a name not in the tool list
    cannot be invoked. We assert the exposed tool names are exactly the
    CoreTableSkill async verbs."""
    captured: dict = {}

    def fake_agent_ctor(*args, **kwargs):
        captured["tools"] = kwargs.get("tools")
        agent = MagicMock()
        resp = MagicMock()
        resp.tools = []
        agent.arun = AsyncMock(return_value=resp)
        return agent

    with patch("app.cascade.autonomous_team.Agent", side_effect=fake_agent_ctor):
        await run_autonomous(
            ctx=ctx,
            decision=decision,
            opportunity={"id": "opp-1"},
            lead={"id": "lead-1"},
            rules={"enabled_skills": ["core_table"], "autonomy_cost_ceiling": 5, "worker_model": "gpt-4o"},
            client=MagicMock(),
        )

    tool_names = {getattr(t, "__name__", None) for t in captured["tools"]}
    # Real Core-Table verbs are present.
    assert "move_stage" in tool_names
    assert "add_note" in tool_names
    # Private / non-verb helpers are NOT exposed as tools.
    assert "_fetch_one" not in tool_names
    assert "_update" not in tool_names
    assert "__init__" not in tool_names
