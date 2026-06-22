"""Pipeline forecast endpoint -- Sprint 6.7 Revenue Powertrain.

GET  /api/v1/revenue/forecast/{pipeline_id}  -- weighted forecast + placar
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.db import get_service_client
from app.deps import get_tenant_context
from app.security import TenantContext

router = APIRouter(prefix="/revenue", tags=["revenue"])


@router.get("/forecast/{pipeline_id}")
async def get_forecast(
    pipeline_id: str,
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
) -> dict:
    """Return pipeline forecast: conversion rates, required inbound, placar."""
    client = get_service_client()

    # 1. Verify pipeline + load revenue_config
    pipe_resp = (
        client.table("pipelines")
        .select("revenue_config")
        .eq("id", pipeline_id)
        .eq("equipe_id", ctx.equipe_id)
        .limit(1)
        .execute()
    )
    pipes = getattr(pipe_resp, "data", None) or []
    if not pipes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pipeline not found",
        )
    revenue_config = pipes[0].get("revenue_config", {})

    # 2. Call stage conversion rates
    rates_result = client.rpc(
        "fn_stage_conversion_rates", {"p_pipeline_id": pipeline_id}
    ).execute()
    rates_rows = getattr(rates_result, "data", None) or []
    overrides = revenue_config.get("conversion_overrides", {})

    conversion_rates = []
    cumulative = 1.0
    for r in rates_rows:
        sid = r["stage_id"]
        if sid in overrides:
            effective = overrides[sid]
            source = "manual"
        else:
            effective = float(r["conversion_rate"])
            source = "history"
        conversion_rates.append({"stage_id": sid, "rate": effective, "source": source})
        cumulative *= effective

    # 3. Compute placar: count won / open opportunities
    placar_resp = (
        client.table("opportunities")
        .select("status")
        .eq("equipe_id", ctx.equipe_id)
        .eq("pipeline_id", pipeline_id)
        .execute()
    )
    opps = getattr(placar_resp, "data", None) or []
    closed = sum(1 for o in opps if o.get("status") == "won")
    in_progress = sum(1 for o in opps if o.get("status") == "open")
    goal = revenue_config.get("goal_deals", 0)

    # 4. Required inbound
    goal_deals = revenue_config.get("goal_deals", 0)
    required_inbound = 0
    if goal_deals > 0 and cumulative > 0:
        required_inbound = round(goal_deals / cumulative)

    return {
        "pipeline_id": pipeline_id,
        "goal_deals": goal_deals,
        "required_inbound": required_inbound,
        "conversion_rates": conversion_rates,
        "placar": {
            "closed": closed,
            "in_progress": in_progress,
            "goal": goal,
        },
    }
