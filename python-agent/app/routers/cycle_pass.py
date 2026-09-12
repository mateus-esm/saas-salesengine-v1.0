"""Ciclo stage engine pass — RETIRED in Sprint 11 · Onda 3 · T34.

POST /api/v1/cycle/pass

This endpoint moved expired opportunities out of `ciclo` stages, but no
scheduler ever called it: the recycle never ran (Casa Flow had 200 deals in its
Reciclo stage in September 2026). The recycle now lives in the database —
`public.crm_run_timers()`, called by pg_cron every 15 minutes, with the
`recycled` funnel event, the stage webhook (pg_net), an automation actor in the
stage history, and the recurrence engine in the same pass.

The route stays mounted and answers 410 Gone, so any forgotten caller learns
where the work went instead of getting a silent 404 — and nothing is moved from
two places at once.
"""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/cycle", tags=["cycle"])


@router.post("/pass")
async def cycle_pass() -> JSONResponse:
    return JSONResponse(
        status_code=410,
        content={
            "error": "gone",
            "detail": "The recycle moved to the database scheduler: public.crm_run_timers() (pg_cron, every 15 min).",
        },
    )
