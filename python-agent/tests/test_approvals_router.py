"""Tests for app.routers.approvals — §P5/E9 approvals router.

Pattern mirrors test_sync_router.py / test_shape_router.py:
  - Throwaway FastAPI app with the router mounted under /api/v1.
  - get_tenant_context overridden via dependency_overrides to inject a fake
    TenantContext without touching JWT/DB plumbing.
  - get_service_client patched to a MagicMock so no real Supabase calls are made.
  - run_worker patched with AsyncMock so no real worker/LLM calls are made.

Acceptance coverage:
  - approve → run_worker called, row updated to status="executed".
  - approve with run_worker returning success=False → status="failed".
  - reject → row updated to status="rejected", run_worker NOT called.
  - cross-tenant (equipe filter returns empty) → 404.
  - unknown decision_id (not found) → 404.
  - unknown action value → 422.
"""

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.deps import get_tenant_context
from app.routers.approvals import router, _reconstruct_intent_decision
from app.schemas import ActionResult, IntentDecision
from app.security import TenantContext

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

EQUIPE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
ACTOR_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
DECISION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
OPPORTUNITY_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
LEAD_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"

FAKE_CTX = TenantContext(equipe_id=EQUIPE_ID, actor_user_id=ACTOR_ID, role="admin")

# A realistic ai_decisions row as returned by Supabase
FAKE_ROW = {
    "id": DECISION_ID,
    "equipe_id": EQUIPE_ID,
    "lead_id": LEAD_ID,
    "opportunity_id": OPPORTUNITY_ID,
    "pipeline_id": "ffffffff-ffff-4fff-8fff-ffffffffffff",
    "agent_role": "floor_doorman",
    "status": "pending_approval",
    "actor": "copilot",
    "resolved_by": None,
    "resolved_at": None,
    "confidence_score": 0.72,
    "decision_type": "action",
    "output_action": {
        "verb": "add_note",
        "content": "Lead qualificado pelo Copilot",
        "skill": "core_table",
        "automation_kind": "deterministic",
        "reason": "High-intent lead detected",
    },
}


# ---------------------------------------------------------------------------
# Fake Supabase client factory
# ---------------------------------------------------------------------------


def _make_fake_client(*, row: dict | None = FAKE_ROW) -> MagicMock:
    """Return a mock Supabase client whose table().select()...execute() returns row."""
    rows = [row] if row is not None else []

    # Build the select chain: table().select().eq().eq().limit().execute()
    select_resp = MagicMock()
    select_resp.data = rows

    select_chain = MagicMock()
    select_chain.execute.return_value = select_resp
    select_chain.eq.return_value = select_chain
    select_chain.limit.return_value = select_chain

    # Build the update chain: table().update().eq().execute()
    update_resp = MagicMock()
    update_resp.data = [{"id": DECISION_ID}]

    update_chain = MagicMock()
    update_chain.execute.return_value = update_resp
    update_chain.eq.return_value = update_chain

    table_mock = MagicMock()
    table_mock.select.return_value = select_chain
    table_mock.update.return_value = update_chain

    client = MagicMock()
    client.table.return_value = table_mock
    return client


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------


def _make_app() -> FastAPI:
    """Throwaway app with fake tenant injected."""
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_tenant_context] = lambda: FAKE_CTX
    return app


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _post_resolve(
    http_client: TestClient,
    *,
    decision_id: str = DECISION_ID,
    action: str = "approve",
) -> object:
    return http_client.post(
        f"/api/v1/approvals/{decision_id}/resolve",
        json={"action": action},
    )


# ---------------------------------------------------------------------------
# approve → run_worker called, status="executed"
# ---------------------------------------------------------------------------


def test_approve_calls_run_worker_and_sets_executed() -> None:
    """Approve action → run_worker is awaited, row updated to 'executed'."""
    fake_client = _make_fake_client()
    success_result = ActionResult(success=True, detail={"info": "note added"})

    with patch("app.routers.approvals.get_service_client", return_value=fake_client), \
         patch("app.routers.approvals.run_worker", new_callable=AsyncMock) as mock_worker:
        mock_worker.return_value = success_result
        client = TestClient(_make_app())
        resp = _post_resolve(client, action="approve")

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "executed"
    assert body["decision_id"] == DECISION_ID
    assert body["result"]["success"] is True

    mock_worker.assert_awaited_once()


def test_approve_run_worker_receives_reconstructed_decision() -> None:
    """run_worker must receive an IntentDecision reconstructed from output_action."""
    fake_client = _make_fake_client()

    with patch("app.routers.approvals.get_service_client", return_value=fake_client), \
         patch("app.routers.approvals.run_worker", new_callable=AsyncMock) as mock_worker:
        mock_worker.return_value = ActionResult(success=True)
        client = TestClient(_make_app())
        _post_resolve(client, action="approve")

    kwargs = mock_worker.call_args.kwargs
    decision: IntentDecision = kwargs["decision"]
    assert decision.skill == "core_table"
    assert decision.automation_kind == "deterministic"
    assert decision.args.get("verb") == "add_note"
    assert decision.confidence == pytest.approx(0.72)
    assert decision.relevant is True


def test_approve_passes_ctx_to_run_worker() -> None:
    """run_worker must receive the TenantContext from the dependency."""
    fake_client = _make_fake_client()

    with patch("app.routers.approvals.get_service_client", return_value=fake_client), \
         patch("app.routers.approvals.run_worker", new_callable=AsyncMock) as mock_worker:
        mock_worker.return_value = ActionResult(success=True)
        client = TestClient(_make_app())
        _post_resolve(client, action="approve")

    kwargs = mock_worker.call_args.kwargs
    assert kwargs["ctx"].equipe_id == EQUIPE_ID


def test_approve_passes_opportunity_and_lead_dicts() -> None:
    """run_worker must receive minimal dicts with opportunity_id/lead_id from the row."""
    fake_client = _make_fake_client()

    with patch("app.routers.approvals.get_service_client", return_value=fake_client), \
         patch("app.routers.approvals.run_worker", new_callable=AsyncMock) as mock_worker:
        mock_worker.return_value = ActionResult(success=True)
        client = TestClient(_make_app())
        _post_resolve(client, action="approve")

    kwargs = mock_worker.call_args.kwargs
    assert kwargs["opportunity"] == {"id": OPPORTUNITY_ID}
    assert kwargs["lead"] == {"id": LEAD_ID}


# ---------------------------------------------------------------------------
# approve with run_worker returning success=False → status="failed"
# ---------------------------------------------------------------------------


def test_approve_sets_failed_when_worker_returns_failure() -> None:
    """When run_worker returns ActionResult(success=False), status must be 'failed'."""
    fake_client = _make_fake_client()
    fail_result = ActionResult(success=False, error="skill_error")

    with patch("app.routers.approvals.get_service_client", return_value=fake_client), \
         patch("app.routers.approvals.run_worker", new_callable=AsyncMock) as mock_worker:
        mock_worker.return_value = fail_result
        client = TestClient(_make_app())
        resp = _post_resolve(client, action="approve")

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "failed"
    assert body["result"]["success"] is False
    assert body["result"]["error"] == "skill_error"


def test_approve_updates_row_status_to_failed_on_worker_failure() -> None:
    """The DB update must set status='failed' when the worker fails."""
    fake_client = _make_fake_client()

    with patch("app.routers.approvals.get_service_client", return_value=fake_client), \
         patch("app.routers.approvals.run_worker", new_callable=AsyncMock) as mock_worker:
        mock_worker.return_value = ActionResult(success=False, error="boom")
        client = TestClient(_make_app())
        _post_resolve(client, action="approve")

    # Inspect the update call payload
    update_payload = fake_client.table.return_value.update.call_args[0][0]
    assert update_payload["status"] == "failed"
    assert update_payload["resolved_by"] == ACTOR_ID
    assert update_payload["resolved_at"] is not None


# ---------------------------------------------------------------------------
# approve → resolved_by and resolved_at are set
# ---------------------------------------------------------------------------


def test_approve_sets_resolved_by_and_resolved_at() -> None:
    """On approve, resolved_by must be ctx.actor_user_id and resolved_at non-null."""
    fake_client = _make_fake_client()

    with patch("app.routers.approvals.get_service_client", return_value=fake_client), \
         patch("app.routers.approvals.run_worker", new_callable=AsyncMock) as mock_worker:
        mock_worker.return_value = ActionResult(success=True)
        client = TestClient(_make_app())
        _post_resolve(client, action="approve")

    update_payload = fake_client.table.return_value.update.call_args[0][0]
    assert update_payload["resolved_by"] == ACTOR_ID
    assert update_payload["resolved_at"] is not None


# ---------------------------------------------------------------------------
# reject → row updated to "rejected", run_worker NOT called
# ---------------------------------------------------------------------------


def test_reject_updates_status_to_rejected() -> None:
    """Reject action → row status set to 'rejected', response body matches."""
    fake_client = _make_fake_client()

    with patch("app.routers.approvals.get_service_client", return_value=fake_client), \
         patch("app.routers.approvals.run_worker", new_callable=AsyncMock) as mock_worker:
        client = TestClient(_make_app())
        resp = _post_resolve(client, action="reject")

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "rejected"
    assert body["result"] is None
    mock_worker.assert_not_awaited()


def test_reject_sets_resolved_by_and_resolved_at() -> None:
    """On reject, resolved_by and resolved_at must be set in the DB update."""
    fake_client = _make_fake_client()

    with patch("app.routers.approvals.get_service_client", return_value=fake_client), \
         patch("app.routers.approvals.run_worker", new_callable=AsyncMock):
        client = TestClient(_make_app())
        _post_resolve(client, action="reject")

    update_payload = fake_client.table.return_value.update.call_args[0][0]
    assert update_payload["status"] == "rejected"
    assert update_payload["resolved_by"] == ACTOR_ID
    assert update_payload["resolved_at"] is not None


def test_reject_does_not_call_run_worker() -> None:
    """run_worker must never be called on a reject action."""
    fake_client = _make_fake_client()

    with patch("app.routers.approvals.get_service_client", return_value=fake_client), \
         patch("app.routers.approvals.run_worker", new_callable=AsyncMock) as mock_worker:
        client = TestClient(_make_app())
        _post_resolve(client, action="reject")

    mock_worker.assert_not_called()


# ---------------------------------------------------------------------------
# Not found / cross-tenant → 404
# ---------------------------------------------------------------------------


def test_unknown_decision_id_returns_404() -> None:
    """A decision_id that doesn't exist (empty result) → 404."""
    fake_client = _make_fake_client(row=None)

    with patch("app.routers.approvals.get_service_client", return_value=fake_client), \
         patch("app.routers.approvals.run_worker", new_callable=AsyncMock):
        client = TestClient(_make_app())
        resp = _post_resolve(client, decision_id="nonexistent-id", action="approve")

    assert resp.status_code == 404


def test_cross_tenant_decision_returns_404() -> None:
    """A decision owned by a different equipe_id → 404 (the eq filter returns empty)."""
    # The fake client already filters by equipe_id in the .eq() chain.
    # Simulate cross-tenant by returning no rows (as DB would when equipe_id doesn't match).
    fake_client = _make_fake_client(row=None)

    with patch("app.routers.approvals.get_service_client", return_value=fake_client), \
         patch("app.routers.approvals.run_worker", new_callable=AsyncMock):
        client = TestClient(_make_app())
        resp = _post_resolve(client, action="approve")

    assert resp.status_code == 404


def test_assert_equipe_mismatch_returns_403() -> None:
    """If assert_equipe fires (defense-in-depth), the handler returns 403."""
    # Return a row with a different equipe_id so assert_equipe raises GuardError
    bad_row = {**FAKE_ROW, "equipe_id": "99999999-9999-4999-8999-999999999999"}
    fake_client = _make_fake_client(row=bad_row)

    with patch("app.routers.approvals.get_service_client", return_value=fake_client), \
         patch("app.routers.approvals.run_worker", new_callable=AsyncMock):
        client = TestClient(_make_app())
        resp = _post_resolve(client, action="approve")

    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Unknown action value → 422
# ---------------------------------------------------------------------------


def test_unknown_action_returns_422() -> None:
    """An action value other than approve/reject must be rejected with 422."""
    fake_client = _make_fake_client()

    with patch("app.routers.approvals.get_service_client", return_value=fake_client):
        client = TestClient(_make_app())
        resp = client.post(
            f"/api/v1/approvals/{DECISION_ID}/resolve",
            json={"action": "execute"},  # not in Literal["approve","reject"]
        )

    assert resp.status_code == 422


def test_missing_action_field_returns_422() -> None:
    """Omitting the action field must return 422 (Pydantic validation)."""
    fake_client = _make_fake_client()

    with patch("app.routers.approvals.get_service_client", return_value=fake_client):
        client = TestClient(_make_app())
        resp = client.post(
            f"/api/v1/approvals/{DECISION_ID}/resolve",
            json={},
        )

    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Unit tests for _reconstruct_intent_decision helper
# ---------------------------------------------------------------------------


def test_reconstruct_intent_decision_basic_mapping() -> None:
    """Verify the field mapping from a standard output_action row."""
    row = {
        "confidence_score": 0.85,
        "output_action": {
            "verb": "move_stage",
            "stage_name_hint": "Qualificação",
            "skill": "core_table",
            "automation_kind": "deterministic",
            "reason": "Buyer intent detected",
        },
    }
    decision = _reconstruct_intent_decision(row)
    assert decision.skill == "core_table"
    assert decision.automation_kind == "deterministic"
    assert decision.args == {"verb": "move_stage", "stage_name_hint": "Qualificação"}
    assert decision.confidence == pytest.approx(0.85)
    assert decision.reason == "Buyer intent detected"
    assert decision.urgency == "normal"
    assert decision.relevant is True


def test_reconstruct_uses_summary_as_reason_fallback() -> None:
    """When reason is absent, summary should be used as reason."""
    row = {
        "confidence_score": 0.6,
        "output_action": {
            "summary": "Fallback summary",
            "skill": "core_table",
            "automation_kind": "deterministic",
        },
    }
    decision = _reconstruct_intent_decision(row)
    assert decision.reason == "Fallback summary"


def test_reconstruct_uses_approved_as_default_reason() -> None:
    """When neither reason nor summary present, reason defaults to 'approved'."""
    row = {
        "output_action": {
            "skill": "core_table",
            "automation_kind": "deterministic",
        },
    }
    decision = _reconstruct_intent_decision(row)
    assert decision.reason == "approved"


def test_reconstruct_urgency_from_urgent_flag() -> None:
    """When output_action has urgent=True, urgency must be 'urgent'."""
    row = {
        "output_action": {
            "skill": "core_table",
            "automation_kind": "deterministic",
            "urgent": True,
        },
    }
    decision = _reconstruct_intent_decision(row)
    assert decision.urgency == "urgent"


def test_reconstruct_confidence_defaults_to_1_0_when_null() -> None:
    """confidence_score=None → confidence defaults to 1.0."""
    row = {
        "confidence_score": None,
        "output_action": {"skill": "core_table", "automation_kind": "deterministic"},
    }
    decision = _reconstruct_intent_decision(row)
    assert decision.confidence == pytest.approx(1.0)


def test_reconstruct_automation_kind_defaults_to_deterministic() -> None:
    """When automation_kind is absent from output_action, defaults to 'deterministic'."""
    row = {
        "output_action": {"skill": "core_table"},
    }
    decision = _reconstruct_intent_decision(row)
    assert decision.automation_kind == "deterministic"


def test_reconstruct_meta_keys_excluded_from_args() -> None:
    """skill, automation_kind, reason, summary, urgent must NOT appear in args."""
    row = {
        "output_action": {
            "verb": "add_note",
            "content": "Note text",
            "skill": "core_table",
            "automation_kind": "deterministic",
            "reason": "some reason",
            "summary": "some summary",
            "urgent": True,
        },
    }
    decision = _reconstruct_intent_decision(row)
    for meta_key in ("skill", "automation_kind", "reason", "summary", "urgent"):
        assert meta_key not in decision.args, f"meta key '{meta_key}' leaked into args"
    assert decision.args == {"verb": "add_note", "content": "Note text"}


def test_reconstruct_empty_output_action() -> None:
    """An empty output_action dict must not raise; all fields get safe defaults."""
    row = {"output_action": {}}
    decision = _reconstruct_intent_decision(row)
    assert decision.skill is None
    assert decision.automation_kind == "deterministic"
    assert decision.args == {}
    assert decision.confidence == pytest.approx(1.0)
    assert decision.reason == "approved"
    assert decision.relevant is True


def test_reconstruct_none_output_action() -> None:
    """A None output_action (column was NULL) must not raise."""
    row = {"output_action": None}
    decision = _reconstruct_intent_decision(row)
    assert decision.skill is None
    assert decision.args == {}
