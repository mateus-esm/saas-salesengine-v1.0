import sys
from pathlib import Path
from unittest.mock import MagicMock
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.audit import record_decision


def test_record_decision_success():
    # Setup mock supabase client
    mock_client = MagicMock()
    mock_response = MagicMock()
    # Mock data returned by supabase insertion (returns the created row, including generated id)
    mock_response.data = [{"id": "mock-decision-uuid-1234"}]
    mock_client.table.return_value.insert.return_value.execute.return_value = mock_response

    # Test parameters
    equipe_id = "tenant-123"
    lead_id = "lead-456"
    opportunity_id = "opp-789"
    pipeline_id = "pipe-000"
    agent_role = "tower_doorman"
    decision_type = "classify_contact"
    output_action = {"action": "move_stage", "stage": "qualified"}
    confidence = 0.95
    status = "pending_approval"
    actor = "copilot"

    decision_id = record_decision(
        mock_client,
        equipe_id=equipe_id,
        lead_id=lead_id,
        opportunity_id=opportunity_id,
        pipeline_id=pipeline_id,
        agent_role=agent_role,
        decision_type=decision_type,
        output_action=output_action,
        confidence=confidence,
        status=status,
        actor=actor,
    )

    # Assertions
    assert decision_id == "mock-decision-uuid-1234"
    mock_client.table.assert_called_once_with("ai_decisions")
    
    # Check that insert was called with mapped payload parameters
    inserted_payload = mock_client.table.return_value.insert.call_args[0][0]
    assert inserted_payload["equipe_id"] == equipe_id
    assert inserted_payload["lead_id"] == lead_id
    assert inserted_payload["opportunity_id"] == opportunity_id
    assert inserted_payload["pipeline_id"] == pipeline_id
    assert inserted_payload["agent_role"] == agent_role
    assert inserted_payload["decision_type"] == decision_type
    assert inserted_payload["output_action"] == output_action
    assert inserted_payload["confidence_score"] == confidence  # check correct rename
    assert inserted_payload["status"] == status
    assert inserted_payload["actor"] == actor


def test_record_decision_invalid_status():
    mock_client = MagicMock()
    with pytest.raises(ValueError) as exc_info:
        record_decision(
            mock_client,
            equipe_id="tenant-123",
            lead_id="lead-456",
            agent_role="worker",
            decision_type="update_field",
            output_action={},
            confidence=0.8,
            status="invalid_status_value",  # Invalid status
            actor="user-uuid-1",
        )
    assert "Invalid status" in str(exc_info.value)


def test_record_decision_db_failure():
    mock_client = MagicMock()
    mock_response = MagicMock()
    # Mock database insert returning empty list (e.g. failure/no rows returned)
    mock_response.data = []
    mock_client.table.return_value.insert.return_value.execute.return_value = mock_response

    with pytest.raises(RuntimeError) as exc_info:
        record_decision(
            mock_client,
            equipe_id="tenant-123",
            lead_id="lead-456",
            agent_role="worker",
            decision_type="update_field",
            output_action={},
            confidence=0.8,
            status="auto_applied",
            actor="copilot",
        )
    assert "Failed to record decision" in str(exc_info.value)
