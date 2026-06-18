"""Copilot agent config loader.

Reads copilot_agents (system_prompt, autonomy_mode, name) for a given
equipe + scope combination.  Tenant-scoped; never raises (returns defaults)."""
from __future__ import annotations
from typing import Any

_SCOPE_DEFAULTS: dict[str, str] = {
    "chat": "Copiloto de Chat",
    "contact_base": "Copiloto de Base",
    "pipeline": "Copiloto de Pipeline",
}


def load_agent_config(
    client: Any,
    equipe_id: str,
    scope: str,
    pipeline_id: str | None = None,
) -> dict:
    """Return {"name", "system_prompt", "autonomy_mode"} for the first matching row.

    Falls back to sensible defaults when no row exists or any exception occurs.
    """
    defaults = {
        "name": _SCOPE_DEFAULTS.get(scope, "Copiloto"),
        "system_prompt": None,
        "autonomy_mode": "observe",
    }
    try:
        q = (
            client.table("copilot_agents")
            .select("name,system_prompt,autonomy_mode")
            .eq("equipe_id", equipe_id)
            .eq("scope", scope)
        )
        if pipeline_id is not None:
            q = q.eq("pipeline_id", pipeline_id)
        resp = q.execute()
        rows = getattr(resp, "data", None) or []
    except Exception:
        return defaults
    if isinstance(rows, dict):
        rows = [rows]
    if not rows:
        return defaults
    r = rows[0]
    return {
        "name": r.get("name") or defaults["name"],
        "system_prompt": r.get("system_prompt"),
        "autonomy_mode": r.get("autonomy_mode") or "observe",
    }
