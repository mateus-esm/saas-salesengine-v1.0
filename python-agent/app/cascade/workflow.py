"""JTBD 3 — E6 Agno Workflow cascade orchestration.

Wires the two doormen and the worker into the §P5/E6 cascade:

    ① load lead / conversation / per-pipeline rules (+ opportunity, pipelines)
    ② pre-filter (skip irrelevant background conversations; sync always proceeds)
    ③ Tower route → (E1 spam fold-in) → create / resolve opportunity
       → Floor triage → confidence gate → Worker (may escalate to E4) / pending+notify

This module ONLY orchestrates. All classification lives in the doormen, all
mutations route through the worker / Core-Table, and every actionable outcome is
audited via ``record_decision``.
"""

from __future__ import annotations

from typing import Any

from app.audit import record_decision
from app.cascade.floor_doorman import triage_intent
from app.cascade.tower_doorman import classify_and_route
from app.cascade.worker import is_pipeline_relevant, run_worker
from app.config import get_settings
from app.schemas import IntentDecision, RouteDecision
from app.security import TenantContext
from app.skills.core_table import CoreTableSkill

# Sensible defaults when a pipeline has no pipeline_agent_rules row.
_DEFAULT_CONFIDENCE_THRESHOLD = 0.75
_RECENT_MESSAGE_LIMIT = 30


def _execute(query: Any) -> Any:
    response = query.execute()
    error = getattr(response, "error", None)
    if error:
        raise RuntimeError(str(error))
    return getattr(response, "data", None)


def _rows(query: Any) -> list[dict[str, Any]]:
    data = _execute(query)
    if data is None:
        return []
    if isinstance(data, list):
        return data
    return [data]


def _first(query: Any) -> dict[str, Any] | None:
    rows = _rows(query)
    return rows[0] if rows else None


def _load_lead(client: Any, equipe_id: str, lead_id: str) -> dict[str, Any] | None:
    query = (
        client.table("leads")
        .select("*")
        .eq("equipe_id", equipe_id)
        .eq("id", lead_id)
        .limit(1)
    )
    return _first(query)


def _load_opportunity(client: Any, equipe_id: str, opportunity_id: str) -> dict[str, Any] | None:
    query = (
        client.table("opportunities")
        .select("*")
        .eq("equipe_id", equipe_id)
        .eq("id", opportunity_id)
        .limit(1)
    )
    return _first(query)


def _load_rules(client: Any, equipe_id: str, pipeline_id: str | None) -> dict[str, Any]:
    rules: dict[str, Any] | None = None
    if pipeline_id:
        query = (
            client.table("pipeline_agent_rules")
            .select("*")
            .eq("equipe_id", equipe_id)
            .eq("pipeline_id", pipeline_id)
            .limit(1)
        )
        rules = _first(query)

    resolved = dict(rules or {})
    # Tolerate missing rows / null columns with sensible defaults.
    if resolved.get("confidence_threshold") is None:
        resolved["confidence_threshold"] = _DEFAULT_CONFIDENCE_THRESHOLD
    if resolved.get("enabled_skills") is None:
        resolved["enabled_skills"] = []
    resolved.setdefault("autonomy_cost_ceiling", None)
    return resolved


def _load_pipelines(client: Any, equipe_id: str) -> list[dict[str, Any]]:
    query = (
        client.table("pipelines")
        .select("id,name,description")
        .eq("equipe_id", equipe_id)
    )
    return _rows(query)


def _load_conversation(client: Any, equipe_id: str, lead_id: str) -> str:
    """Build a recent-message transcript for the lead.

    Source: ``public.messages`` (lead-scoped chat). We order by recency, take the
    most recent slice, and render oldest→newest so the doormen read it naturally.
    Returns "" when there are no messages (treated as irrelevant by the prefilter).
    """
    query = (
        client.table("messages")
        .select("content,sender_type,created_at")
        .eq("lead_id", lead_id)
        .order("created_at", desc=True)
        .limit(_RECENT_MESSAGE_LIMIT)
    )
    rows = _rows(query)
    rows = list(reversed(rows))  # oldest → newest

    lines: list[str] = []
    for row in rows:
        content = (row.get("content") or "").strip()
        if not content:
            continue
        sender = row.get("sender_type") or "system"
        lines.append(f"[{sender}] {content}")
    return "\n".join(lines)


def _resolve_actor(ctx: TenantContext, trigger: str) -> str:
    if trigger == "sync":
        return ctx.actor_user_id or "copilot"
    return "copilot"


def _output_action_for_decision(decision: IntentDecision) -> dict[str, Any]:
    """Pick the JSON-safe payload we persist as the decision's output_action."""
    if decision.args:
        action = dict(decision.args)
    else:
        action = {"summary": decision.reason}
    action.setdefault("skill", decision.skill)
    action.setdefault("automation_kind", decision.automation_kind)
    return action


async def run_cascade(
    *,
    ctx: TenantContext,
    lead_id: str,
    opportunity_id: str | None,
    pipeline_id: str | None,
    trigger: str,
    client: Any = None,
) -> dict:
    """Run the full E6 cascade for one lead/opportunity.

    Returns a dict like ``{"status": ..., "decision_id": ..., "result": ...}``.
    """
    if client is None:
        from app.db import get_service_client

        client = get_service_client()

    equipe_id = ctx.equipe_id
    actor = _resolve_actor(ctx, trigger)

    # ─── ① Load ────────────────────────────────────────────────────────────
    lead = _load_lead(client, equipe_id, lead_id) or {"id": lead_id}
    conversation = _load_conversation(client, equipe_id, lead_id)
    rules = _load_rules(client, equipe_id, pipeline_id)
    threshold = float(rules.get("confidence_threshold") or _DEFAULT_CONFIDENCE_THRESHOLD)

    opportunity: dict[str, Any] | None = None
    if opportunity_id:
        opportunity = _load_opportunity(client, equipe_id, opportunity_id)

    pipelines = _load_pipelines(client, equipe_id)

    # ─── ② Pre-filter ──────────────────────────────────────────────────────
    if trigger != "sync" and not is_pipeline_relevant(conversation):
        return {"status": "skipped_irrelevant", "decision_id": None, "result": None}

    # ─── ③ Tower: classify & route ─────────────────────────────────────────
    tower_model = rules.get("doorman_model") or get_settings().doorman_model
    route: RouteDecision = await classify_and_route(
        ctx=ctx,
        conversation=conversation,
        lead=lead,
        pipelines=pipelines,
        model_id=tower_model,
    )

    # E1 spam-guard fold-in (here, not in tower_doorman): never route spam/other.
    if route.contact_type in {"spam", "other"}:
        route = route.model_copy(update={"pipeline_id": None, "stage_id": None})
        return {"status": "skipped_spam", "decision_id": None, "result": None}

    # Resolve / create the opportunity we'll triage on.
    if opportunity is None:
        target_pipeline_id = route.pipeline_id
        if not target_pipeline_id:
            # No pipeline to route into — nothing actionable.
            return {"status": "not_routed", "decision_id": None, "result": None}

        if route.confidence >= threshold or trigger == "sync":
            skill = CoreTableSkill(client=client, equipe_id=equipe_id, actor=actor)
            created = await skill.create_opportunity(
                lead_id, target_pipeline_id, route.stage_id
            )
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
            # Not confident enough to auto-route in the background → queue for approval.
            decision_id = record_decision(
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

    # ─── ④ Floor: triage intent on the (now-known) opportunity ─────────────
    floor_model = rules.get("doorman_model") or get_settings().doorman_model
    decision: IntentDecision = await triage_intent(
        ctx=ctx,
        conversation=conversation,
        opportunity=opportunity,
        pipeline_rules=rules,
        model_id=floor_model,
    )

    opp_id = opportunity.get("id") if opportunity else None
    pipe_id = opportunity.get("pipeline_id") if opportunity else pipeline_id

    # ─── ⑤ Gate on confidence (sync forces auto-apply) ─────────────────────
    if decision.confidence >= threshold or trigger == "sync":
        result = await run_worker(
            ctx=ctx,
            decision=decision,
            opportunity=opportunity,
            lead=lead,
            rules=rules,
            client=client,
        )
        decision_id = record_decision(
            client,
            equipe_id=equipe_id,
            lead_id=lead_id,
            opportunity_id=opp_id,
            pipeline_id=pipe_id,
            agent_role="floor_doorman",
            decision_type="action",
            output_action=_output_action_for_decision(decision),
            confidence=decision.confidence,
            status="executed",
            actor=actor,
        )
        return {"status": "executed", "decision_id": decision_id, "result": result}

    # Below threshold (background) → queue for approval and notify.
    output_action = _output_action_for_decision(decision)
    if decision.urgency == "urgent":
        output_action["urgent"] = True  # flags the decision for Realtime surfacing.

    decision_id = record_decision(
        client,
        equipe_id=equipe_id,
        lead_id=lead_id,
        opportunity_id=opp_id,
        pipeline_id=pipe_id,
        agent_role="floor_doorman",
        decision_type="action",
        output_action=output_action,
        confidence=decision.confidence,
        status="pending_approval",
        actor=actor,
    )

    # "Notify": leave a note on the lead so the operator sees the pending action.
    skill = CoreTableSkill(client=client, equipe_id=equipe_id, actor=actor)
    note_prefix = "[Copilot · URGENTE] " if decision.urgency == "urgent" else "[Copilot] "
    await skill.add_note(
        lead_id,
        f"{note_prefix}Ação pendente de aprovação: {decision.reason}",
    )

    return {"status": "pending_approval", "decision_id": decision_id, "result": None}
