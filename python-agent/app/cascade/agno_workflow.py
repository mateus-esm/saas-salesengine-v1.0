"""Agno Workflow backbone (keystone) — Sprint 6.1 Wave 2 assembly.

The declarative cascade behind ``COPILOT_WORKFLOW_ENABLED``:

    ① load lead / conversation / rules / opportunity / pipelines
    ② pre-filter (sync always proceeds; background skips irrelevant)
    ③ Tower(cheap) classify & route → resolve / create opportunity
    ④ Enricher(cheap) → set_field/set_contact_field actions
    ⑤ Floor(cheap) → ActionPlan (intent actions, high-stakes flagged)
    ⑥ Router(select_tier): cheap stays; strategic RE-PLANS the high-stakes leaf
       on ``build_reasoning_model`` (proving the cost lever)
    ⑦ executor.run_plan(charge_fn=charge_credit, emit=emit) — sequential, metered
    ⑧ pending_confirmations → record_decision(pending_approval) + add_note (HITL)
    ⑨ record the executed/failed decision for applied actions

Every module-level seam (``_load_context``, ``_classify_and_route``, ``_enrich``,
``_triage_plan``, ``_run_plan``, ``_record_decision``, ``_charge_credit``,
``build_reasoning_model``, ``select_model``) is referenced by name so tests can
monkeypatch them without a live DB or LLM.

The legacy ``run_cascade`` stays the default until the Wave-5 parity cutover.
"""
from __future__ import annotations

from typing import Any
from uuid import uuid4

from app.audit import record_decision as _record_decision
from app.cascade.enricher import enrich as _enrich
from app.cascade.executor import run_plan as _run_plan
from app.cascade.floor_doorman import _is_high_stakes, triage_plan as _triage_plan
from app.cascade.tower_doorman import classify_and_route as _classify_and_route
from app.cascade.worker import is_pipeline_relevant
from app.cognition.router import Stakes, select_model
from app.config import get_settings
from app.credits import charge_credit as _charge_credit
from app.llm import build_reasoning_model
from app.schemas import ActionPlan, PlannedAction
from app.security import TenantContext
from app.skills.core_table import CoreTableSkill

_DEFAULT_CONFIDENCE_THRESHOLD = 0.75
_HIGH_STAKES_STAGES = frozenset({"won", "lost"})


async def _legacy_run_cascade(**kwargs: Any) -> dict:
    """Fallback to the hand-rolled cascade (kept for the parity cutover)."""
    from app.cascade.workflow import _run_legacy_cascade

    return await _run_legacy_cascade(**kwargs)


def _load_context(
    client: Any,
    equipe_id: str,
    lead_id: str,
    opportunity_id: str | None,
    pipeline_id: str | None,
) -> tuple[dict, str, dict, dict | None, list[dict]]:
    """Load everything the cascade needs (reuses the legacy loaders)."""
    from app.cascade import workflow as _legacy

    lead = _legacy._load_lead(client, equipe_id, lead_id) or {"id": lead_id}
    conversation = _legacy._load_conversation(client, equipe_id, lead_id)
    rules = _legacy._load_rules(client, equipe_id, pipeline_id)
    opportunity = (
        _legacy._load_opportunity(client, equipe_id, opportunity_id) if opportunity_id else None
    )
    pipelines = _legacy._load_pipelines(client, equipe_id)
    return lead, conversation, rules, opportunity, pipelines


def _deal_value(opportunity: dict | None) -> float | None:
    if not opportunity:
        return None
    for key in ("value", "deal_value", "amount"):
        raw = opportunity.get(key)
        if raw is not None:
            try:
                return float(raw)
            except (TypeError, ValueError):
                continue
    custom = opportunity.get("custom_data") or {}
    raw = custom.get("value") if isinstance(custom, dict) else None
    try:
        return float(raw) if raw is not None else None
    except (TypeError, ValueError):
        return None


def _stage_type_of(plan: ActionPlan) -> str:
    """Derive the highest-stakes stage_type the plan would move into."""
    for action in plan.actions:
        stage = (action.args or {}).get("stage_type") or (action.args or {}).get("status")
        if stage in _HIGH_STAKES_STAGES:
            return stage
    return "open"


def _combine(enrich_plan: ActionPlan, floor_plan: ActionPlan) -> ActionPlan:
    """Enrichment actions first, then intent actions — one ordered pulse."""
    actions: list[PlannedAction] = [*enrich_plan.actions, *floor_plan.actions]
    return ActionPlan(
        relevant=bool(actions),
        actions=actions,
        automation_kind=floor_plan.automation_kind,
        urgency=floor_plan.urgency,
        confidence=floor_plan.confidence,
        reason=floor_plan.reason,
    )


async def run_workflow(
    *,
    ctx: TenantContext,
    lead_id: str,
    opportunity_id: str | None,
    pipeline_id: str | None,
    trigger: str,
    client: Any = None,
    emit: Any = None,
) -> dict:
    """Run the multi-action, cost-tiered, metered cascade via the Workflow path."""
    if client is None:
        from app.db import get_service_client

        client = get_service_client()

    settings = get_settings()
    equipe_id = ctx.equipe_id
    actor = (ctx.actor_user_id or "copilot") if trigger == "sync" else "copilot"
    mode = "manual" if trigger == "sync" else "auto"
    run_id = str(uuid4())

    # ─── ① Load ─────────────────────────────────────────────────────────────
    lead, conversation, rules, opportunity, pipelines = _load_context(
        client, equipe_id, lead_id, opportunity_id, pipeline_id
    )
    threshold = float(rules.get("confidence_threshold") or _DEFAULT_CONFIDENCE_THRESHOLD)

    # ─── ② Pre-filter ───────────────────────────────────────────────────────
    if trigger != "sync" and not is_pipeline_relevant(conversation):
        return {"status": "skipped_irrelevant", "decision_id": None, "result": None}

    # ─── ③ Tower: classify & route ──────────────────────────────────────────
    tower_model = rules.get("doorman_model") or settings.doorman_model
    route = await _classify_and_route(
        ctx=ctx, conversation=conversation, lead=lead, pipelines=pipelines, model_id=tower_model
    )
    if route.contact_type in {"spam", "other"}:
        return {"status": "skipped_spam", "decision_id": None, "result": None}

    if opportunity is None:
        target_pipeline_id = route.pipeline_id
        if not target_pipeline_id:
            return {"status": "not_routed", "decision_id": None, "result": None}
        if route.confidence >= threshold or trigger == "sync":
            skill = CoreTableSkill(client=client, equipe_id=equipe_id, actor=actor)
            created = await skill.create_opportunity(lead_id, target_pipeline_id, route.stage_id)
            if not created.success:
                return {"status": "route_failed", "decision_id": None, "result": created}
            detail = created.detail or {}
            opportunity = {
                "id": detail.get("opportunity_id"),
                "equipe_id": equipe_id,
                "lead_id": lead_id,
                "pipeline_id": detail.get("pipeline_id", target_pipeline_id),
                "stage_id": detail.get("stage_id", route.stage_id),
                "status": "open",
            }
        else:
            decision_id = _record_decision(
                client,
                equipe_id=equipe_id,
                lead_id=lead_id,
                opportunity_id=None,
                pipeline_id=target_pipeline_id,
                agent_role="tower_doorman",
                decision_type="route",
                output_action={
                    "contact_type": route.contact_type,
                    "pipeline_id": target_pipeline_id,
                    "stage_id": route.stage_id,
                    "extracted": route.extracted,
                    "reason": route.reason,
                },
                confidence=route.confidence,
                status="pending_approval",
                actor=actor,
            )
            return {"status": "pending_approval", "decision_id": decision_id, "result": None}

    opp_id = opportunity.get("id") if opportunity else None
    pipe_id = (opportunity.get("pipeline_id") if opportunity else None) or pipeline_id
    floor_model = rules.get("doorman_model") or settings.doorman_model

    # ─── ④ Enricher (cheap) ─────────────────────────────────────────────────
    enrich_plan = await _enrich(
        ctx=ctx, conversation=conversation, lead=lead, opportunity=opportunity,
        rules=rules, client=client,
    )

    # ─── ⑤ Floor: multi-action plan (cheap) ─────────────────────────────────
    floor_plan = await _triage_plan(
        ctx=ctx, conversation=conversation, opportunity=opportunity,
        pipeline_rules=rules, model_id=floor_model,
    )

    # ─── ⑥ Cost Router: escalate high-stakes leaf to the strategic tier ──────
    model_used = floor_model
    high_stakes = any(_is_high_stakes(a) for a in floor_plan.actions)
    if high_stakes:
        stakes = Stakes(
            stage_type=_stage_type_of(floor_plan),
            deal_value=_deal_value(opportunity),
            cheap_confidence=floor_plan.confidence,
        )
        chosen = select_model(stakes, rules, settings)
        if chosen and chosen != floor_model:
            strategic_model = build_reasoning_model(chosen)
            model_used = chosen
            floor_plan = await _triage_plan(
                ctx=ctx, conversation=conversation, opportunity=opportunity,
                pipeline_rules=rules, model_id=chosen, model=strategic_model,
            )

    # ─── ⑦ Execute: sequential, credit-metered ──────────────────────────────
    combined = _combine(enrich_plan, floor_plan)

    async def _charge(*, equipe_id: str, idempotency_key: str, ledger: dict) -> str:
        ledger = {**ledger, "model": model_used, "decision_id": ""}
        return await _charge_credit(
            client, equipe_id=equipe_id, idempotency_key=idempotency_key, ledger=ledger
        )

    exec_res = await _run_plan(
        combined, ctx=ctx, opportunity=opportunity, lead=lead, rules=rules,
        client=client, charge_fn=_charge, mode=mode, run_id=run_id, emit=emit,
    )

    decision_ids: list[str] = []

    # ─── ⑨ Record applied actions ───────────────────────────────────────────
    if exec_res.applied_count > 0:
        all_ok = all(r.success for r in exec_res.results) and not exec_res.halted
        final_status = "executed" if all_ok else "failed"
        did = _record_decision(
            client,
            equipe_id=equipe_id,
            lead_id=lead_id,
            opportunity_id=opp_id,
            pipeline_id=pipe_id,
            agent_role="floor_doorman",
            decision_type="action",
            output_action={
                "applied": exec_res.applied_count,
                "model": model_used,
                "verbs": [a.verb for a in combined.actions if not a.requires_confirmation],
                "reason": combined.reason,
                "halted": exec_res.halted,
            },
            confidence=floor_plan.confidence,
            status=final_status,
            actor=actor,
            error_details=None if all_ok else "one or more verbs failed or halted",
        )
        decision_ids.append(did)

    # ─── ⑧ HITL: defer high-stakes actions to approval ──────────────────────
    for action in exec_res.pending_confirmations:
        did = _record_decision(
            client,
            equipe_id=equipe_id,
            lead_id=lead_id,
            opportunity_id=opp_id,
            pipeline_id=pipe_id,
            agent_role="floor_doorman",
            decision_type="action",
            output_action={
                "verb": action.verb,
                "args": action.args,
                "skill": action.skill,
                "model": model_used,
                "requires_confirmation": True,
            },
            confidence=floor_plan.confidence,
            status="pending_approval",
            actor=actor,
        )
        decision_ids.append(did)

    if exec_res.pending_confirmations:
        skill = CoreTableSkill(client=client, equipe_id=equipe_id, actor=actor)
        verbs = ", ".join(a.verb for a in exec_res.pending_confirmations)
        await skill.add_note(lead_id, f"[Copilot] Ações pendentes de aprovação: {verbs}")

    # ─── Outcome ────────────────────────────────────────────────────────────
    if exec_res.halted:
        status = "halted_no_credits"
    elif exec_res.applied_count > 0:
        status = "executed"
    elif exec_res.pending_confirmations:
        status = "pending_approval"
    else:
        status = "no_action"

    return {
        "status": status,
        "decision_id": decision_ids[0] if decision_ids else None,
        "decision_ids": decision_ids,
        "result": exec_res,
        "applied_count": exec_res.applied_count,
        "pending": len(exec_res.pending_confirmations),
        "model": model_used,
        "run_id": run_id,
    }
