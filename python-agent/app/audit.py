from typing import Any, Optional
from supabase import Client


def record_decision(
    client: Client,
    *,
    equipe_id: str,
    lead_id: str,
    opportunity_id: Optional[str] = None,
    pipeline_id: Optional[str] = None,
    agent_role: str,
    decision_type: str,
    output_action: dict[str, Any],
    confidence: float,
    status: str = "auto_applied",
    actor: str,
    error_details: Optional[str] = None,
) -> str:
    """
    Record a Copilot cascade/agent decision to public.ai_decisions table.
    Maps confidence -> confidence_score, and validates status check constraint.
    """
    allowed_statuses = {"auto_applied", "pending_approval", "approved", "rejected", "executed", "failed", "proposed"}
    if status not in allowed_statuses:
        raise ValueError(
            f"Invalid status '{status}'. Must be one of: {', '.join(allowed_statuses)}"
        )

    # Insert payload mapping variables to database columns
    payload = {
        "equipe_id": equipe_id,
        "lead_id": lead_id,
        "opportunity_id": opportunity_id,
        "pipeline_id": pipeline_id,
        "agent_role": agent_role,
        "decision_type": decision_type,
        "output_action": output_action,
        "confidence_score": confidence,
        "status": status,
        "actor": actor,
    }
    if error_details is not None:
        payload["error_details"] = error_details

    # Execute insert to Supabase
    response = client.table("ai_decisions").insert(payload).execute()

    if not response.data:
        raise RuntimeError("Failed to record decision: insert returned empty data.")

    # Return the generated UUID id
    return response.data[0]["id"]
