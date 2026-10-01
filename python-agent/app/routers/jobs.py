"""Sprint 11 · Onda 6 · T60 — the queue's alarm clock.

    POST /api/v1/jobs/tick   (X-Agent-Token)

pg_cron calls public._copilot_tick() every minute; it only pings this endpoint
when a job is due. The endpoint claims a batch (crm_copilot_claim — nobody takes
the same job twice), answers 202 right away, and processes the batch in the
background with a concurrency cap shared by every tick — the database call that
woke us (pg_net) never waits for a model.

Off by default: COPILOT_JOBS_ENABLED=false answers {"status": "disabled"} without
claiming anything, so deploying the code changes nothing until the switch.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, status

from app.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/jobs", tags=["copilot-jobs"])

_semaphore: asyncio.Semaphore | None = None


def _gate(limit: int) -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(max(1, limit))
    return _semaphore


def get_repo():  # seam for tests
    from app.copilot.repo import CopilotRepo
    from app.db import get_pg_pool

    return CopilotRepo(get_pg_pool())


_jev_clients: dict[tuple[str, str, float], Any] = {}


def get_system1(settings: Any):
    """System One (Jev) around the keeper — None without JEV_API_KEY or with JEV_MODE=off.

    The HTTP client is kept across ticks (keep-alive), one per key/model/timeout.
    """
    mode = str(settings.jev_mode or "off").strip().lower()
    if not settings.jev_api_key or mode not in ("shadow", "on"):
        return None
    from app.cognition.system_one import SystemOne
    from app.copilot.judgments import System1

    key = (settings.jev_api_key, settings.jev_model, float(settings.jev_timeout_s))
    client = _jev_clients.get(key)
    if client is None:
        client = _jev_clients[key] = SystemOne(settings.jev_api_key, model=settings.jev_model, timeout=float(settings.jev_timeout_s))
    return System1(client, mode=mode, quiet_below=float(settings.jev_quiet_below))


def get_think(model_id: str):  # seam for tests
    from app.copilot.keeper import make_think

    return make_think(model_id)


async def process(
    jobs: list[dict[str, Any]],
    *,
    repo: Any,
    think: Any,
    model_id: str,
    concurrency: int,
    s1: Any = None,
    model_timeout_s: float | None = None,
) -> list[dict[str, Any]]:
    from app.copilot.keeper import run_job

    gate = _gate(concurrency)

    async def one(job: dict[str, Any]) -> dict[str, Any]:
        async with gate:
            try:
                return await run_job(job, repo=repo, think=think, model_id=model_id, s1=s1, model_timeout_s=model_timeout_s)
            except Exception as exc:  # run_job closes its job; this is the last guard
                logger.exception("copilot job %s crashed", job.get("id"))
                return {"status": "crashed", "error": str(exc)}

    return list(await asyncio.gather(*(one(j) for j in jobs)))


@router.post("/tick", status_code=status.HTTP_202_ACCEPTED)
async def tick(
    background: BackgroundTasks,
    x_agent_token: Annotated[str | None, Header()] = None,
) -> dict[str, Any]:
    settings = get_settings()
    expected = settings.agent_internal_token
    if not expected or x_agent_token != expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid X-Agent-Token.")
    if not settings.copilot_jobs_enabled:
        return {"status": "disabled", "claimed": 0}

    repo = get_repo()
    jobs = await asyncio.to_thread(repo.claim, settings.copilot_jobs_batch)
    if jobs:
        model_id = settings.keeper_model or settings.doorman_model
        background.add_task(
            process, jobs, repo=repo, think=get_think(model_id), model_id=model_id,
            concurrency=settings.copilot_jobs_concurrency,
            s1=get_system1(settings), model_timeout_s=settings.keeper_model_timeout_s,
        )
    return {"status": "accepted", "claimed": len(jobs)}
