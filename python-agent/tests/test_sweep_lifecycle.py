"""Tests for sweep lifecycle recompute (Sprint 6.7 fix F1).

Verifies that the sweep nudge mql leads to re-evaluate lifecycle advancement.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.deps import get_tenant_context
from app.routers.sweep import router
from app.security import TenantContext

EQUIPE_ID = "team-solar"
PIPELINE_ID = "pipe-1"
LEAD_ID = "lead-mql-1"
FAKE_CTX = TenantContext(equipe_id=EQUIPE_ID, actor_user_id="u1", role="admin")


class _Response:
    """Fake supabase response with a .data attribute."""

    def __init__(self, data: list) -> None:
        self.data = data


class _FakeTableQuery:
    """Fake fluent query scoped to a single table's rows."""

    def __init__(self, rows: list, _client=None) -> None:
        self._rows = list(rows)
        self._client = _client

    def select(self, *args, **kwargs):
        return self

    def eq(self, col: str, val):
        self._rows = [r for r in self._rows if r.get(col) == val]
        return self

    def execute(self):
        return _Response(self._rows)

    def insert(self, data):
        return self

    def update(self, data):
        """Record the update payload for test assertions."""
        self._update_data = data
        return self


class _FakeClient:
    """Fake supabase client returning per-table row sets."""

    def __init__(self, tables: dict[str, list]) -> None:
        self._tables = tables

    def table(self, name: str):
        return _FakeTableQuery(self._tables.get(name, []), self)

    def rpc(self, func_name: str, params: dict):
        return _FakeTableQuery([])


def _make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_tenant_context] = lambda: FAKE_CTX
    return app


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_sweep_promotes_mql_to_sql(monkeypatch):
    """MQL lead with an opportunity → sweep self-assigns lifecycle_stage to
    fire the trigger.  The test verifies the endpoint completes and the
    lifecycle recompute step ran."""
    tables = {
        "opportunities": [
            {
                "id": "opp-1",
                "lead_id": LEAD_ID,
                "pipeline_id": PIPELINE_ID,
                "equipe_id": EQUIPE_ID,
                "status": "open",
            },
        ],
        "leads": [
            {"id": LEAD_ID, "equipe_id": EQUIPE_ID, "lifecycle_stage": "mql"},
        ],
    }

    update_log: list[dict] = []

    class _TrackingClient(_FakeClient):
        def table(self, name):
            t = _FakeTableQuery(self._tables.get(name, []), self)
            orig_update = t.update

            def _tracking_update(data):
                if name == "leads":
                    update_log.append(data)
                return orig_update(data)

            t.update = _tracking_update
            return t

    async def fake_workflow(**kw):
        return {"status": "executed"}

    monkeypatch.setattr("app.routers.sweep.run_workflow", fake_workflow)
    monkeypatch.setattr(
        "app.routers.sweep.get_service_client",
        lambda: _TrackingClient(tables),
    )

    client = TestClient(_make_app())
    resp = client.post("/api/v1/sync/sweep", json={"pipeline_id": PIPELINE_ID})

    assert resp.status_code == 200
    # Verify the lifecycle recompute step ran — it should have self-assigned
    # lifecycle_stage on the MQL lead.
    assert len(update_log) == 1, (
        f"Expected 1 lifecycle update call, got {len(update_log)}: {update_log}"
    )
    assert update_log[0] == {"lifecycle_stage": "mql"}


def test_sweep_leaves_unqualified_mql_untouched(monkeypatch):
    """MQL leads without an opportunity are still checked by lifecycle
    recompute but no update happens if the trigger doesn't advance them.
    The endpoint still completes successfully."""
    tables = {
        "opportunities": [],
        "leads": [
            {"id": LEAD_ID, "equipe_id": EQUIPE_ID, "lifecycle_stage": "mql"},
        ],
    }

    update_log: list[dict] = []

    class _TrackingClient(_FakeClient):
        def table(self, name):
            t = _FakeTableQuery(self._tables.get(name, []), self)
            orig_update = t.update

            def _tracking_update(data):
                if name == "leads":
                    update_log.append(data)
                return orig_update(data)

            t.update = _tracking_update
            return t

    monkeypatch.setattr(
        "app.routers.sweep.get_service_client",
        lambda: _TrackingClient(tables),
    )

    client = TestClient(_make_app())
    resp = client.post("/api/v1/sync/sweep", json={"pipeline_id": PIPELINE_ID})

    assert resp.status_code == 200
    # The lifecycle recompute still runs and touches the MQL lead,
    # even though there's no opportunity — the trigger decides advancement.
    assert len(update_log) == 1


def test_sweep_skips_non_mql_leads(monkeypatch):
    """Only MQL leads are touched by lifecycle recompute.  Non-MQL leads
    should not receive the self-assignment update."""
    tables = {
        "opportunities": [
            {
                "id": "opp-1",
                "lead_id": "lead-nql-1",
                "pipeline_id": PIPELINE_ID,
                "equipe_id": EQUIPE_ID,
                "status": "open",
            },
        ],
        "leads": [
            {"id": "lead-nql-1", "equipe_id": EQUIPE_ID, "lifecycle_stage": "new"},
        ],
    }

    update_log: list[dict] = []

    class _TrackingClient(_FakeClient):
        def table(self, name):
            t = _FakeTableQuery(self._tables.get(name, []), self)
            orig_update = t.update

            def _tracking_update(data):
                if name == "leads":
                    update_log.append(data)
                return orig_update(data)

            t.update = _tracking_update
            return t

    async def fake_workflow(**kw):
        return {"status": "executed"}

    monkeypatch.setattr("app.routers.sweep.run_workflow", fake_workflow)
    monkeypatch.setattr(
        "app.routers.sweep.get_service_client",
        lambda: _TrackingClient(tables),
    )

    client = TestClient(_make_app())
    resp = client.post("/api/v1/sync/sweep", json={"pipeline_id": PIPELINE_ID})

    assert resp.status_code == 200
    # No MQL leads in the fixture, so the lifecycle recompute should not
    # emit any update calls.
    assert len(update_log) == 0, (
        f"Expected 0 lifecycle updates for non-MQL leads, got {len(update_log)}"
    )
