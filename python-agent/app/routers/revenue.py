"""Revenue math API endpoints -- Sprint 6.7 Revenue Powertrain.

GET  /api/v1/revenue/lead-velocity/{lead_id}  -- lead-velocity score + trend
GET  /api/v1/revenue/icp-score/{lead_id}       -- stub (Task 3.5 implements real)

All endpoints are tenant-scoped via the authenticated user's equipe_id.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.db import get_service_client
from app.deps import get_tenant_context
from app.security import TenantContext

router = APIRouter(prefix="/revenue", tags=["revenue"])

# ── constants ──────────────────────────────────────────────────────────────

DECAY_FACTOR = 2.0
ACTIVITY_POINTS = 10


# ── helpers (pure functions, testable without DB) ──────────────────────────


def _compute_velocity(activity_count: int, days_since_last: int) -> float:
    """Lead-velocity formula: S = (n * ACTIVITY_POINTS) - (DECAY_FACTOR * t).

    Never returns below 0.0 (floor guard).
    """
    return max(0.0, (activity_count * ACTIVITY_POINTS) - (DECAY_FACTOR * days_since_last))


def _compute_trend(velocity: float) -> str:
    """Classify velocity trend.

    > 20  -> "up"
    < 5   -> "down"
    else  -> "flat"
    """
    if velocity > 20:
        return "up"
    if velocity < 5:
        return "down"
    return "flat"


def _days_since(dt_str: str | None, *, now: datetime | None = None) -> int:
    """Compute whole days elapsed between *dt_str* (ISO-8601 UTC) and *now*.

    When *now* is None (default) the current UTC wall-clock time is used.
    Returns 0 when *dt_str* is None or unparseable.
    """
    if not dt_str:
        return 0

    try:
        dt = datetime.fromisoformat(dt_str)
    except (ValueError, TypeError):
        return 0

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)

    if now is None:
        now = datetime.now(timezone.utc)
    return max(0, (now - dt).days)


# ── endpoints ──────────────────────────────────────────────────────────────


@router.get("/lead-velocity/{lead_id}")
async def get_lead_velocity(
    lead_id: str,
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
) -> dict:
    """Return lead-velocity score + trend for the given lead.

    Tenant-scoped: raises 404 if the lead does not belong to the caller's
    equipe_id.
    """
    client = get_service_client()

    # 1. Verify lead exists and is owned by this tenant.
    lead_resp = (
        client.table("leads")
        .select("id")
        .eq("id", lead_id)
        .eq("equipe_id", ctx.equipe_id)
        .limit(1)
        .execute()
    )
    lead_data = getattr(lead_resp, "data", None) or []
    if not lead_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found",
        )

    # 2. Fetch activities (most recent first).
    activities_resp = (
        client.table("lead_activities")
        .select("created_at")
        .eq("lead_id", lead_id)
        .order("created_at", desc=True)
        .execute()
    )
    activities = getattr(activities_resp, "data", None) or []

    activity_count = len(activities)
    last_date = activities[0].get("created_at") if activity_count > 0 else None
    days_since_last = _days_since(last_date)

    velocity = _compute_velocity(activity_count, days_since_last)
    trend = _compute_trend(velocity)

    return {
        "lead_id": lead_id,
        "velocity": velocity,
        "trend": trend,
    }


@router.get("/icp-score/{lead_id}")
async def get_icp_score(
    lead_id: str,
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
) -> dict:
    """Return ICP score + field-level breakdown for the given lead.

    Formula: I = (Sigma Wi x Vi) x 100, weights normalized, Vi in [0,1].
    Delegates to PL/pgSQL fn_calculate_icp_score.

    Tenant-scoped: raises 404 if the lead does not belong to the caller's
    equipe_id.
    """
    client = get_service_client()

    # 1. Verify lead exists and is owned by this tenant.
    lead_resp = (
        client.table("leads")
        .select("id")
        .eq("id", lead_id)
        .eq("equipe_id", ctx.equipe_id)
        .limit(1)
        .execute()
    )
    lead_data = getattr(lead_resp, "data", None) or []
    if not lead_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found",
        )

    # 2. Call the PL/pgSQL scoring function.
    result = client.rpc(
        "fn_calculate_icp_score", {"p_lead_id": lead_id}
    ).execute()
    rows = getattr(result, "data", None) or []

    if not rows:
        return {"lead_id": lead_id, "score": 0, "breakdown": []}

    row = rows[0]
    return {
        "lead_id": lead_id,
        "score": row.get("score", 0),
        "breakdown": row.get("breakdown", []),
    }
