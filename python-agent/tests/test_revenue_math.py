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


def _calc_icp_score(
    weights: list[dict], values: dict[str, str | None]
) -> dict:
    """Simulate ICP scoring in pure Python.

    I = (Sigma Wi x Vi) x 100, weights normalized, Vi in [0,1]

    Exact target match = 1.0, substring/partial match = 0.5, no match = 0.
    Missing/null values are treated as 0 match.
    """
    total = 0.0
    weight_sum = 0.0
    breakdown: list[dict] = []

    for w in weights:
        field = w["field_key"]
        target = w["target_value"]
        weight = w["weight"]
        label = w.get("label", field)
        actual = values.get(field)

        if actual and target:
            if actual.lower() == target.lower():
                match = 1.0
            elif target.lower() in actual.lower() or actual.lower() in target.lower():
                match = 0.5
            else:
                match = 0
        else:
            match = 0

        weight_sum += weight
        total += weight * match
        breakdown.append(
            {
                "field": field,
                "label": label,
                "weight": weight,
                "match": match,
                "contribution": weight * match,
            }
        )

    if weight_sum > 0:
        score = (total / weight_sum) * 100
    else:
        score = 0

    return {"score": round(score, 1), "breakdown": breakdown}


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


class TestIcpScore:
    """Sprint 6.7 — ICP scoring formula (pure math, no DB)."""

    TOLERANCE = 1e-9

    def test_icp_exact_match_scores_100(self):
        """All weights match targets -> score = 100."""
        weights = [
            {"field_key": "job_title", "weight": 0.6, "target_value": "engenheiro"},
            {"field_key": "company_size", "weight": 0.4, "target_value": "grande"},
        ]
        values = {"job_title": "Engenheiro", "company_size": "Grande"}
        result = _calc_icp_score(weights, values)
        assert abs(result["score"] - 100.0) < self.TOLERANCE, (
            f"Expected 100.0, got {result['score']}"
        )

    def test_icp_no_match_scores_0(self):
        """No values match targets -> score = 0."""
        weights = [
            {"field_key": "job_title", "weight": 1.0, "target_value": "engenheiro"},
        ]
        values = {"job_title": "medico"}
        result = _calc_icp_score(weights, values)
        assert abs(result["score"] - 0.0) < self.TOLERANCE, (
            f"Expected 0.0, got {result['score']}"
        )

    def test_icp_partial_match_scores_between(self):
        """Partial/substring match gives proportional score."""
        weights = [
            {"field_key": "job_title", "weight": 0.5, "target_value": "engenheiro"},
            {"field_key": "company_size", "weight": 0.5, "target_value": "grande"},
        ]
        values = {"job_title": "Engenheiro de Software", "company_size": "medio"}
        result = _calc_icp_score(weights, values)
        # job_title: partial (0.5 x 0.5) + company_size: 0 = contribution = 0.25
        # weight_sum = 0.5 + 0.5 = 1.0
        # normalized = (0.25 / 1.0) * 100 = 25
        assert abs(result["score"] - 25.0) < self.TOLERANCE, (
            f"Expected 25.0, got {result['score']}"
        )

    def test_icp_empty_weights_scores_0(self):
        """No ICP weights configured -> score = 0."""
        result = _calc_icp_score([], {})
        assert abs(result["score"] - 0.0) < self.TOLERANCE, (
            f"Expected 0.0, got {result['score']}"
        )

    def test_icp_null_value_scores_0_for_that_field(self):
        """A field with None/null actual value contributes 0 to the score."""
        weights = [
            {"field_key": "job_title", "weight": 1.0, "target_value": "engenheiro"},
        ]
        values: dict[str, str | None] = {"job_title": None}
        result = _calc_icp_score(weights, values)
        assert abs(result["score"] - 0.0) < self.TOLERANCE, (
            f"Expected 0.0 for null value, got {result['score']}"
        )
        assert result["breakdown"][0]["match"] == 0


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
    """Multi-table fake: returns pre-seeded rows per table name.

    Also supports ``.rpc(func_name, params)`` for PL/pgSQL function calls;
    the fake returns the rows passed via the ``rpc_results`` constructor arg.
    """

    def __init__(
        self,
        tables: dict[str, list[dict[str, Any]]],
        *,
        rpc_results: dict[str, list[dict[str, Any]]] | None = None,
    ) -> None:
        self._tables = tables
        self._rpc_results = rpc_results or {}

    def table(self, name: str) -> _FakeQuery:
        return _FakeQuery(self._tables.get(name, []))

    def rpc(self, func_name: str, params: dict[str, Any]) -> _FakeRpcQuery:
        return _FakeRpcQuery(self._rpc_results.get(func_name, []))

    def __call__(self) -> _FakeClient:
        """Allow ``get_service_client`` to be monkeypatched as the lambda itself."""
        return self


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


class _FakeRpcQuery:
    """Fake supabase RPC query result."""

    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._rows = rows

    def execute(self) -> _Response:
        return _Response(self._rows)


def _make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_tenant_context] = lambda: FAKE_CTX
    return app


class TestLeadVelocityEndpoint:
    """Sprint 6.7 — revenue API lead-velocity endpoint."""

    def test_get_lead_velocity_computes_correctly(self, monkeypatch):
        """Delegates to fn_calculate_lead_velocity RPC and returns result."""
        _expected_vel = 14.0
        _expected_trend = "flat"

        tables = {
            "leads": [
                {"id": LEAD_ID, "equipe_id": EQUIPE_ID},
            ],
        }
        rpc_results = {
            "fn_calculate_lead_velocity": [{"fn_calculate_lead_velocity": _expected_vel}],
        }
        monkeypatch.setattr(
            "app.routers.revenue.get_service_client",
            lambda: _FakeClient(tables, rpc_results=rpc_results),
        )

        client = TestClient(_make_app())
        resp = client.get(f"/api/v1/revenue/lead-velocity/{LEAD_ID}")

        assert resp.status_code == 200
        body = resp.json()
        assert body["lead_id"] == LEAD_ID
        assert body["velocity"] == _expected_vel
        assert body["trend"] == _expected_trend

    def test_get_lead_velocity_trend_up_when_high(self, monkeypatch):
        """Velocity > 20 -> trend=up."""
        _expected_vel = 30.0

        tables = {
            "leads": [{"id": LEAD_ID, "equipe_id": EQUIPE_ID}],
        }
        rpc_results = {
            "fn_calculate_lead_velocity": [{"fn_calculate_lead_velocity": _expected_vel}],
        }
        monkeypatch.setattr(
            "app.routers.revenue.get_service_client",
            lambda: _FakeClient(tables, rpc_results=rpc_results),
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
    """Sprint 6.7 — revenue API ICP-score endpoint."""

    def test_get_icp_score_returns_score_and_breakdown(self, monkeypatch):
        """Valid lead returns 200 with score + breakdown from PL/pgSQL."""
        _rpc_rows = [
            {
                "score": 100.0,
                "breakdown": [
                    {
                        "field": "job_title",
                        "label": "Cargo",
                        "weight": 0.4,
                        "value": "Engenheiro",
                        "target": "engenheiro",
                        "match": 1.0,
                        "contribution": 0.4,
                    },
                ],
            }
        ]
        fake = _FakeClient(
            {"leads": [{"id": LEAD_ID, "equipe_id": EQUIPE_ID}]},
            rpc_results={"fn_calculate_icp_score": _rpc_rows},
        )
        monkeypatch.setattr(
            "app.routers.revenue.get_service_client",
            lambda: fake,
        )

        client = TestClient(_make_app())
        resp = client.get(f"/api/v1/revenue/icp-score/{LEAD_ID}")

        assert resp.status_code == 200
        body = resp.json()
        assert body["lead_id"] == LEAD_ID
        assert body["score"] == 100.0
        assert len(body["breakdown"]) == 1
        assert body["breakdown"][0]["field"] == "job_title"

    def test_get_icp_score_returns_zero_for_no_weights(self, monkeypatch):
        """Lead exists but pipeline has no ICP weights -> score = 0."""
        fake = _FakeClient(
            {"leads": [{"id": LEAD_ID, "equipe_id": EQUIPE_ID}]},
            rpc_results={"fn_calculate_icp_score": [{"score": 0, "breakdown": []}]},
        )
        monkeypatch.setattr(
            "app.routers.revenue.get_service_client",
            lambda: fake,
        )

        client = TestClient(_make_app())
        resp = client.get(f"/api/v1/revenue/icp-score/{LEAD_ID}")

        assert resp.status_code == 200
        assert resp.json()["score"] == 0
        assert resp.json()["breakdown"] == []

    def test_get_icp_score_returns_404_for_unknown_lead(self, monkeypatch):
        """Lead not found -> 404."""
        fake = _FakeClient({"leads": []})
        monkeypatch.setattr(
            "app.routers.revenue.get_service_client",
            lambda: fake,
        )

        client = TestClient(_make_app())
        resp = client.get(f"/api/v1/revenue/icp-score/{UNKNOWN_LEAD_ID}")

        assert resp.status_code == 404
        assert resp.json()["detail"] == "Lead not found"

    def test_get_icp_score_returns_404_for_other_tenant_lead(self, monkeypatch):
        """Lead belongs to another equipe -> 404 (tenant-scoped)."""
        fake = _FakeClient(
            {"leads": [{"id": LEAD_ID, "equipe_id": OTHER_EQUIPE_ID}]},
        )
        monkeypatch.setattr(
            "app.routers.revenue.get_service_client",
            lambda: fake,
        )

        client = TestClient(_make_app())
        resp = client.get(f"/api/v1/revenue/icp-score/{LEAD_ID}")

        assert resp.status_code == 404
        assert resp.json()["detail"] == "Lead not found"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
