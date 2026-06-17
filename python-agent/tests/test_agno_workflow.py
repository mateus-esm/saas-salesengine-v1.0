import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from app.cascade.executor import ExecResult
from app.schemas import ActionPlan, ActionResult, PlannedAction, RouteDecision
from app.security import TenantContext


def _ctx() -> TenantContext:
    return TenantContext(equipe_id="e1", actor_user_id="u1", role="authenticated")


def _patch_common(monkeypatch, *, floor_plan, exec_res, settings=None):
    """Patch every run_workflow seam so the assembly runs without a DB or LLM.

    Returns the list of recorded decisions so tests can assert on what landed.
    """
    from app.cascade import agno_workflow as wf

    settings = settings or SimpleNamespace(doorman_model="cheap-model")
    opportunity = {"id": "o1", "equipe_id": "e1", "lead_id": "l1",
                   "pipeline_id": "p1", "stage_id": "s1", "status": "open"}

    async def fake_route(**kw):
        return RouteDecision(contact_type="lead", pipeline_id="p1", stage_id="s1",
                             confidence=0.9, reason="ok")

    async def fake_enrich(**kw):
        return ActionPlan(relevant=False, actions=[], confidence=0.0, reason="no enrichment")

    async def fake_triage(**kw):
        return floor_plan

    async def fake_run_plan(*a, **kw):
        return exec_res

    recorded: list[dict] = []

    def fake_record(client, **kw):
        recorded.append(kw)
        return f"dec-{len(recorded)}"

    class _FakeSkill:
        def __init__(self, **kw):
            self.notes = []

        async def add_note(self, lead_id, text):
            self.notes.append((lead_id, text))
            return ActionResult(success=True, detail={})

    monkeypatch.setattr(wf, "get_settings", lambda: settings)
    monkeypatch.setattr(wf, "_load_context",
                        lambda *a, **k: ({"id": "l1"}, "oi", {}, opportunity, []))
    monkeypatch.setattr(wf, "_classify_and_route", fake_route)
    monkeypatch.setattr(wf, "_enrich", fake_enrich)
    monkeypatch.setattr(wf, "_triage_plan", fake_triage)
    monkeypatch.setattr(wf, "_run_plan", fake_run_plan)
    monkeypatch.setattr(wf, "_record_decision", fake_record)
    monkeypatch.setattr(wf, "CoreTableSkill", _FakeSkill)
    return recorded


@pytest.mark.asyncio
async def test_public_run_cascade_delegates_when_flag_enabled(monkeypatch):
    from app.cascade import workflow

    class Settings:
        copilot_workflow_enabled = True

    async def fake_workflow(**kwargs):
        return {"status": "workflow", "decision_id": "d2", "result": None}

    monkeypatch.setattr(workflow, "get_settings", lambda: Settings())
    monkeypatch.setattr("app.cascade.agno_workflow.run_workflow", fake_workflow)

    ctx = TenantContext(equipe_id="e1", actor_user_id="u1", role="authenticated")
    out = await workflow.run_cascade(
        ctx=ctx,
        lead_id="l1",
        opportunity_id=None,
        pipeline_id=None,
        trigger="sync",
        client=object(),
    )

    assert out["status"] == "workflow"


@pytest.mark.asyncio
async def test_multi_action_plan_applies_both_and_executes(monkeypatch):
    from app.cascade import agno_workflow as wf

    floor_plan = ActionPlan(
        relevant=True, confidence=0.9, reason="enrich then advance",
        actions=[
            PlannedAction(verb="set_field", args={"field_id": "f1", "value": "v"}),
            PlannedAction(verb="move_stage", args={"stage_type": "open"}),
        ],
    )
    exec_res = ExecResult(
        applied_count=2,
        results=[ActionResult(success=True), ActionResult(success=True)],
    )
    recorded = _patch_common(monkeypatch, floor_plan=floor_plan, exec_res=exec_res)

    out = await wf.run_workflow(
        ctx=_ctx(), lead_id="l1", opportunity_id="o1", pipeline_id="p1",
        trigger="sync", client=object(),
    )

    assert out["status"] == "executed"
    assert out["applied_count"] == 2
    assert out["decision_id"] is not None
    # exactly one "action" decision recorded for the applied verbs
    actions = [r for r in recorded if r["decision_type"] == "action"]
    assert len(actions) == 1 and actions[0]["status"] == "executed"


@pytest.mark.asyncio
async def test_high_stakes_won_move_pends_for_approval(monkeypatch):
    from app.cascade import agno_workflow as wf

    won = PlannedAction(verb="move_stage", args={"stage_type": "won"},
                        requires_confirmation=True)
    floor_plan = ActionPlan(relevant=True, confidence=0.9, reason="close won",
                            actions=[won])
    exec_res = ExecResult(applied_count=0, pending_confirmations=[won])
    recorded = _patch_common(monkeypatch, floor_plan=floor_plan, exec_res=exec_res)

    # router present but does not escalate (chosen == floor model)
    monkeypatch.setattr(wf, "select_model", lambda *a, **k: "cheap-model")

    out = await wf.run_workflow(
        ctx=_ctx(), lead_id="l1", opportunity_id="o1", pipeline_id="p1",
        trigger="sync", client=object(),
    )

    assert out["status"] == "pending_approval"
    assert out["pending"] == 1
    pending = [r for r in recorded if r["status"] == "pending_approval"]
    assert len(pending) == 1
    assert pending[0]["output_action"]["requires_confirmation"] is True


@pytest.mark.asyncio
async def test_cost_router_escalates_won_leaf_to_strategic(monkeypatch):
    from app.cascade import agno_workflow as wf

    won = PlannedAction(verb="move_stage", args={"stage_type": "won"},
                        requires_confirmation=True)
    floor_plan = ActionPlan(relevant=True, confidence=0.6, reason="close won",
                            actions=[won])
    exec_res = ExecResult(applied_count=0, pending_confirmations=[won])
    _patch_common(monkeypatch, floor_plan=floor_plan, exec_res=exec_res)

    # router escalates the high-stakes leaf to a strategic model
    monkeypatch.setattr(wf, "select_model", lambda *a, **k: "strategic-x")
    built: list[str] = []

    def fake_build(model_id):
        built.append(model_id)
        return SimpleNamespace(id=model_id)

    monkeypatch.setattr(wf, "build_reasoning_model", fake_build)

    out = await wf.run_workflow(
        ctx=_ctx(), lead_id="l1", opportunity_id="o1", pipeline_id="p1",
        trigger="sync", client=object(),
    )

    assert built == ["strategic-x"]          # strategic reasoning model was constructed
    assert out["model"] == "strategic-x"     # ledger model reflects the escalation


# ─── T4: Intent Omission Guard ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_intent_omission_guard_records_pending_approval_when_no_actions_but_intent_detected(
    monkeypatch,
):
    """When floor triage returns an empty plan with intent_detected=True, run_workflow
    must record a pending_approval decision whose output_action contains
    intent_detected=True and return status='pending_approval'."""
    from app.cascade import agno_workflow as wf

    # Floor plan: no actions but intent was detected
    floor_plan = ActionPlan(
        relevant=False,
        actions=[],
        confidence=0.45,
        reason="Nenhuma ação automática, mas intenção de agendamento detectada.",
        intent_detected=True,
        intent_keyword="reunião",
    )
    # exec_res won't matter since the guard should fire before execution
    exec_res = None

    recorded = _patch_common(monkeypatch, floor_plan=floor_plan, exec_res=exec_res)

    out = await wf.run_workflow(
        ctx=_ctx(), lead_id="l1", opportunity_id="o1", pipeline_id="p1",
        trigger="sync", client=object(),
    )

    assert out["status"] == "pending_approval"

    # Exactly one pending_approval decision recorded by the guard
    pending = [r for r in recorded if r.get("status") == "pending_approval"]
    assert len(pending) >= 1

    guard_decision = next(
        (r for r in pending if r.get("output_action", {}).get("intent_detected") is True),
        None,
    )
    assert guard_decision is not None, (
        "Expected a pending_approval decision with output_action.intent_detected=True"
    )
    assert guard_decision["output_action"].get("intent_keyword") == "reunião"
