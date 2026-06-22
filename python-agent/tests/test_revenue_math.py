"""Tests for Predictable Revenue lead-velocity formula (§4.2).

S = (Sigma Aj) - (Dk * t)  where:
    Aj = activity points per event (each = +10)
    t  = days since last activity
    Dk = decay factor (constant 2.0)

These tests validate the **pure math** (no DB dependency).

API endpoint tests at the bottom follow the same pattern as test_sweep_router.py
and test_decisions_router.py: throwaway FastAPI app, tenant dep overridden,
get_service_client mocked.
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.deps import get_tenant_context
from app.routers.revenue import router
from app.security import TenantContext


# ── formula helper (replicates PL/pgSQL fn_calculate_lead_velocity) ──────────

DECAY_FACTOR = 2.0


def _calc_velocity(
    activity_points: list[int],
    days_since_last: int,
    decay: float = DECAY_FACTOR,
) -> float:
    """Calculate lead velocity: sum(activity_points) - (decay * days_since_last).
    Never returns below 0.0 (floor guard).
    """
    return max(0.0, sum(activity_points) - (decay * days_since_last))


# ── pure-math tests ─────────────────────────────────────────────────────────


class TestLeadVelocity:
    """Sprint 6.7 — Predictable Revenue lead-velocity scoring."""

    TOLERANCE = 1e-9

    def test_velocity_decays_with_silence(self):
        """Given 2 activities (20 pts), 5 days silence: velocity = 20 - (2*5) = 10."""
        points = [10, 10]  # two activities
        days_since = 5
        expected = 10.0

        result = _calc_velocity(points, days_since)

        assert abs(result - expected) < self.TOLERANCE, (
            f"Expected {expected}, got {result}"
        )

    def test_velocity_zero_for_no_activity(self):
        """Given 0 activities: velocity = 0.0 (guard: never negative)."""
        points = []
        days_since = 0  # no activity means no decay dimension either

        result = _calc_velocity(points, days_since)

        assert abs(result - 0.0) < self.TOLERANCE, (
            f"Expected 0.0, got {result}"
        )

    def test_velocity_floor_at_zero(self):
        """Given 1 activity (10 pts), 100 days silence: raw = 10-200 = -190.0 -> 0.0."""
        points = [10]
        days_since = 100
        expected = 0.0

        result = _calc_velocity(points, days_since)

        assert abs(result - expected) < self.TOLERANCE, (
            f"Expected {expected}, got {result}"
        )


# ── API endpoint tests ─────────────────────────────────────────────────────

EQUIPE_ID = "team-solar"
OTHER_EQUIPE_ID = "team-wind"
LEAD_ID = "lead-vel-1"
UNKNOWN_LEAD_ID = "lead-nonexistent"

FAKE_CTX = TenantContext(equipe_id=EQUIPE_ID, actor_user_id="u1", role="admin")

def _compute_expected_velocity(
    activity_count: int, last_date_str: str | None,
) -> float:
    """Compute what the API *should* return given today's actual date."""
    from app.routers.revenue import _compute_velocity, _days_since

    return _compute_velocity(activity_count, _days_since(last_date_str))


class _Response:
    def __init__(self, data: Any) -> None:
        self.data = data


class _FakeClient:
    """Multi-table fake: returns pre-seeded rows per table name."""

    def __init__(self, tables: dict[str, list[dict[str, Any]]]) -> None:
        self._tables = tables

    def table(self, name: str) -> _FakeQuery:
        return _FakeQuery(self._tables.get(name, []))


class _FakeQuery:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._rows = list(rows)
        self._filters: list[tuple[str, Any]] = []

    def select(self, *_a: object, **_k: object) -> _FakeQuery:
        return self

    def eq(self, column: str, value: Any) -> _FakeQuery:
        self._filters.append((column, value))
        return self

    def order(self, _column: str, **__: object) -> _FakeQuery:
        return self

    def limit(self, _value: int) -> _FakeQuery:
        return self

    def execute(self) -> _Response:
        rows = list(self._rows)
        for col, val in self._filters:
            rows = [r for r in rows if r.get(col) == val]
        return _Response(rows)


def _make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_tenant_context] = lambda: FAKE_CTX
    return app


class TestLeadVelocityEndpoint:
    """Sprint 6.7 — revenue API lead-velocity endpoint."""

    def test_get_lead_velocity_computes_correctly(self, monkeypatch):
        """2 activities, last at 2026-06-19: velocity computed dynamically."""
        _last_date = "2026-06-19T14:00:00Z"
        _expected_vel = _compute_expected_velocity(2, _last_date)
        _expected_trend = "down" if _expected_vel < 5 else "flat" if _expected_vel <= 20 else "up"

        tables = {
            "leads": [
                {"id": LEAD_ID, "equipe_id": EQUIPE_ID},
            ],
            "lead_activities": [
                {"id": "act-2", "lead_id": LEAD_ID, "created_at": _last_date},
                {"id": "act-1", "lead_id": LEAD_ID, "created_at": "2026-06-18T10:00:00Z"},
            ],
        }
        monkeypatch.setattr(
            "app.routers.revenue.get_service_client",
            lambda: _FakeClient(tables),
        )

        client = TestClient(_make_app())
        resp = client.get(f"/api/v1/revenue/lead-velocity/{LEAD_ID}")

        assert resp.status_code == 200
        body = resp.json()
        assert body["lead_id"] == LEAD_ID
        assert body["velocity"] == _expected_vel
        assert body["trend"] == _expected_trend

    def test_get_lead_velocity_trend_up_when_high(self, monkeypatch):
        """5 activities (50 pts): velocity should be > 20 -> trend=up."""
        _last_date = "2026-06-20T10:00:00Z"
        _expected_vel = _compute_expected_velocity(5, _last_date)
        assert _expected_vel > 20, (
            "Pre-condition: 5 recent activities must yield velocity > 20"
        )

        tables = {
            "leads": [{"id": LEAD_ID, "equipe_id": EQUIPE_ID}],
            "lead_activities": [
                {"id": f"act-{i}", "lead_id": LEAD_ID, "created_at": _last_date}
                for i in range(5)
            ],
        }
        monkeypatch.setattr(
            "app.routers.revenue.get_service_client",
            lambda: _FakeClient(tables),
        )

        client = TestClient(_make_app())
        resp = client.get(f"/api/v1/revenue/lead-velocity/{LEAD_ID}")

        assert resp.status_code == 200
        assert resp.json()["trend"] == "up"

    def test_get_lead_velocity_trend_down_when_low(self, monkeypatch):
        """1 activity, 10+ days ago: velocity hits floor at 0.0 -> trend=down."""
        _LAST_DATE_OLD = "2026-06-01T10:00:00Z"
        _expected_vel = _compute_expected_velocity(1, _LAST_DATE_OLD)
        assert _expected_vel == 0.0, (
            "Pre-condition: 1 activity 20+ days ago must floor at 0"
        )

        tables = {
            "leads": [{"id": LEAD_ID, "equipe_id": EQUIPE_ID}],
            "lead_activities": [
                {"id": "act-1", "lead_id": LEAD_ID, "created_at": _LAST_DATE_OLD},
            ],
        }
        monkeypatch.setattr(
            "app.routers.revenue.get_service_client",
            lambda: _FakeClient(tables),
        )

        client = TestClient(_make_app())
        resp = client.get(f"/api/v1/revenue/lead-velocity/{LEAD_ID}")

        assert resp.status_code == 200
        assert resp.json()["velocity"] == 0.0
        assert resp.json()["trend"] == "down"

    def test_get_lead_velocity_returns_404_for_unknown_lead(self, monkeypatch):
        """Lead ID not in the 'leads' table for this tenant -> 404."""
        tables = {
            "leads": [],
            "lead_activities": [],
        }
        monkeypatch.setattr(
            "app.routers.revenue.get_service_client",
            lambda: _FakeClient(tables),
        )

        client = TestClient(_make_app())
        resp = client.get(f"/api/v1/revenue/lead-velocity/{UNKNOWN_LEAD_ID}")

        assert resp.status_code == 404
        assert resp.json()["detail"] == "Lead not found"

    def test_get_lead_velocity_returns_404_for_other_tenant_lead(self, monkeypatch):
        """Lead exists but belongs to another equipe -> 404 (tenant-scoped)."""
        tables = {
            "leads": [
                {"id": LEAD_ID, "equipe_id": OTHER_EQUIPE_ID},
            ],
            "lead_activities": [],
        }
        monkeypatch.setattr(
            "app.routers.revenue.get_service_client",
            lambda: _FakeClient(tables),
        )

        client = TestClient(_make_app())
        resp = client.get(f"/api/v1/revenue/lead-velocity/{LEAD_ID}")

        assert resp.status_code == 404
        assert resp.json()["detail"] == "Lead not found"


class TestIcpScoreEndpoint:
    """Sprint 6.7 — revenue API ICP-score stub endpoint."""

    def test_get_icp_score_returns_404_for_any_lead(self, monkeypatch):
        """Stub endpoint returns 404 regardless of lead (Task 3.5 implements real)."""
        monkeypatch.setattr(
            "app.routers.revenue.get_service_client",
            lambda: _FakeClient({"leads": [], "lead_activities": []}),
        )

        client = TestClient(_make_app())
        resp = client.get(f"/api/v1/revenue/icp-score/{LEAD_ID}")

        assert resp.status_code == 404
        assert resp.json()["detail"] == "ICP profile not found"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
