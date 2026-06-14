"""Agno Workflow backbone parity shell.

Wave 1 keeps behavior identical by delegating to the existing cascade body.
Wave 2 can replace this shell with declarative Workflow steps without changing
the public ``run_workflow`` contract.
"""

from __future__ import annotations

from typing import Any

from app.security import TenantContext


async def _legacy_run_cascade(**kwargs: Any) -> dict:
    from app.cascade.workflow import _run_legacy_cascade

    return await _run_legacy_cascade(**kwargs)


async def run_workflow(
    *,
    ctx: TenantContext,
    lead_id: str,
    opportunity_id: str | None,
    pipeline_id: str | None,
    trigger: str,
    client: Any = None,
    emit: Any = None,
) -> dict:
    """Run the Workflow path.

    ``emit`` is reserved for the Wave 3 event sink; the Wave 1 parity shell
    intentionally ignores it.
    """
    return await _legacy_run_cascade(
        ctx=ctx,
        lead_id=lead_id,
        opportunity_id=opportunity_id,
        pipeline_id=pipeline_id,
        trigger=trigger,
        client=client,
    )
