"""D2 — Copilot run-event emitter.

A ``RunEmitter`` is created per Workflow run (single sync) or per sweep. Every
cognition step calls ``emit(kind, payload)`` which:

  (a) appends the event to an in-memory ``asyncio.Queue`` consumed by the SSE
      stream (``aiter``) — this drives the single-sync Telemetry HUD; and
  (b) best-effort inserts a ``copilot_run_events`` row so Supabase Realtime can
      replay the same stream to the sweep HUD.

Persistence is intentionally best-effort: a DB hiccup must never crash an
already-applied structural action or stall the live stream.
"""
from __future__ import annotations

import asyncio
from typing import Any, AsyncIterator


class RunEmitter:
    def __init__(self, *, equipe_id: str, run_id: str, opportunity_id: str | None, client: Any):
        self.equipe_id = equipe_id
        self.run_id = run_id
        self.opportunity_id = opportunity_id
        self.client = client
        self._q: asyncio.Queue[dict | None] = asyncio.Queue()
        self._seq = 0

    async def emit(self, kind: str, payload: dict[str, Any]) -> None:
        ev = {
            "kind": kind,
            "seq": self._seq,
            "run_id": self.run_id,
            "opportunity_id": self.opportunity_id,
            "payload": payload,
        }
        await self._q.put(ev)
        try:
            await asyncio.to_thread(self._persist, ev)
        except Exception:
            pass  # Realtime persistence is best-effort; never block the run.
        self._seq += 1
        if kind == "done":
            await self._q.put(None)  # close sentinel for aiter()

    def _persist(self, ev: dict) -> None:
        self.client.table("copilot_run_events").insert(
            {
                "equipe_id": self.equipe_id,
                "run_id": ev["run_id"],
                "seq": ev["seq"],
                "opportunity_id": ev["opportunity_id"],
                "kind": ev["kind"],
                "payload": ev["payload"],
            }
        ).execute()

    async def aiter(self) -> AsyncIterator[dict]:
        while True:
            ev = await self._q.get()
            if ev is None:
                return
            yield ev
