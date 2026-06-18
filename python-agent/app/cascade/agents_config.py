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

# Sentinel returned when no copilot_agents row exists for the given scope.
# Callers MUST treat None as "autonomous" (legacy behaviour) so that existing
# pipelines without an explicit config row continue to execute normally.
_NO_ROW_SENTINEL: None = None


def load_agent_config(
    client: Any,
    equipe_id: str,
    scope: str,
    pipeline_id: str | None = None,
) -> dict:
    """Return {"name", "system_prompt", "autonomy_mode"} for the first matching row.

    When *no row* exists ``autonomy_mode`` is ``None`` (the sentinel meaning
    "no explicit config — behave as autonomous").  Only ``"observe"`` or
    ``"suggest"`` are returned when a row is present and explicitly sets them.

    On any exception the same no-row sentinel dict is returned so callers
    degrade gracefully without raising.
    """
    name_default = _SCOPE_DEFAULTS.get(scope, "Copiloto")
    no_row = {
        "name": name_default,
        "system_prompt": None,
        "autonomy_mode": _NO_ROW_SENTINEL,  # None → treat as autonomous
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
        return no_row
    if isinstance(rows, dict):
        rows = [rows]
    if not rows:
        return no_row
    r = rows[0]
    return {
        "name": r.get("name") or name_default,
        "system_prompt": r.get("system_prompt"),
        # Preserve the DB value verbatim; fall back to None sentinel when the
        # column is NULL (not configured), NOT to "observe".
        "autonomy_mode": r.get("autonomy_mode") or _NO_ROW_SENTINEL,
    }
