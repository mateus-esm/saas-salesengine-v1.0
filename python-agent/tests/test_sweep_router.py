"""Tests for app.routers.sweep — D3 (/sync/sweep + /sync/stream).

Mirrors test_sync_router.py: throwaway app, tenant dependency overridden,
run_workflow + get_service_client patched so nothing touches a live DB/LLM.
The key contract: the sweep processes every open opportunity ONE AT A TIME,
in order (sequential queue — no race conditions).
"""

import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.deps import get_tenant_context
from app.routers.sweep import router
from app.security import TenantContext

EQUIPE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
PIPELINE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
FAKE_CTX = TenantContext(equipe_id=EQUIPE_ID, actor_user_id="u1", role="admin")


class _FakeOppQuery:
    """Fake supabase fluent query returning a fixed list of open opportunities."""

    def __init__(self, rows):
        self._rows = rows

    def table(self, _name):
        return self

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def execute(self):
        class _R:
            pass

        r = _R()
        r.data = self._rows
        return r

    # RunEmitter._persist calls .table().insert().execute(); make those no-ops too.
    def insert(self, _row):
        return self

    # Lifecycle recompute calls .table().update(); make it a no-op too.
    def update(self, _data):
        return self


def _make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_tenant_context] = lambda: FAKE_CTX
    return app


def test_sweep_processes_each_open_opportunity_in_order(monkeypatch):
    opps = [
        {"id": "o1", "lead_id": "l1", "pipeline_id": PIPELINE_ID},
        {"id": "o2", "lead_id": "l2", "pipeline_id": PIPELINE_ID},
    ]
    processed: list[str] = []

    async def fake_workflow(**kw):
        processed.append(kw["opportunity_id"])
        return {"status": "executed"}

    monkeypatch.setattr("app.routers.sweep.run_workflow", fake_workflow)
    monkeypatch.setattr("app.routers.sweep.get_service_client", lambda: _FakeOppQuery(opps))

    client = TestClient(_make_app())
    r = client.post("/api/v1/sync/sweep", json={"pipeline_id": PIPELINE_ID})

    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 2
    assert "run_id" in body
    assert processed == ["o1", "o2"]  # sequential, in order


def test_sweep_empty_pipeline_returns_zero(monkeypatch):
    async def fake_workflow(**kw):  # pragma: no cover - must not be called
        raise AssertionError("workflow should not run for an empty pipeline")

    monkeypatch.setattr("app.routers.sweep.run_workflow", fake_workflow)
    monkeypatch.setattr("app.routers.sweep.get_service_client", lambda: _FakeOppQuery([]))

    client = TestClient(_make_app())
    r = client.post("/api/v1/sync/sweep", json={"pipeline_id": PIPELINE_ID})
    assert r.status_code == 200
    assert r.json()["total"] == 0


def test_stream_emits_events_then_done(monkeypatch):
    async def fake_workflow(*, emit=None, **kw):
        if emit:
            await emit("action_start", {"verb": "set_field"})
            await emit("action_done", {"verb": "set_field", "ok": True})
        return {"status": "executed"}

    monkeypatch.setattr("app.routers.sweep.run_workflow", fake_workflow)
    monkeypatch.setattr("app.routers.sweep.get_service_client", lambda: _FakeOppQuery([]))

    client = TestClient(_make_app())
    with client.stream(
        "GET", f"/api/v1/sync/stream?lead_id=l1&opportunity_id=o1&pipeline_id={PIPELINE_ID}"
    ) as resp:
        assert resp.status_code == 200
        body = "".join(resp.iter_text())

    assert "action_start" in body
    assert "action_done" in body
    # The generator appends a terminal done event so the client closes cleanly.
    assert '"kind": "done"' in body
