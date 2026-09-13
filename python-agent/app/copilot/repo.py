"""The keeper's four database verbs, over the direct Postgres pool.

One round trip each — the old path went through PostgREST from the VPS three to
five times per action (fetch, update, stamp the history, charge, log), 2–3 s per
action. These are plain calls to the SQL verbs of Sprint 11 · Onda 6:

  crm_copilot_claim    — take due jobs (nobody takes the same one twice)
  crm_copilot_context  — everything the model needs about one deal
  crm_copilot_apply    — check, classify, apply or ask, in one transaction
  crm_copilot_finish   — close the job (a failure goes back with a wait)

The calls are synchronous (psycopg); the keeper runs them in a thread so one slow
call never blocks the other deals being processed.

Every argument carries the type the verb declares. Postgres picks the function
by the argument types, and psycopg sends a Python float as double precision,
which never becomes numeric on its own: an untyped confidence made
crm_copilot_apply "not exist" and every pass died at the last step (13/09).
tests/test_copilot_repo.py reads the signatures from the migrations.
"""

from __future__ import annotations

from typing import Any

from psycopg.types.json import Jsonb


def _ensure_open(pool: Any) -> None:
    # psycopg_pool.ConnectionPool is built with open=False (app/db.py).
    if getattr(pool, "closed", False) and hasattr(pool, "open"):
        pool.open()


class CopilotRepo:
    def __init__(self, pool: Any) -> None:
        self.pool = pool

    def _scalar(self, sql: str, params: tuple[Any, ...]) -> Any:
        _ensure_open(self.pool)
        with self.pool.connection() as conn, conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
            return row[0] if row else None

    def _column(self, sql: str, params: tuple[Any, ...]) -> list[Any]:
        _ensure_open(self.pool)
        with self.pool.connection() as conn, conn.cursor() as cur:
            cur.execute(sql, params)
            return [row[0] for row in cur.fetchall()]

    def claim(self, limit: int) -> list[dict[str, Any]]:
        return self._column("select to_jsonb(j) from public.crm_copilot_claim(%s::integer) j", (limit,))

    def context(self, opportunity_id: str) -> dict[str, Any]:
        return self._scalar("select public.crm_copilot_context(%s::uuid)", (opportunity_id,))

    def apply(
        self,
        *,
        opportunity_id: str,
        run_id: str,
        actions: list[dict[str, Any]],
        summary: str | None,
        confidence: float | None,
        cursor: str | None,
        model: str | None,
    ) -> dict[str, Any]:
        return self._scalar(
            "select public.crm_copilot_apply(%s::uuid, %s::uuid, %s::jsonb, %s::text, %s::numeric, %s::timestamptz, %s::text)",
            (opportunity_id, run_id, Jsonb(actions), summary, confidence, cursor, model),
        )

    def finish(self, job_id: str, status: str, error: str | None = None, result: dict[str, Any] | None = None) -> str:
        return self._scalar(
            "select public.crm_copilot_finish(%s::uuid, %s::text, %s::text, %s::jsonb)",
            (job_id, status, error, Jsonb(result) if result is not None else None),
        )

    def event(self, *, equipe_id: str, run_id: str, opportunity_id: str | None, kind: str, payload: dict[str, Any]) -> None:
        """One run event per pass (the telemetry of the old HUD reads the same table)."""
        _ensure_open(self.pool)
        with self.pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                "insert into public.copilot_run_events (equipe_id, run_id, opportunity_id, seq, kind, payload) "
                "values (%s::uuid, %s, %s::uuid, 0, %s, %s)",
                (equipe_id, run_id, opportunity_id, kind, Jsonb(payload)),
            )
