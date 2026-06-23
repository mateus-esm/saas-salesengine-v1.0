"""Revenue math API endpoints -- Sprint 6.7 Revenue Powertrain.

GET  /api/v1/revenue/lead-velocity/{lead_id}  -- lead-velocity score + trend
GET  /api/v1/revenue/icp-score/{lead_id}       -- ICP score 0-100 + breakdown
GET  /api/v1/revenue/lead-score/{lead_id}      -- unified lead score 0-10

All endpoints are tenant-scoped via the authenticated user's equipe_id.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.db import get_service_client
from app.deps import get_tenant_context
from app.security import TenantContext

router = APIRouter(prefix="/revenue", tags=["revenue"])

# ── helpers (pure functions, testable without DB) ──────────────────────────


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


# ── endpoints ──────────────────────────────────────────────────────────────


@router.get("/lead-velocity/{lead_id}")
async def get_lead_velocity(
    lead_id: str,
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
) -> dict:
    """Return lead-velocity score + trend for the given lead.

    Delegates to PL/pgSQL fn_calculate_lead_velocity.
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

    # 2. Call the PL/pgSQL velocity function.
    result = client.rpc(
        "fn_calculate_lead_velocity", {"p_lead_id": lead_id}
    ).execute()
    rows = getattr(result, "data", None) or []
    velocity = float(rows[0]["fn_calculate_lead_velocity"]) if rows and isinstance(rows[0], dict) and "fn_calculate_lead_velocity" in rows[0] else 0.0

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


# ── lead-score endpoint (Sprint 6.8) ────────────────────────────────────────

V_MAX = 20


def _compute_lead_score(
    icp_score: float, velocity: float
) -> dict:
    """Combine ICP score (0-100) and velocity into a 0-10 lead score.

    Formula: round(((icp_score/100) * 0.7 + min(velocity / V_MAX, 1) * 0.3) * 10)

    Returns {score, breakdown}.
    """
    if icp_score == 0 and velocity == 0:
        return {
            "score": 0,
            "breakdown": [{"label": "Sem dados suficientes", "contribution": 0}],
        }

    icp_norm = icp_score / 100.0
    vel_norm = min(velocity / V_MAX, 1.0)

    icp_contrib = round(icp_norm * 0.7 * 10, 2)
    vel_contrib = round(vel_norm * 0.3 * 10, 2)

    raw_score = icp_contrib + vel_contrib
    score = max(0, min(10, round(raw_score)))

    return {
        "score": score,
        "breakdown": [
            {"label": "Perfil Ideal (ICP)", "contribution": icp_contrib},
            {"label": "Engajamento", "contribution": vel_contrib},
        ],
    }


@router.get("/lead-score/{lead_id}")
async def get_lead_score(
    lead_id: str,
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
) -> dict:
    """Return unified lead score 0-10 combining ICP and velocity signals.

    Delegates to PL/pgSQL fn_calculate_icp_score and
    fn_calculate_lead_velocity.

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

    # 2. Call both RPCs.
    icp_result = client.rpc(
        "fn_calculate_icp_score", {"p_lead_id": lead_id}
    ).execute()
    icp_rows = getattr(icp_result, "data", None) or []
    icp_score = float(icp_rows[0].get("score", 0)) if icp_rows else 0.0

    vel_result = client.rpc(
        "fn_calculate_lead_velocity", {"p_lead_id": lead_id}
    ).execute()
    vel_rows = getattr(vel_result, "data", None) or []
    velocity = float(vel_rows[0]["fn_calculate_lead_velocity"]) if vel_rows and isinstance(vel_rows[0], dict) and "fn_calculate_lead_velocity" in vel_rows[0] else 0.0

    return {
        "lead_id": lead_id,
        **_compute_lead_score(icp_score, velocity),
    }
