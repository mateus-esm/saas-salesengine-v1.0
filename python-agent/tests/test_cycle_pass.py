"""Tests for the ciclo stage engine pass endpoint (§6.8/T6.4).

POST /api/v1/cycle/pass  — moves expired ciclo opportunities to their
target stage, skips non-expired ones, ignores non-ciclo stages.

Follows the same mock/pattern as test_revenue_math.py: monkeypatches
``get_service_client`` with a ``_FakeClient`` that returns pre-seeded rows.
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.cycle_pass import router


# ── fakes ──────────────────────────────────────────────────────────────────


class _Response:
    """Thin wrapper so ``.data`` returns the rows list."""

    def __init__(self, data: Any) -> None:
        self.data = data


class _FakeQuery:
    """Fake supabase query builder — supports select/eq/is_/update/insert."""

    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._rows = list(rows)
        self._filters: list[tuple[str, Any] | tuple[str, str, Any]] = []
        self._update_data: dict[str, Any] | None = None

    def select(self, *_a: object, **_k: object) -> _FakeQuery:
        return self

    def eq(self, column: str, value: Any) -> _FakeQuery:
        self._filters.append(("eq", column, value))
        return self

    def is_(self, column: str, value: str) -> _FakeQuery:
        """Support ``.is_("col", "null")`` / ``.is_("col", "not.null")``."""
        self._filters.append(("is", column, value))
        return self

    def order(self, _column: str, **__: object) -> _FakeQuery:
        return self

    def limit(self, _value: int) -> _FakeQuery:
        return self

    def update(self, data: dict[str, Any]) -> _FakeQuery:
        self._update_data = data
        return self

    def insert(self, data: dict[str, Any] | list[dict[str, Any]]) -> _FakeQuery:
        """Insert is a no-op in the fake — just record the call."""
        return self

    def execute(self) -> _Response:
        rows = list(self._rows)
        for f in self._filters:
            op = f[0]
            if op == "eq":
                _, col, val = f
                rows = [r for r in rows if r.get(col) == val]
            elif op == "is":
                _, col, val = f
                if val == "null":
                    rows = [r for r in rows if r.get(col) is None]
                elif val == "not.null":
                    rows = [r for r in rows if r.get(col) is not None]
        return _Response(rows)


class _FakeClient:
    """Multi-table fake returning pre-seeded rows by table name."""

    def __init__(self, tables: dict[str, list[dict[str, Any]]]) -> None:
        self._tables = tables

    def table(self, name: str) -> _FakeQuery:
        return _FakeQuery(self._tables.get(name, []))

    def __call__(self) -> _FakeClient:
        return self


# ── helpers ────────────────────────────────────────────────────────────────


def _make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    return app


def _days_ago(n: int) -> str:
    """Return an ISO-8601 timestamp *n* days before now."""
    dt = (datetime.now(timezone.utc) - timedelta(days=n)).replace(microsecond=0)
    s = dt.isoformat()
    return s.replace("+00:00", "Z") if "+00:00" in s else s


# ── tests ──────────────────────────────────────────────────────────────────


class TestCyclePass:
    """Sprint 6.8 / Task 6.4 — ciclo stage engine pass."""

    CICLO_STAGE_ID = "ciclo-st-1"
    TARGET_STAGE_ID = "target-st-1"
    CYCLE_DAYS = 7

    def _ciclo_stages(self) -> list[dict[str, Any]]:
        return [
            {
                "id": self.CICLO_STAGE_ID,
                "stage_type": "ciclo",
                "cycle_days": self.CYCLE_DAYS,
                "cycle_target_stage_id": self.TARGET_STAGE_ID,
                "cycle_webhook_url": None,
            },
        ]

    # ------------------------------------------------------------------
    # 1. Expired opportunity gets moved
    # ------------------------------------------------------------------

    def test_cycle_pass_moves_expired_opportunities(self, monkeypatch):
        """An opp in a ciclo stage for 10 days (cycle_days=7) is moved."""
        opp_id = "opp-expired"
        tables = {
            "pipeline_stages_v2": self._ciclo_stages(),
            "opportunities": [
                {
                    "id": opp_id,
                    "stage_id": self.CICLO_STAGE_ID,
                    "status": "open",
                    "deleted_at": None,
                    "stage_entered_at": _days_ago(10),
                },
            ],
        }
        monkeypatch.setattr(
            "app.routers.cycle_pass.get_service_client",
            lambda: _FakeClient(tables),
        )

        client = TestClient(_make_app())
        resp = client.post("/api/v1/cycle/pass")

        assert resp.status_code == 200
        body = resp.json()
        assert body["processed"] == 1
        assert body["errors"] == 0
        assert len(body["details"]) == 1
        assert body["details"][0]["opportunity_id"] == opp_id
        assert body["details"][0]["from_stage_id"] == self.CICLO_STAGE_ID
        assert body["details"][0]["to_stage_id"] == self.TARGET_STAGE_ID

    # ------------------------------------------------------------------
    # 2. Non-expired opportunity is skipped
    # ------------------------------------------------------------------

    def test_cycle_pass_skips_non_expired(self, monkeypatch):
        """An opp in the stage for only 1 day is NOT moved."""
        tables = {
            "pipeline_stages_v2": self._ciclo_stages(),
            "opportunities": [
                {
                    "id": "opp-recent",
                    "stage_id": self.CICLO_STAGE_ID,
                    "status": "open",
                    "deleted_at": None,
                    "stage_entered_at": _days_ago(1),
                },
            ],
        }
        monkeypatch.setattr(
            "app.routers.cycle_pass.get_service_client",
            lambda: _FakeClient(tables),
        )

        client = TestClient(_make_app())
        resp = client.post("/api/v1/cycle/pass")

        assert resp.status_code == 200
        body = resp.json()
        assert body["processed"] == 0
        assert body["errors"] == 0
        assert body["details"] == []

    # ------------------------------------------------------------------
    # 3. Non-ciclo stages are ignored even if they have cycle_days
    # ------------------------------------------------------------------

    def test_cycle_pass_skips_non_ciclo_stages(self, monkeypatch):
        """An 'aberto' stage with cycle_days is not queried at all."""
        tables = {
            "pipeline_stages_v2": [
                {
                    "id": "aberto-st-1",
                    "stage_type": "aberto",
                    "cycle_days": 7,
                    "cycle_target_stage_id": self.TARGET_STAGE_ID,
                    "cycle_webhook_url": None,
                },
            ],
            "opportunities": [
                {
                    "id": "opp-in-aberto",
                    "stage_id": "aberto-st-1",
                    "status": "open",
                    "deleted_at": None,
                    "stage_entered_at": _days_ago(10),
                },
            ],
        }
        monkeypatch.setattr(
            "app.routers.cycle_pass.get_service_client",
            lambda: _FakeClient(tables),
        )

        client = TestClient(_make_app())
        resp = client.post("/api/v1/cycle/pass")

        assert resp.status_code == 200
        body = resp.json()
        assert body["processed"] == 0
        assert body["errors"] == 0

    # ------------------------------------------------------------------
    # 4. All opportunities recent — nothing expired
    # ------------------------------------------------------------------

    def test_cycle_pass_returns_zero_when_none_expired(self, monkeypatch):
        """A ciclo stage exists but all opps entered recently -> 0 processed."""
        tables = {
            "pipeline_stages_v2": self._ciclo_stages(),
            "opportunities": [
                {
                    "id": "opp-fresh-1",
                    "stage_id": self.CICLO_STAGE_ID,
                    "status": "open",
                    "deleted_at": None,
                    "stage_entered_at": _days_ago(1),
                },
                {
                    "id": "opp-fresh-2",
                    "stage_id": self.CICLO_STAGE_ID,
                    "status": "open",
                    "deleted_at": None,
                    "stage_entered_at": _days_ago(3),
                },
            ],
        }
        monkeypatch.setattr(
            "app.routers.cycle_pass.get_service_client",
            lambda: _FakeClient(tables),
        )

        client = TestClient(_make_app())
        resp = client.post("/api/v1/cycle/pass")

        assert resp.status_code == 200
        body = resp.json()
        assert body["processed"] == 0
        assert body["errors"] == 0
        assert body["details"] == []


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
