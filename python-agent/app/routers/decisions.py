"""Sprint 6.4 W4.1 -- tenant-scoped Copilot decisions log."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from app.db import get_service_client
from app.deps import get_tenant_context
from app.security import TenantContext

router = APIRouter(prefix="/decisions", tags=["decisions"])


@router.get("")
async def list_decisions(
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
    pipeline_id: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
) -> list[dict[str, Any]]:
    """Return newest-first AI decision rows scoped to the authenticated tenant."""
    client = get_service_client()
    query = (
        client.table("ai_decisions")
        .select("*")
        .eq("equipe_id", ctx.equipe_id)
        .order("created_at", desc=True)
        .limit(limit)
    )
    if pipeline_id:
        query = query.eq("pipeline_id", pipeline_id)

    response = query.execute()
    rows: list[dict[str, Any]] = getattr(response, "data", None) or []
    lead_names = _load_lead_names(client, ctx.equipe_id, rows)

    return [_format_decision(row, lead_names) for row in rows]


def _load_lead_names(
    client: Any,
    equipe_id: str,
    rows: list[dict[str, Any]],
) -> dict[str, str]:
    lead_ids = sorted({str(row["lead_id"]) for row in rows if row.get("lead_id")})
    if not lead_ids:
        return {}

    response = (
        client.table("leads")
        .select("id,name")
        .eq("equipe_id", equipe_id)
        .in_("id", lead_ids)
        .execute()
    )
    leads: list[dict[str, Any]] = getattr(response, "data", None) or []
    return {
        str(lead["id"]): str(lead["name"])
        for lead in leads
        if lead.get("id") and lead.get("name")
    }


def _format_decision(
    row: dict[str, Any],
    lead_names: dict[str, str],
) -> dict[str, Any]:
    field, value = _field_value_from_output_action(row.get("output_action"))
    lead_id = row.get("lead_id")
    return {
        "id": row.get("id"),
        "created_at": row.get("created_at"),
        "agent_role": row.get("agent_role"),
        "decision_type": row.get("decision_type"),
        "status": row.get("status"),
        "lead_id": lead_id,
        "lead_name": lead_names.get(str(lead_id)) if lead_id else None,
        "opportunity_id": row.get("opportunity_id"),
        "pipeline_id": row.get("pipeline_id"),
        "field": field,
        "value": value,
        "confidence": row.get("confidence_score"),
        "credits": 1 if row.get("status") == "executed" else 0,
        "output_action": row.get("output_action"),
    }


def _field_value_from_output_action(output_action: Any) -> tuple[Any, Any]:
    if not isinstance(output_action, dict):
        return None, None

    args = output_action.get("args")
    if isinstance(args, dict):
        field = args.get("field_id") or args.get("field") or args.get("key")
        value = (
            args.get("value")
            if "value" in args
            else args.get("file_url") or args.get("url") or args.get("file_name")
        )
        if field is not None or value is not None:
            return field, value

    field = (
        output_action.get("field_id")
        or output_action.get("field")
        or output_action.get("key")
    )
    value = (
        output_action.get("value")
        if "value" in output_action
        else output_action.get("file_url")
        or output_action.get("url")
        or output_action.get("summary")
        or output_action.get("reason")
    )
    return field, value
