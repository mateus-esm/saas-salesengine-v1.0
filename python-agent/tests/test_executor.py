"""Tests for app.cascade.executor — sequential credit-aware ActionPlan executor."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.cascade.executor import run_plan
from app.cascade.field_dictionary import FieldDef
from app.credits import InsufficientCredits
from app.schemas import ActionPlan, ActionResult, PlannedAction
from app.security import TenantContext


def _ctx() -> TenantContext:
    return TenantContext(equipe_id="e1", actor_user_id="u1", role="admin")


# ---------------------------------------------------------------------------
# Fake client that returns a custom_fields_schema for pipeline "p1"
# (used by tests that need the field-write guard to pass through set_field)
# ---------------------------------------------------------------------------

class _FakeQuery:
    """Minimal Supabase-style query builder that returns a pre-canned response."""

    def __init__(self, rows):
        self._rows = rows

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        class _R:
            pass
        r = _R()
        r.data = self._rows
        return r


class _FakeClient:
    """Supabase client stub that serves a known custom_fields_schema for pipeline p1."""

    def table(self, name):
        if name == "pipelines":
            return _FakeQuery([
                {"custom_fields_schema": [
                    {"field_id": "f1", "label": "Field 1", "type": "text"},
                    {"field_id": "f_valor", "label": "Valor", "type": "currency"},
                    {"field_id": "f_conta", "label": "Conta", "type": "file"},
                ]}
            ])
        return _FakeQuery([])


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
        plan, ctx=_ctx(), opportunity={"id": "o1", "pipeline_id": "p1"}, lead={"id": "l1"},
        rules={}, client=_FakeClient(), charge_fn=charge,
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
        plan, ctx=_ctx(), opportunity={"id": "o1", "pipeline_id": "p1"}, lead={"id": "l1"},
        rules={}, client=_FakeClient(), charge_fn=charge,
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


@pytest.mark.asyncio
async def test_invented_field_dropped_real_field_dispatched(monkeypatch):
    """Field-write guard: invented field_id is dropped (not dispatched, not charged);
    a known field_id in the same plan executes normally."""
    charges = []
    emitted = []

    async def charge(**kw):
        charges.append(kw)
        return "L"

    async def emit(event, data):
        emitted.append((event, data))

    skill_instance = _Skill()
    monkeypatch.setattr("app.cascade.executor._skill_for", lambda *a, **k: skill_instance)

    plan = ActionPlan(
        relevant=True,
        confidence=0.9,
        reason="x",
        actions=[
            # Known field — should be dispatched and charged.
            PlannedAction(verb="set_field", args={"field_id": "f_valor", "value": "1000"}),
            # Invented field — should be silently dropped.
            PlannedAction(verb="set_field", args={"field_id": "ghost", "value": "x"}),
        ],
    )
    res = await run_plan(
        plan,
        ctx=_ctx(),
        opportunity={"id": "o1", "pipeline_id": "p1"},
        lead={"id": "l1"},
        rules={},
        client=_FakeClient(),
        charge_fn=charge,
        emit=emit,
    )

    # Only the valid set_field was dispatched and charged.
    assert res.applied_count == 1
    assert res.halted is False
    charged_verbs = [c["ledger"]["verb"] for c in charges]
    assert charged_verbs == ["set_field"]

    # The ghost field triggered a dropped_unknown_field event.
    dropped_events = [e for e in emitted if e[0] == "dropped_unknown_field"]
    assert len(dropped_events) == 1
    assert dropped_events[0][1]["args"]["field_id"] == "ghost"

    # The ghost field_id never reached the skill.
    dispatched_field_ids = [call[1] for call in skill_instance.applied]
    assert "ghost" not in dispatched_field_ids
    assert "f_valor" in dispatched_field_ids
