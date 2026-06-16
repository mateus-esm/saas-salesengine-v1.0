"""D3 — Global sweep + live telemetry stream.

Two endpoints (mounted under /api/v1 → /api/v1/sync/*):

  GET  /sync/stream  — Server-Sent Events for a SINGLE sync. Runs the Workflow
                       with a RunEmitter and streams every cognition event as
                       ``data: {json}\\n\\n``, ending with a terminal ``done``.

  POST /sync/sweep   — The "Global Pipeline Sweep": loads every OPEN opportunity
                       for the tenant+pipeline and processes them ONE AT A TIME
                       (sequential queue → no race conditions / double-charges),
                       emitting ``sweep_progress`` per card. The frontend reads
                       progress via Supabase Realtime on copilot_run_events.

Auth: get_tenant_context (Supabase JWT → TenantContext). The agent then uses the
service-role client; every query is scoped by the JWT-derived equipe_id.
"""
from __future__ import annotations

import asyncio
import json
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.cascade.agno_workflow import run_workflow
from app.db import get_service_client
from app.deps import get_tenant_context
from app.events import RunEmitter
from app.security import TenantContext

router = APIRouter(prefix="/sync", tags=["sync"])


@router.get("/stream")
async def sync_stream(
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
    lead_id: str = Query(...),
    opportunity_id: str | None = Query(None),
    pipeline_id: str | None = Query(None),
) -> StreamingResponse:
    """Stream one sync's cognition events as SSE, terminating with ``done``."""
    client = get_service_client()
    emitter = RunEmitter(
        equipe_id=ctx.equipe_id,
        run_id=str(uuid.uuid4()),
        opportunity_id=opportunity_id,
        client=client,
    )

    async def _run_and_finish() -> None:
        # run_workflow emits per-action events but never the terminal ``done``;
        # we emit it here so the SSE generator's aiter() closes cleanly.
        try:
            result = await run_workflow(
                ctx=ctx,
                lead_id=lead_id,
                opportunity_id=opportunity_id,
                pipeline_id=pipeline_id,
                trigger="sync",
                client=client,
                emit=emitter.emit,
            )
            await emitter.emit("done", {
                "status": result.get("status"),
                "applied_count": result.get("applied_count", 0),
                "pending": result.get("pending", 0),
            })
        except Exception as exc:  # surface the failure to the HUD, then close.
            await emitter.emit("done", {"status": "error", "error": str(exc)})

    async def gen():
        task = asyncio.create_task(_run_and_finish())
        try:
            async for ev in emitter.aiter():
                yield f"data: {json.dumps(ev)}\n\n"
        finally:
            await task

    return StreamingResponse(gen(), media_type="text/event-stream")


class SweepRequest(BaseModel):
    pipeline_id: str


@router.post("/sweep")
async def sync_sweep(
    body: SweepRequest,
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
) -> dict:
    """Sequentially process every open opportunity in the pipeline."""
    client = get_service_client()
    run_id = str(uuid.uuid4())

    resp = (
        client.table("opportunities")
        .select("id,lead_id,pipeline_id")
        .eq("equipe_id", ctx.equipe_id)
        .eq("pipeline_id", body.pipeline_id)
        .eq("status", "open")
        .execute()
    )
    opps = getattr(resp, "data", None) or []

    emitter = RunEmitter(
        equipe_id=ctx.equipe_id, run_id=run_id, opportunity_id=None, client=client
    )
    for opp in opps:  # SEQUENTIAL — one card at a time.
        await emitter.emit("sweep_progress", {"opportunity_id": opp["id"], "state": "start"})
        await run_workflow(
            ctx=ctx,
            lead_id=opp["lead_id"],
            opportunity_id=opp["id"],
            pipeline_id=opp["pipeline_id"],
            trigger="sync",
            client=client,
            emit=emitter.emit,
        )
        await emitter.emit("sweep_progress", {"opportunity_id": opp["id"], "state": "done"})

    await emitter.emit("done", {"total": len(opps)})
    return {"run_id": run_id, "total": len(opps)}
