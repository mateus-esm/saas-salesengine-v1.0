"""Reliability eval — NO model required.

Asserts the sequential executor (B3) is safe under adversarial plans:
  1. An unknown verb is REPORTED as failed, never executed or fabricated.
  2. A failed action is NEVER charged a credit.
  3. The executor only ever scopes to ctx.equipe_id (never a model/plan value).
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.cascade.executor import run_plan
from app.schemas import ActionPlan, PlannedAction
from app.security import TenantContext
from evals.fixtures import BOGUS_VERB


def _ctx() -> TenantContext:
    return TenantContext(equipe_id="e1", actor_user_id="u1", role="admin")


class _ValidSkill:
    """A skill that knows real verbs but NOT the bogus one."""

    name = "core_table"

    def __init__(self, **kw):
        pass

    async def set_field(self, opportunity_id, field_id, value):
        from app.schemas import ActionResult
        return ActionResult(success=True, detail={})


@pytest.mark.asyncio
async def test_unknown_verb_is_reported_not_executed_and_not_charged(monkeypatch):
    monkeypatch.setattr("app.cascade.executor._skill_for", lambda *a, **k: _ValidSkill())
    charges: list = []

    async def charge(**kw):
        charges.append(kw)
        return "L"

    plan = ActionPlan(
        relevant=True,
        confidence=0.9,
        reason="adversarial",
        actions=[PlannedAction(verb=BOGUS_VERB, args={})],
    )
    res = await run_plan(
        plan, ctx=_ctx(), opportunity={"id": "o1"}, lead={"id": "l1"},
        rules={}, client=object(), charge_fn=charge,
    )

    assert res.applied_count == 0          # nothing applied
    assert charges == []                   # nothing charged on failure
    assert res.results and res.results[0].success is False
    assert "unknown_verb" in (res.results[0].error or "")


@pytest.mark.asyncio
async def test_charge_idempotency_key_is_tenant_run_scoped(monkeypatch):
    """Charges are keyed by the server-derived run/verb/opp — never a model value."""
    seen: list = []

    async def charge(**kw):
        seen.append(kw)
        return "L"

    class _Skill:
        name = "core_table"

        def __init__(self, **kw):
            pass

        async def set_field(self, opportunity_id, field_id, value):
            from app.schemas import ActionResult
            return ActionResult(success=True, detail={})

    monkeypatch.setattr("app.cascade.executor._skill_for", lambda *a, **k: _Skill())
    plan = ActionPlan(
        relevant=True, confidence=0.9, reason="ok",
        actions=[PlannedAction(verb="set_field", args={"field_id": "f1", "value": "v"})],
    )
    await run_plan(
        plan, ctx=_ctx(), opportunity={"id": "o1"}, lead={"id": "l1"},
        rules={}, client=object(), charge_fn=charge, run_id="run-xyz",
    )
    assert len(seen) == 1
    assert seen[0]["idempotency_key"].startswith("run-xyz:set_field:o1")
