"""§P5/E9 — Approvals router.

POST /approvals/{decision_id}/resolve  (E10 mounts under /api/v1)

Lets an operator approve or reject a pending Copilot decision.

- approve: reconstructs the stored IntentDecision from output_action, calls
  run_worker, and flips the row to "executed" (or "failed" on error).
- reject: flips the row to "rejected" without any mutation.

Auth: Depends(get_tenant_context) — JWT → TenantContext with equipe_id.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.cascade.worker import run_worker
from app.db import get_service_client
from app.deps import get_tenant_context
from app.guards import GuardError, assert_equipe
from app.schemas import ActionResult, IntentDecision
from app.security import TenantContext

router = APIRouter(prefix="/approvals", tags=["approvals"])


# ---------------------------------------------------------------------------
# Request body
# ---------------------------------------------------------------------------


class ResolveRequest(BaseModel):
    action: Literal["approve", "reject"]


# ---------------------------------------------------------------------------
# POST /{decision_id}/resolve
# ---------------------------------------------------------------------------


@router.post("/{decision_id}/resolve")
async def resolve_decision(
    decision_id: str,
    body: ResolveRequest,
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
) -> dict:
    """Approve or reject a pending Copilot decision.

    Steps:
      1. Load the ai_decisions row scoped by (id, equipe_id) → 404 if missing.
      2. assert_equipe for defense-in-depth → 403 if cross-tenant.
      3a. approve → reconstruct IntentDecision from output_action → run_worker
          → update status to "executed" or "failed", set resolved_by/resolved_at.
      3b. reject → set status "rejected", resolved_by, resolved_at. No worker call.

    Unknown action is rejected at the Pydantic layer (Literal["approve","reject"]) → 422.
    """
    client = get_service_client()
    now = datetime.now(timezone.utc).isoformat()

    # ── 1. Load row (filter by id + equipe_id so cross-tenant simply 404s) ──
    response = (
        client.table("ai_decisions")
        .select("*")
        .eq("id", decision_id)
        .eq("equipe_id", ctx.equipe_id)
        .limit(1)
        .execute()
    )
    rows = getattr(response, "data", None) or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Decision '{decision_id}' not found for this tenant.",
        )
    row: dict = rows[0]

    # ── 2. assert_equipe (defense-in-depth; shouldn't fire after the eq filter) ──
    try:
        assert_equipe(row, ctx.equipe_id)
    except GuardError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc

    # ── 3a. approve ─────────────────────────────────────────────────────────
    if body.action == "approve":
        decision = _reconstruct_intent_decision(row)

        opportunity_id = row.get("opportunity_id")
        lead_id = row.get("lead_id")

        # Minimal dicts so run_worker can inject opportunity_id / lead_id via
        # its inspect-based parameter injection if the skill needs them.
        opportunity: dict | None = {"id": opportunity_id} if opportunity_id else None
        lead: dict | None = {"id": lead_id} if lead_id else None

        result: ActionResult = await run_worker(
            ctx=ctx,
            decision=decision,
            opportunity=opportunity,
            lead=lead,
            rules={},
            client=client,
        )

        new_status = "executed" if result.success else "failed"
        client.table("ai_decisions").update(
            {
                "status": new_status,
                "resolved_by": ctx.actor_user_id,
                "resolved_at": now,
            }
        ).eq("id", decision_id).execute()

        return {
            "decision_id": decision_id,
            "status": new_status,
            "result": result.model_dump(),
        }

    # ── 3b. reject ──────────────────────────────────────────────────────────
    # body.action == "reject" (Literal guarantees only approve/reject reach here)
    client.table("ai_decisions").update(
        {
            "status": "rejected",
            "resolved_by": ctx.actor_user_id,
            "resolved_at": now,
        }
    ).eq("id", decision_id).execute()

    return {
        "decision_id": decision_id,
        "status": "rejected",
        "result": None,
    }


# ---------------------------------------------------------------------------
# Helper — reconstruct IntentDecision from the stored output_action
# ---------------------------------------------------------------------------


def _reconstruct_intent_decision(row: dict) -> IntentDecision:
    """Build an IntentDecision from a stored ai_decisions row.

    output_action shape (written by workflow._output_action_for_decision):
      {
        **decision.args,          # all original args (verb, field_id, …)
        "skill": decision.skill,           (may be None for agentic)
        "automation_kind": decision.automation_kind,
        "reason": …,              (optional — set in some paths)
        "urgent": True,           (optional — set when urgency=="urgent")
      }

    Mapping:
      skill          ← output_action["skill"]
      automation_kind← output_action["automation_kind"]
      args           ← remaining keys (everything except skill, automation_kind,
                        reason, urgent, summary)
      confidence     ← row["confidence_score"] or 1.0
      urgency        ← "urgent" if output_action.get("urgent") else "normal"
      reason         ← output_action.get("reason") or output_action.get("summary") or "approved"
      relevant       ← True
    """
    output_action: dict = row.get("output_action") or {}

    skill = output_action.get("skill")
    automation_kind = output_action.get("automation_kind") or "deterministic"

    # Keys that are metadata, not skill args
    _meta_keys = {"skill", "automation_kind", "reason", "summary", "urgent"}
    args = {k: v for k, v in output_action.items() if k not in _meta_keys}

    confidence_raw = row.get("confidence_score")
    confidence = float(confidence_raw) if confidence_raw is not None else 1.0

    urgency: Literal["normal", "urgent"] = (
        "urgent" if output_action.get("urgent") else "normal"
    )

    reason = (
        output_action.get("reason")
        or output_action.get("summary")
        or "approved"
    )

    return IntentDecision(
        relevant=True,
        automation_kind=automation_kind,
        skill=skill,
        args=args,
        urgency=urgency,
        confidence=confidence,
        reason=reason,
    )
