"""Ciclo stage engine pass — Sprint 6.8 / Task 6.4.

POST /api/v1/cycle/pass

Scans every pipeline_stages_v2 record where stage_type = 'ciclo' with
cycle_days and cycle_target_stage_id configured, finds opportunities that
have exceeded their allotted cycle days in that stage, and moves them to
the target stage. Optionally fires a webhook (fire-and-forget) if the
stage has cycle_webhook_url set.

This is a system-level operation (no tenant scoping) intended to be called
by a scheduler / cron trigger.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter

from app.db import get_service_client

router = APIRouter(prefix="/cycle", tags=["cycle"])


async def _fire_webhook(url: str, payload: dict) -> None:
    """POST *payload* to *url* as JSON — fire-and-forget, never raises."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as hc:
            await hc.post(url, json=payload)
    except Exception:
        pass  # fire-and-forget: swallow all errors


@router.post("/pass")
async def cycle_pass() -> dict:
    """Check all ciclo stages for expired opportunities and advance them.

    Returns ``{processed, errors, details}`` where *details* lists every
    opportunity that was (or failed to be) moved.
    """
    client = get_service_client()
    now = datetime.now(timezone.utc)
    processed = 0
    errors = 0
    details: list[dict[str, Any]] = []

    # 1. Fetch all ciclo stages that have cycle configuration.
    stages_resp = (
        client.table("pipeline_stages_v2")
        .select("*")
        .eq("stage_type", "ciclo")
        .execute()
    )
    stages = getattr(stages_resp, "data", None) or []

    for stage in stages:
        cycle_days = stage.get("cycle_days")
        target_stage_id = stage.get("cycle_target_stage_id")
        if not cycle_days or not target_stage_id:
            continue

        # 2. Find open, non-deleted opportunities currently in this stage.
        opps_resp = (
            client.table("opportunities")
            .select("id, stage_entered_at")
            .eq("stage_id", stage["id"])
            .eq("status", "open")
            .is_("deleted_at", "null")
            .execute()
        )
        opps = getattr(opps_resp, "data", None) or []

        for opp in opps:
            entered_str = opp.get("stage_entered_at")
            if not entered_str:
                continue

            try:
                entered = datetime.fromisoformat(entered_str)
                if entered.tzinfo is None:
                    entered = entered.replace(tzinfo=timezone.utc)
            except (ValueError, TypeError):
                continue

            if (now - entered).days < cycle_days:
                continue

            # 3. Move opportunity to target stage.
            #    The BEFORE-UPDATE trigger trg_opportunity_stage_change records
            #    stage history automatically, so we do NOT insert it manually
            #    (the manual insert previously used non-existent columns and
            #    threw, which silently swallowed the webhook below).
            try:
                now_iso = now.isoformat()
                (
                    client.table("opportunities")
                    .update({
                        "stage_id": target_stage_id,
                        "stage_entered_at": now_iso,
                    })
                    .eq("id", opp["id"])
                    .execute()
                )

                processed += 1
                details.append({
                    "opportunity_id": opp["id"],
                    "from_stage_id": stage["id"],
                    "to_stage_id": target_stage_id,
                    "days_in_stage": (now - entered).days,
                })

                # 4. Fire webhook (best-effort, awaited so it actually sends)
                #    if configured. _fire_webhook never raises.
                webhook_url = stage.get("cycle_webhook_url")
                if webhook_url:
                    await _fire_webhook(webhook_url, {
                        "opportunity_id": opp["id"],
                        "from_stage_id": stage["id"],
                        "to_stage_id": target_stage_id,
                        "event": "cycle_pass",
                    })

            except Exception:
                errors += 1
                details.append({
                    "opportunity_id": opp["id"],
                    "from_stage_id": stage["id"],
                    "error": "Failed to move opportunity",
                })

    return {
        "processed": processed,
        "errors": errors,
        "details": details,
    }
