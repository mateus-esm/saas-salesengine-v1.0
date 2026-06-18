"""Stage guide — the Pipeline Copilot's training about WHEN to move a deal.

Reads pipeline_stages_v2 (name, type, description, SLA) so the Floor triage can
pick the right stage_name_hint. Tenant-scoped; never raises (returns [])."""
from __future__ import annotations
from typing import Any


def load_stage_guide(client: Any, equipe_id: str, pipeline_id: str | None) -> list[dict]:
    if not pipeline_id:
        return []
    try:
        resp = (
            client.table("pipeline_stages_v2")
            .select("name,stage_type,description,max_idle_hours,position,deleted_at")
            .eq("equipe_id", equipe_id)
            .eq("pipeline_id", pipeline_id)
            .order("position", desc=False)
            .execute()
        )
        rows = getattr(resp, "data", None) or []
    except Exception:
        return []
    if isinstance(rows, dict):
        rows = [rows]
    guide = []
    for r in rows:
        if r.get("deleted_at"):
            continue
        guide.append({
            "name": r.get("name"),
            "stage_type": r.get("stage_type"),
            "description": r.get("description"),
            "max_idle_hours": r.get("max_idle_hours"),
        })
    return guide
