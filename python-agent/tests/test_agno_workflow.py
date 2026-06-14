import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from app.security import TenantContext


@pytest.mark.asyncio
async def test_workflow_runs_same_outcome_as_legacy(monkeypatch):
    from app.cascade import agno_workflow

    async def fake_legacy(**kwargs):
        return {"status": "executed", "decision_id": "d1", "result": None}

    monkeypatch.setattr(agno_workflow, "_legacy_run_cascade", fake_legacy)

    ctx = TenantContext(equipe_id="e1", actor_user_id="u1", role="authenticated")
    out = await agno_workflow.run_workflow(
        ctx=ctx,
        lead_id="l1",
        opportunity_id=None,
        pipeline_id=None,
        trigger="sync",
    )

    assert out["status"] == "executed"
    assert "decision_id" in out


@pytest.mark.asyncio
async def test_public_run_cascade_delegates_when_flag_enabled(monkeypatch):
    from app.cascade import workflow

    class Settings:
        copilot_workflow_enabled = True

    async def fake_workflow(**kwargs):
        return {"status": "workflow", "decision_id": "d2", "result": None}

    monkeypatch.setattr(workflow, "get_settings", lambda: Settings())
    monkeypatch.setattr("app.cascade.agno_workflow.run_workflow", fake_workflow)

    ctx = TenantContext(equipe_id="e1", actor_user_id="u1", role="authenticated")
    out = await workflow.run_cascade(
        ctx=ctx,
        lead_id="l1",
        opportunity_id=None,
        pipeline_id=None,
        trigger="sync",
        client=object(),
    )

    assert out["status"] == "workflow"
