"""Tests for app.cascade.workflow.run_cascade — the E6 orchestration cascade.

The doormen (Tower/Floor) and worker are patched; the supabase client is mocked.
No real network or model calls happen here.
"""

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from app.cascade import workflow
from app.schemas import ActionResult, IntentDecision, RouteDecision
from app.security import TenantContext


@pytest.fixture
def ctx() -> TenantContext:
    return TenantContext(equipe_id="tenant-123", actor_user_id="user-456", role="authenticated")


class _FakeQuery:
    """Minimal fluent supabase query stub returning canned rows on execute()."""

    def __init__(self, data):
        self._data = data

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def is_(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        resp = MagicMock()
        resp.error = None
        resp.data = self._data
        return resp


def _client(*, lead=None, opportunity=None, rules=None, messages=None, pipelines=None):
    """Build a fake supabase client routing reads by table name."""
    lead = lead if lead is not None else {"id": "lead-1", "equipe_id": "tenant-123", "name": "Ana"}
    opportunity = opportunity  # may be None
    rules = rules  # may be None -> empty rows
    messages = messages if messages is not None else [
        {"content": "Quero comprar agora", "sender_type": "customer", "created_at": "2026-06-08T10:00:00Z"}
    ]
    pipelines = pipelines if pipelines is not None else [{"id": "pipe-1", "name": "Vendas"}]

    def table(name):
        if name == "leads":
            return _FakeQuery([lead] if lead else [])
        if name == "opportunities":
            return _FakeQuery([opportunity] if opportunity else [])
        if name == "pipeline_agent_rules":
            return _FakeQuery([rules] if rules else [])
        if name == "messages":
            return _FakeQuery(messages)
        if name == "pipelines":
            return _FakeQuery(pipelines)
        return _FakeQuery([])

    client = MagicMock()
    client.table.side_effect = table
    return client


@pytest.mark.asyncio
async def test_sync_relevant_routes_and_executes(ctx):
    """(a) sync + relevant intent on an existing opportunity → worker runs + record_decision(executed)."""
    opp = {"id": "opp-1", "equipe_id": "tenant-123", "pipeline_id": "pipe-1", "stage_id": "s0"}
    client = _client(opportunity=opp, rules={"confidence_threshold": 0.75, "enabled_skills": ["core_table"], "doorman_model": "gpt-4o-mini"})

    route = RouteDecision(contact_type="lead", pipeline_id="pipe-1", confidence=0.9, reason="ok")
    intent = IntentDecision(
        relevant=True,
        automation_kind="deterministic",
        skill="core_table",
        args={"verb": "move_stage", "stage_type": "won"},
        confidence=0.4,  # below threshold, but sync forces auto-apply
        reason="mover etapa",
    )

    with patch.object(workflow, "classify_and_route", new=AsyncMock(return_value=route)), \
         patch.object(workflow, "triage_intent", new=AsyncMock(return_value=intent)), \
         patch.object(workflow, "run_worker", new=AsyncMock(return_value=ActionResult(success=True, detail={"action": "move_stage"}))) as mock_worker, \
         patch.object(workflow, "record_decision", return_value="dec-1") as mock_record:
        result = await workflow.run_cascade(
            ctx=ctx,
            lead_id="lead-1",
            opportunity_id="opp-1",
            pipeline_id="pipe-1",
            trigger="sync",
            client=client,
        )

    mock_worker.assert_awaited_once()
    assert mock_record.call_count >= 1
    statuses = [c.kwargs.get("status") for c in mock_record.call_args_list]
    assert "executed" in statuses
    exec_call = next(c for c in mock_record.call_args_list if c.kwargs.get("status") == "executed")
    assert exec_call.kwargs["agent_role"] == "floor_doorman"
    assert exec_call.kwargs["actor"] == "user-456"  # sync uses actor_user_id
    assert result["status"] == "executed"
    assert result["decision_id"] == "dec-1"


@pytest.mark.asyncio
async def test_low_confidence_background_pending_no_mutation(ctx):
    """(b) background ingest, confidence < threshold → pending_approval, worker NOT called."""
    opp = {"id": "opp-1", "equipe_id": "tenant-123", "pipeline_id": "pipe-1", "stage_id": "s0"}
    client = _client(opportunity=opp, rules={"confidence_threshold": 0.75, "enabled_skills": ["core_table"], "doorman_model": "gpt-4o-mini"})

    route = RouteDecision(contact_type="lead", pipeline_id="pipe-1", confidence=0.9, reason="ok")
    intent = IntentDecision(
        relevant=True,
        automation_kind="deterministic",
        skill="core_table",
        args={"verb": "move_stage"},
        confidence=0.3,  # below 0.75 threshold
        reason="talvez mover",
    )

    note_skill = MagicMock()
    note_skill.add_note = AsyncMock(return_value=ActionResult(success=True))

    with patch.object(workflow, "classify_and_route", new=AsyncMock(return_value=route)), \
         patch.object(workflow, "triage_intent", new=AsyncMock(return_value=intent)), \
         patch.object(workflow, "run_worker", new=AsyncMock()) as mock_worker, \
         patch.object(workflow, "CoreTableSkill", return_value=note_skill), \
         patch.object(workflow, "record_decision", return_value="dec-2") as mock_record:
        result = await workflow.run_cascade(
            ctx=ctx,
            lead_id="lead-1",
            opportunity_id="opp-1",
            pipeline_id="pipe-1",
            trigger="ingest",
            client=client,
        )

    mock_worker.assert_not_called()
    statuses = [c.kwargs.get("status") for c in mock_record.call_args_list]
    assert "pending_approval" in statuses
    pending = next(c for c in mock_record.call_args_list if c.kwargs.get("status") == "pending_approval")
    assert pending.kwargs["agent_role"] == "floor_doorman"
    assert pending.kwargs["actor"] == "copilot"  # background uses copilot
    note_skill.add_note.assert_awaited_once()
    assert result["status"] == "pending_approval"


@pytest.mark.asyncio
async def test_irrelevant_background_returns_early(ctx):
    """(c) irrelevant conversation + non-sync → returns early, doormen never called."""
    client = _client(messages=[{"content": "  "}])  # whitespace -> not relevant

    with patch.object(workflow, "classify_and_route", new=AsyncMock()) as mock_tower, \
         patch.object(workflow, "triage_intent", new=AsyncMock()) as mock_floor, \
         patch.object(workflow, "run_worker", new=AsyncMock()) as mock_worker, \
         patch.object(workflow, "record_decision") as mock_record:
        result = await workflow.run_cascade(
            ctx=ctx,
            lead_id="lead-1",
            opportunity_id=None,
            pipeline_id="pipe-1",
            trigger="ingest",
            client=client,
        )

    mock_tower.assert_not_called()
    mock_floor.assert_not_called()
    mock_worker.assert_not_called()
    mock_record.assert_not_called()
    assert result["status"] == "skipped_irrelevant"


@pytest.mark.asyncio
async def test_agentic_intent_runs_worker(ctx):
    """(d) agentic intent at/above threshold → run_worker invoked (worker handles E4 delegation)."""
    opp = {"id": "opp-1", "equipe_id": "tenant-123", "pipeline_id": "pipe-1", "stage_id": "s0"}
    client = _client(opportunity=opp, rules={"confidence_threshold": 0.5, "enabled_skills": ["core_table"], "autonomy_cost_ceiling": 5, "doorman_model": "gpt-4o-mini"})

    route = RouteDecision(contact_type="lead", pipeline_id="pipe-1", confidence=0.9, reason="ok")
    intent = IntentDecision(
        relevant=True,
        automation_kind="agentic",
        skill="core_table",
        args={},
        confidence=0.95,  # >= 0.5 threshold
        reason="multiplas acoes",
    )

    with patch.object(workflow, "classify_and_route", new=AsyncMock(return_value=route)), \
         patch.object(workflow, "triage_intent", new=AsyncMock(return_value=intent)), \
         patch.object(workflow, "run_worker", new=AsyncMock(return_value=ActionResult(success=True, detail={"applied": []}))) as mock_worker, \
         patch.object(workflow, "record_decision", return_value="dec-3") as mock_record:
        result = await workflow.run_cascade(
            ctx=ctx,
            lead_id="lead-1",
            opportunity_id="opp-1",
            pipeline_id="pipe-1",
            trigger="ingest",
            client=client,
        )

    mock_worker.assert_awaited_once()
    # worker receives the agentic decision; it is responsible for the E4 delegation.
    assert mock_worker.await_args.kwargs["decision"].automation_kind == "agentic"
    statuses = [c.kwargs.get("status") for c in mock_record.call_args_list]
    assert "executed" in statuses
    assert result["status"] == "executed"


@pytest.mark.asyncio
async def test_spam_route_not_routed(ctx):
    """(e) spam classification → pipeline forced None, no opportunity created, no floor/worker."""
    client = _client(opportunity=None, rules={"confidence_threshold": 0.75, "enabled_skills": ["core_table"], "doorman_model": "gpt-4o-mini"})

    route = RouteDecision(contact_type="spam", pipeline_id="pipe-1", confidence=0.99, reason="propaganda")

    create_skill = MagicMock()
    create_skill.create_opportunity = AsyncMock()

    with patch.object(workflow, "classify_and_route", new=AsyncMock(return_value=route)), \
         patch.object(workflow, "triage_intent", new=AsyncMock()) as mock_floor, \
         patch.object(workflow, "run_worker", new=AsyncMock()) as mock_worker, \
         patch.object(workflow, "CoreTableSkill", return_value=create_skill), \
         patch.object(workflow, "record_decision", return_value="dec-4") as mock_record:
        result = await workflow.run_cascade(
            ctx=ctx,
            lead_id="lead-1",
            opportunity_id=None,
            pipeline_id="pipe-1",
            trigger="ingest",
            client=client,
        )

    create_skill.create_opportunity.assert_not_called()
    mock_floor.assert_not_called()
    mock_worker.assert_not_called()
    assert result["status"] in {"skipped_spam", "not_routed"}


@pytest.mark.asyncio
async def test_missing_rules_uses_defaults(ctx):
    """Missing pipeline_agent_rules row → defaults (threshold 0.75) applied; no crash."""
    opp = {"id": "opp-1", "equipe_id": "tenant-123", "pipeline_id": "pipe-1", "stage_id": "s0"}
    client = _client(opportunity=opp, rules=None)  # no rules row

    route = RouteDecision(contact_type="lead", pipeline_id="pipe-1", confidence=0.9, reason="ok")
    intent = IntentDecision(
        relevant=True,
        automation_kind="none",
        confidence=0.99,
        reason="nada a fazer",
    )

    fake_settings = MagicMock(doorman_model="gpt-4o-mini", worker_model="gpt-4o")

    with patch.object(workflow, "classify_and_route", new=AsyncMock(return_value=route)), \
         patch.object(workflow, "triage_intent", new=AsyncMock(return_value=intent)) as mock_floor, \
         patch.object(workflow, "run_worker", new=AsyncMock(return_value=ActionResult(success=True, detail={}))) as mock_worker, \
         patch.object(workflow, "get_settings", return_value=fake_settings), \
         patch.object(workflow, "record_decision", return_value="dec-5"):
        result = await workflow.run_cascade(
            ctx=ctx,
            lead_id="lead-1",
            opportunity_id="opp-1",
            pipeline_id="pipe-1",
            trigger="sync",
            client=client,
        )

    # default threshold resolved without a rules row
    assert mock_floor.await_args.kwargs["pipeline_rules"]["confidence_threshold"] == 0.75
    mock_worker.assert_awaited_once()
    assert result["status"] == "executed"


@pytest.mark.asyncio
async def test_route_creates_opportunity_when_none(ctx):
    """No existing opportunity + confident lead route → create_opportunity called, cascade continues."""
    client = _client(opportunity=None, rules={"confidence_threshold": 0.75, "enabled_skills": ["core_table"], "doorman_model": "gpt-4o-mini"})

    route = RouteDecision(contact_type="lead", pipeline_id="pipe-1", confidence=0.9, reason="lead claro")
    intent = IntentDecision(relevant=True, automation_kind="none", confidence=0.9, reason="ok")

    create_skill = MagicMock()
    create_skill.create_opportunity = AsyncMock(
        return_value=ActionResult(
            success=True,
            detail={"opportunity_id": "opp-new", "pipeline_id": "pipe-1", "stage_id": "s0", "created": True},
        )
    )

    with patch.object(workflow, "classify_and_route", new=AsyncMock(return_value=route)), \
         patch.object(workflow, "triage_intent", new=AsyncMock(return_value=intent)) as mock_floor, \
         patch.object(workflow, "run_worker", new=AsyncMock(return_value=ActionResult(success=True))), \
         patch.object(workflow, "CoreTableSkill", return_value=create_skill), \
         patch.object(workflow, "record_decision", return_value="dec-6"):
        result = await workflow.run_cascade(
            ctx=ctx,
            lead_id="lead-1",
            opportunity_id=None,
            pipeline_id="pipe-1",
            trigger="ingest",
            client=client,
        )

    create_skill.create_opportunity.assert_awaited_once()
    # Floor triage runs on the freshly created opportunity.
    mock_floor.assert_awaited_once()
    assert mock_floor.await_args.kwargs["opportunity"]["id"] == "opp-new"
    assert result["status"] in {"executed", "no_action"}


@pytest.mark.asyncio
async def test_route_below_threshold_pending_no_create(ctx):
    """No opportunity + route confidence < threshold + background → pending_approval, no create, no floor."""
    client = _client(opportunity=None, rules={"confidence_threshold": 0.75, "enabled_skills": ["core_table"], "doorman_model": "gpt-4o-mini"})

    route = RouteDecision(contact_type="lead", pipeline_id="pipe-1", confidence=0.4, reason="incerto")

    create_skill = MagicMock()
    create_skill.create_opportunity = AsyncMock()

    with patch.object(workflow, "classify_and_route", new=AsyncMock(return_value=route)), \
         patch.object(workflow, "triage_intent", new=AsyncMock()) as mock_floor, \
         patch.object(workflow, "run_worker", new=AsyncMock()) as mock_worker, \
         patch.object(workflow, "CoreTableSkill", return_value=create_skill), \
         patch.object(workflow, "record_decision", return_value="dec-7") as mock_record:
        result = await workflow.run_cascade(
            ctx=ctx,
            lead_id="lead-1",
            opportunity_id=None,
            pipeline_id="pipe-1",
            trigger="ingest",
            client=client,
        )

    create_skill.create_opportunity.assert_not_called()
    mock_floor.assert_not_called()
    mock_worker.assert_not_called()
    tower_pending = next(
        c for c in mock_record.call_args_list
        if c.kwargs.get("status") == "pending_approval" and c.kwargs.get("agent_role") == "tower_doorman"
    )
    assert tower_pending is not None
    assert result["status"] == "pending_approval"


@pytest.mark.asyncio
async def test_urgent_pending_flags_realtime(ctx):
    """Urgent low-confidence floor decision → output_action marked urgent for Realtime."""
    opp = {"id": "opp-1", "equipe_id": "tenant-123", "pipeline_id": "pipe-1", "stage_id": "s0"}
    client = _client(opportunity=opp, rules={"confidence_threshold": 0.75, "enabled_skills": ["core_table"], "doorman_model": "gpt-4o-mini"})

    route = RouteDecision(contact_type="lead", pipeline_id="pipe-1", confidence=0.9, reason="ok")
    intent = IntentDecision(
        relevant=True,
        automation_kind="deterministic",
        skill="core_table",
        args={"verb": "move_stage"},
        urgency="urgent",
        confidence=0.2,
        reason="urgente",
    )

    note_skill = MagicMock()
    note_skill.add_note = AsyncMock(return_value=ActionResult(success=True))

    with patch.object(workflow, "classify_and_route", new=AsyncMock(return_value=route)), \
         patch.object(workflow, "triage_intent", new=AsyncMock(return_value=intent)), \
         patch.object(workflow, "run_worker", new=AsyncMock()), \
         patch.object(workflow, "CoreTableSkill", return_value=note_skill), \
         patch.object(workflow, "record_decision", return_value="dec-8") as mock_record:
        await workflow.run_cascade(
            ctx=ctx,
            lead_id="lead-1",
            opportunity_id="opp-1",
            pipeline_id="pipe-1",
            trigger="ingest",
            client=client,
        )

    pending = next(c for c in mock_record.call_args_list if c.kwargs.get("status") == "pending_approval")
    assert pending.kwargs["output_action"].get("urgent") is True
