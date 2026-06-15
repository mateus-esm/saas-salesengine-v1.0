"""Tests for app.cascade.executor — sequential credit-aware ActionPlan executor."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.cascade.executor import run_plan
from app.credits import InsufficientCredits
from app.schemas import ActionPlan, ActionResult, PlannedAction
from app.security import TenantContext


def _ctx() -> TenantContext:
    return TenantContext(equipe_id="e1", actor_user_id="u1", role="admin")


class _Skill:
    name = "core_table"

    def __init__(self, **kw):
        self.applied = []

    async def set_field(self, opportunity_id, field_id, value):
        self.applied.append(("set_field", field_id))
        return ActionResult(success=True, detail={})

    async def move_stage(self, opportunity_id, stage_type="open", stage_name_hint=None):
        self.applied.append(("move_stage", stage_type))
        return ActionResult(success=True, detail={})


@pytest.mark.asyncio
async def test_runs_actions_in_order_and_charges_each(monkeypatch):
    charges = []

    async def charge(**kw):
        charges.append(kw)
        return "L"

    monkeypatch.setattr("app.cascade.executor._skill_for", lambda *a, **k: _Skill())
    plan = ActionPlan(
        relevant=True,
        confidence=0.9,
        reason="x",
        actions=[
            PlannedAction(verb="set_field", args={"field_id": "f1", "value": "v"}),
            PlannedAction(verb="move_stage", args={"stage_type": "open"}),
        ],
    )
    res = await run_plan(
        plan, ctx=_ctx(), opportunity={"id": "o1"}, lead={"id": "l1"},
        rules={}, client=object(), charge_fn=charge,
    )
    assert [a["ledger"]["verb"] for a in charges] == ["set_field", "move_stage"]
    assert res.applied_count == 2 and res.halted is False


@pytest.mark.asyncio
async def test_halts_on_insufficient_credits(monkeypatch):
    calls = {"n": 0}

    async def charge(**kw):
        calls["n"] += 1
        if calls["n"] == 2:
            raise InsufficientCredits("insufficient_credits")
        return "L"

    monkeypatch.setattr("app.cascade.executor._skill_for", lambda *a, **k: _Skill())
    plan = ActionPlan(
        relevant=True,
        confidence=0.9,
        reason="x",
        actions=[
            PlannedAction(verb="set_field", args={"field_id": "f1", "value": "v"}),
            PlannedAction(verb="move_stage", args={"stage_type": "open"}),
        ],
    )
    res = await run_plan(
        plan, ctx=_ctx(), opportunity={"id": "o1"}, lead={"id": "l1"},
        rules={}, client=object(), charge_fn=charge,
    )
    assert res.applied_count == 1 and res.halted is True and res.halt_reason == "no_credits"


@pytest.mark.asyncio
async def test_confirmation_actions_are_deferred(monkeypatch):
    async def charge(**kw):
        return "L"

    monkeypatch.setattr("app.cascade.executor._skill_for", lambda *a, **k: _Skill())
    plan = ActionPlan(
        relevant=True,
        confidence=0.9,
        reason="x",
        actions=[
            PlannedAction(verb="move_stage", args={"stage_type": "won"}, requires_confirmation=True),
        ],
    )
    res = await run_plan(
        plan, ctx=_ctx(), opportunity={"id": "o1"}, lead={"id": "l1"},
        rules={}, client=object(), charge_fn=charge,
    )
    assert res.applied_count == 0 and len(res.pending_confirmations) == 1
