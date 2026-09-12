"""The ciclo pass endpoint is retired (Sprint 11 · Onda 3 · T34).

The recycle runs in the database (`public.crm_run_timers()`, pg_cron) — its
behaviour is tested in supabase/tests/sprint11_w3_timers.test.sql. What is left
here is the contract of the retirement: the route answers 410 Gone, points to
the scheduler, and never touches the database.
"""

from __future__ import annotations

import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers import cycle_pass  # noqa: E402


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(cycle_pass.router, prefix="/api/v1")
    return TestClient(app)


def test_cycle_pass_is_gone_and_points_to_the_scheduler():
    resp = _client().post("/api/v1/cycle/pass")
    assert resp.status_code == 410
    body = resp.json()
    assert body["error"] == "gone"
    assert "crm_run_timers" in body["detail"]


def test_cycle_pass_never_touches_the_database():
    # The retired module no longer imports the service client at all.
    assert not hasattr(cycle_pass, "get_service_client")
