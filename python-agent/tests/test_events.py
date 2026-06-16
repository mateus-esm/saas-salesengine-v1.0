"""Tests for app.events.RunEmitter (D2).

The emitter is the single source of cognition events for the Telemetry HUD:
  (a) it queues each event in-memory for the SSE stream (`aiter`), and
  (b) it best-effort persists each event to copilot_run_events for Realtime/sweep.

The Supabase client is faked (no live DB) per the repo's fake-client pattern.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.events import RunEmitter


class _FakeTable:
    """Minimal fake of the supabase-py fluent client used by RunEmitter._persist."""

    def __init__(self):
        self.rows = []

    def table(self, _name):
        return self

    def insert(self, row):
        self.rows.append(row)
        return self

    def execute(self):
        class _R:
            data = None
            error = None

        return _R()


@pytest.mark.asyncio
async def test_emit_queues_and_persists():
    db = _FakeTable()
    em = RunEmitter(equipe_id="e1", run_id="r1", opportunity_id="o1", client=db)
    await em.emit("action_start", {"verb": "set_field"})
    await em.emit("done", {})

    seen = [ev async for ev in em.aiter()]
    assert seen[0]["kind"] == "action_start"
    assert seen[-1]["kind"] == "done"
    # persisted rows carry the run id and a monotonically increasing seq starting at 0
    assert db.rows[0]["run_id"] == "r1" and db.rows[0]["seq"] == 0
    assert db.rows[0]["equipe_id"] == "e1"
    assert db.rows[1]["seq"] == 1


@pytest.mark.asyncio
async def test_persistence_failure_never_blocks_the_stream():
    class _BadDB:
        def table(self, _):
            raise RuntimeError("db down")

    em = RunEmitter(equipe_id="e1", run_id="r1", opportunity_id=None, client=_BadDB())
    await em.emit("action_start", {"verb": "x"})
    await em.emit("done", {})
    seen = [ev async for ev in em.aiter()]
    # The stream still delivers both events even though every persist raised.
    assert [e["kind"] for e in seen] == ["action_start", "done"]


@pytest.mark.asyncio
async def test_done_closes_the_stream():
    em = RunEmitter(equipe_id="e1", run_id="r1", opportunity_id=None, client=_FakeTable())
    await em.emit("done", {"total": 0})
    seen = [ev async for ev in em.aiter()]
    assert len(seen) == 1 and seen[0]["kind"] == "done"
