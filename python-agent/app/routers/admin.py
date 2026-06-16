"""H2 — Private admin ops surface.

A minimal, read-only operations view for internal use ONLY. Gated behind
``settings.agent_internal_token`` (the same server-to-server token the ingest
loop uses) — never a tenant JWT, never public. Mounted under a non-tenant path
prefix (``/admin``) so it sits outside the /api/v1 tenant surface.

Exposes recent ``copilot_run_events`` and ``ai_decisions`` across all tenants
for ops visibility (the goal is traces/debugging, not the full AgentOS console).
"""
from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from app.config import get_settings
from app.db import get_service_client

router = APIRouter(prefix="/admin", tags=["admin"])


def require_internal_token(
    x_agent_token: Annotated[str | None, Header()] = None,
) -> None:
    """Reject anything without the internal ops token."""
    expected = get_settings().agent_internal_token
    if not expected or x_agent_token != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid X-Agent-Token.",
        )


def _rows(query: Any) -> list[dict]:
    resp = query.execute()
    if getattr(resp, "error", None):
        raise RuntimeError(str(resp.error))
    data = getattr(resp, "data", None) or []
    return data if isinstance(data, list) else [data]


@router.get("/runs", dependencies=[Depends(require_internal_token)])
async def list_runs(limit: int = Query(50, ge=1, le=500)) -> dict:
    """Recent copilot run events + AI decisions for ops debugging."""
    client = get_service_client()
    events = _rows(
        client.table("copilot_run_events")
        .select("id,equipe_id,run_id,opportunity_id,seq,kind,created_at")
        .order("created_at", desc=True)
        .limit(limit)
    )
    decisions = _rows(
        client.table("ai_decisions")
        .select("id,equipe_id,agent_role,decision_type,status,created_at")
        .order("created_at", desc=True)
        .limit(limit)
    )
    return {"run_events": events, "ai_decisions": decisions}
