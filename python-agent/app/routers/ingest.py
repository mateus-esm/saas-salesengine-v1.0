"""§P5/E7 — Gated ingest router.

POST /ingest  (E10 mounts under /api/v1, yielding /api/v1/ingest)

Server-to-server endpoint consumed by the Solo Copilot background loop.
Auth: ``X-Agent-Token`` header (not a Supabase JWT).

Steps:
  1. 503 if ``settings.ingest_enabled`` is False.
  2. 401 if token header is missing or doesn't match ``settings.agent_internal_token``.
  3. Load settled rows from ``copilot_ingest_queue`` (processed_at IS NULL AND due_at <= now()).
  4. For each row: skip if team has ``is_crm_agent_enabled = false``; otherwise run the
     E6 cascade with trigger="ingest" and mark the row processed.
  5. Return 202 with ``{"processed": N, "skipped": M}`` summary.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Header, HTTPException, status

from app.cascade.workflow import run_cascade
from app.config import get_settings
from app.db import get_service_client
from app.security import TenantContext

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ingest", tags=["ingest"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _execute(query: Any) -> Any:
    response = query.execute()
    error = getattr(response, "error", None)
    if error:
        raise RuntimeError(str(error))
    return getattr(response, "data", None)


def _rows(query: Any) -> list[dict[str, Any]]:
    data = _execute(query)
    if data is None:
        return []
    if isinstance(data, list):
        return data
    return [data]


def _first(query: Any) -> dict[str, Any] | None:
    rows = _rows(query)
    return rows[0] if rows else None


def _load_settled_queue(client: Any) -> list[dict[str, Any]]:
    """Fetch rows where processed_at IS NULL AND due_at <= now()."""
    now_iso = datetime.now(tz=timezone.utc).isoformat()
    query = (
        client.table("copilot_ingest_queue")
        .select("id,equipe_id,lead_id,pipeline_id,conversation_ref")
        .is_("processed_at", "null")
        .lte("due_at", now_iso)
    )
    return _rows(query)


def _is_agent_enabled(client: Any, equipe_id: str) -> bool:
    """Check equipes.is_crm_agent_enabled for the given team."""
    query = (
        client.table("equipes")
        .select("is_crm_agent_enabled")
        .eq("id", equipe_id)
        .limit(1)
    )
    row = _first(query)
    if row is None:
        return False
    return bool(row.get("is_crm_agent_enabled", False))


def _mark_processed(client: Any, row_id: str) -> None:
    """Set processed_at = now() on the given queue row."""
    now_iso = datetime.now(tz=timezone.utc).isoformat()
    (
        client.table("copilot_ingest_queue")
        .update({"processed_at": now_iso})
        .eq("id", row_id)
        .execute()
    )


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def ingest_trigger(
    x_agent_token: str | None = Header(default=None),
) -> dict:
    """Trigger the gated background ingest for all settled queue rows.

    Auth: ``X-Agent-Token`` header must equal ``settings.agent_internal_token``.
    Returns ``{"processed": N, "skipped": M}`` once all rows are handled.
    """
    settings = get_settings()

    # ── 1. Feature gate ────────────────────────────────────────────────────
    if not settings.ingest_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Ingest is currently disabled.",
        )

    # ── 2. Server-to-server auth ────────────────────────────────────────────
    if x_agent_token is None or x_agent_token != settings.agent_internal_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid X-Agent-Token.",
        )

    # ── 3 & 4. Load queue, gate per team, run cascade ──────────────────────
    client = get_service_client()
    rows = _load_settled_queue(client)

    processed = 0
    skipped = 0

    for row in rows:
        equipe_id: str = str(row["equipe_id"])
        row_id: str = str(row["id"])
        lead_id: str = str(row["lead_id"])
        pipeline_id: str | None = row.get("pipeline_id")
        if pipeline_id is not None:
            pipeline_id = str(pipeline_id)

        if not _is_agent_enabled(client, equipe_id):
            logger.debug("Skipping row %s — team %s has agent disabled", row_id, equipe_id)
            skipped += 1
            continue

        ctx = TenantContext(
            equipe_id=equipe_id,
            actor_user_id=None,  # type: ignore[arg-type]  # server-to-server, no user
            role="service",
        )

        try:
            await run_cascade(
                ctx=ctx,
                lead_id=lead_id,
                opportunity_id=None,
                pipeline_id=pipeline_id,
                trigger="ingest",
                client=client,
            )
            _mark_processed(client, row_id)
            processed += 1
        except Exception:
            logger.exception("Cascade failed for queue row %s (lead %s)", row_id, lead_id)
            # Do NOT mark processed — it will be retried on the next poll.

    # ── 5. Summary ─────────────────────────────────────────────────────────
    return {"processed": processed, "skipped": skipped}
