"""§P5/E8 — Sync router.

POST /sync  (E10 mounts under /api/v1, yielding /api/v1/sync)

User-facing endpoint that triggers the Copilot cascade synchronously for a
specific lead/opportunity/pipeline.  Auth is handled by ``get_tenant_context``
(Supabase JWT → TenantContext); the cascade is called with trigger="sync" which
forces auto-apply and bypasses the team toggle checked by the background ingest.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.cascade.workflow import run_cascade
from app.deps import get_tenant_context
from app.security import TenantContext
from pydantic import BaseModel

router = APIRouter(prefix="/sync", tags=["sync"])


# ---------------------------------------------------------------------------
# Request body
# ---------------------------------------------------------------------------


class SyncRequest(BaseModel):
    lead_id: str
    opportunity_id: str | None = None
    pipeline_id: str | None = None


# ---------------------------------------------------------------------------
# POST /sync
# ---------------------------------------------------------------------------


@router.post("")
async def sync_lead(
    body: SyncRequest,
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
) -> dict:
    """Run the E6 cascade synchronously for the given lead/opportunity.

    trigger="sync" forces auto-apply and skips the per-team ``is_crm_agent_enabled``
    gate — that gate is only respected by the background ingest path.

    Returns the cascade result dict: ``{decision_id, status, result}``.
    """
    return await run_cascade(
        ctx=ctx,
        lead_id=body.lead_id,
        opportunity_id=body.opportunity_id,
        pipeline_id=body.pipeline_id,
        trigger="sync",
    )
