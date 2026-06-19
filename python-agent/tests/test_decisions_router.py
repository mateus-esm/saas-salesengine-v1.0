"""Tests for app.routers.decisions -- Sprint 6.4 W4.1 decisions log."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.deps import get_tenant_context
from app.routers.decisions import router
from app.security import TenantContext

EQUIPE_ID = "team-1"
OTHER_EQUIPE_ID = "team-2"
ACTOR_ID = "user-1"
PIPELINE_ID = "pipe-solar"
OTHER_PIPELINE_ID = "pipe-other"
LEAD_ID = "lead-1"

FAKE_CTX = TenantContext(equipe_id=EQUIPE_ID, actor_user_id=ACTOR_ID, role="admin")


class _Response:
    def __init__(self, data: Any) -> None:
        self.data = data


class _FakeQuery:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._rows = list(rows)
        self.filters: list[tuple[str, Any]] = []
        self.in_filters: list[tuple[str, list[Any]]] = []
        self.limit_value: int | None = None
        self.order_column: str | None = None
        self.order_desc = False

    def select(self, *_args: object, **_kwargs: object) -> "_FakeQuery":
        return self

    def eq(self, column: str, value: Any) -> "_FakeQuery":
        self.filters.append((column, value))
        return self

    def in_(self, column: str, values: list[Any]) -> "_FakeQuery":
        self.in_filters.append((column, values))
        return self

    def order(self, column: str, *, desc: bool = False) -> "_FakeQuery":
        self.order_column = column
        self.order_desc = desc
        return self

    def limit(self, value: int) -> "_FakeQuery":
        self.limit_value = value
        return self

    def execute(self) -> _Response:
        rows = list(self._rows)
        for column, value in self.filters:
            rows = [row for row in rows if row.get(column) == value]
        for column, values in self.in_filters:
            allowed = set(values)
            rows = [row for row in rows if row.get(column) in allowed]
        if self.order_column:
            rows.sort(
                key=lambda row: row.get(self.order_column) or "",
                reverse=self.order_desc,
            )
        if self.limit_value is not None:
            rows = rows[: self.limit_value]
        return _Response(rows)


class _FakeClient:
    def __init__(self, *, decisions: list[dict[str, Any]], leads: list[dict[str, Any]]) -> None:
        self.decisions_query = _FakeQuery(decisions)
        self.leads_query = _FakeQuery(leads)

    def table(self, table_name: str) -> _FakeQuery:
        if table_name == "ai_decisions":
            return self.decisions_query
        if table_name == "leads":
            return self.leads_query
        raise AssertionError(f"Unexpected table read: {table_name}")


def _make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_tenant_context] = lambda: FAKE_CTX
    return app


def test_decisions_are_tenant_scoped_pipeline_filtered_newest_first_with_lead_name(
    monkeypatch,
) -> None:
    decisions = [
        {
            "id": "older-same-pipeline",
            "equipe_id": EQUIPE_ID,
            "created_at": "2026-06-18T10:00:00Z",
            "agent_role": "floor_doorman",
            "decision_type": "action",
            "status": "pending_approval",
            "lead_id": LEAD_ID,
            "opportunity_id": "opp-1",
            "pipeline_id": PIPELINE_ID,
            "output_action": {
                "verb": "set_field",
                "args": {"field_id": "f_budget", "value": "50000"},
            },
            "confidence_score": 0.82,
        },
        {
            "id": "newer-same-pipeline",
            "equipe_id": EQUIPE_ID,
            "created_at": "2026-06-18T12:00:00Z",
            "agent_role": "floor_doorman",
            "decision_type": "action",
            "status": "executed",
            "lead_id": LEAD_ID,
            "opportunity_id": "opp-1",
            "pipeline_id": PIPELINE_ID,
            "output_action": {
                "verb": "attach_file",
                "args": {"field_id": "f_bill", "file_url": "https://files/bill.pdf"},
            },
            "confidence_score": 0.91,
        },
        {
            "id": "other-pipeline",
            "equipe_id": EQUIPE_ID,
            "created_at": "2026-06-18T13:00:00Z",
            "pipeline_id": OTHER_PIPELINE_ID,
            "lead_id": LEAD_ID,
            "output_action": {"verb": "set_field", "args": {"field_id": "x", "value": "y"}},
        },
        {
            "id": "other-tenant",
            "equipe_id": OTHER_EQUIPE_ID,
            "created_at": "2026-06-18T14:00:00Z",
            "pipeline_id": PIPELINE_ID,
            "lead_id": LEAD_ID,
            "output_action": {"verb": "set_field", "args": {"field_id": "z", "value": "w"}},
        },
    ]
    leads = [{"id": LEAD_ID, "equipe_id": EQUIPE_ID, "name": "Maria Silva"}]
    fake_client = _FakeClient(decisions=decisions, leads=leads)
    monkeypatch.setattr("app.routers.decisions.get_service_client", lambda: fake_client)

    client = TestClient(_make_app())
    resp = client.get(f"/api/v1/decisions?pipeline_id={PIPELINE_ID}&limit=10")

    assert resp.status_code == 200
    rows = resp.json()
    assert [row["id"] for row in rows] == ["newer-same-pipeline", "older-same-pipeline"]
    assert rows[0] == {
        "id": "newer-same-pipeline",
        "created_at": "2026-06-18T12:00:00Z",
        "agent_role": "floor_doorman",
        "decision_type": "action",
        "status": "executed",
        "lead_id": LEAD_ID,
        "lead_name": "Maria Silva",
        "opportunity_id": "opp-1",
        "pipeline_id": PIPELINE_ID,
        "field": "f_bill",
        "value": "https://files/bill.pdf",
        "confidence": 0.91,
        "credits": 1,
        "output_action": {
            "verb": "attach_file",
            "args": {"field_id": "f_bill", "file_url": "https://files/bill.pdf"},
        },
    }
    assert rows[1]["field"] == "f_budget"
    assert rows[1]["value"] == "50000"
    assert rows[1]["credits"] == 0
    assert ("equipe_id", EQUIPE_ID) in fake_client.decisions_query.filters
    assert ("pipeline_id", PIPELINE_ID) in fake_client.decisions_query.filters
    assert ("equipe_id", EQUIPE_ID) in fake_client.leads_query.filters
