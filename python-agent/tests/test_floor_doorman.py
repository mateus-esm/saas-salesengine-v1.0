"""Tests for app.cascade.floor_doorman — all LLM calls are mocked."""

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Import core_table so the registry is populated before tests run.
import app.skills.core_table  # noqa: F401
from app.cascade.floor_doorman import triage_intent
from app.schemas import IntentDecision
from app.security import TenantContext

EQUIPE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
ACTOR_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
PIPELINE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
OPPORTUNITY_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
LEAD_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff"

CTX = TenantContext(equipe_id=EQUIPE_ID, actor_user_id=ACTOR_ID, role="admin")

OPPORTUNITY = {
    "id": OPPORTUNITY_ID,
    "lead_id": LEAD_ID,
    "pipeline_id": PIPELINE_ID,
    "stage_id": "stage-1",
    "status": "open",
    "custom_data": {},
}

PIPELINE_RULES_ENABLED = {
    "enabled_skills": ["core_table"],
    "extraction_hints": {"quartos": "number", "valor_condominio": "currency"},
    "confidence_threshold": 0.7,
    "reasoning_enabled": False,
}

PIPELINE_RULES_EMPTY = {
    "enabled_skills": [],
    "extraction_hints": {},
    "confidence_threshold": 0.7,
    "reasoning_enabled": False,
}


def _mock_response(decision: IntentDecision) -> MagicMock:
    resp = MagicMock()
    resp.content = decision
    return resp


def _make_decision(**kwargs) -> IntentDecision:
    defaults = {
        "relevant": True,
        "automation_kind": "deterministic",
        "skill": "core_table",
        "args": {"verb": "move_stage", "opportunity_id": OPPORTUNITY_ID, "stage_type": "open"},
        "urgency": "normal",
        "confidence": 0.85,
        "reason": "Lead confirmou visita — mover para Visita Agendada.",
    }
    defaults.update(kwargs)
    return IntentDecision(**defaults)


@pytest.mark.asyncio
async def test_valid_deterministic_decision_returned() -> None:
    decision = _make_decision()

    with patch("app.cascade.floor_doorman.Agent") as MockAgent:
        MockAgent.return_value.arun = AsyncMock(return_value=_mock_response(decision))
        result = await triage_intent(
            ctx=CTX,
            conversation="Confirmei a visita para segunda de manhã, são 3 quartos.",
            opportunity=OPPORTUNITY,
            pipeline_rules=PIPELINE_RULES_ENABLED,
            model_id="gpt-4o",
        )

    assert isinstance(result, IntentDecision)
    assert result.relevant is True
    assert result.automation_kind == "deterministic"
    assert result.skill == "core_table"


@pytest.mark.asyncio
async def test_out_of_registry_skill_is_downgraded() -> None:
    """A skill not in the registry must be downgraded to relevant=False."""
    bad_decision = _make_decision(skill="nonexistent_skill")
    rules = {**PIPELINE_RULES_ENABLED, "enabled_skills": ["nonexistent_skill"]}

    with patch("app.cascade.floor_doorman.Agent") as MockAgent:
        MockAgent.return_value.arun = AsyncMock(return_value=_mock_response(bad_decision))
        result = await triage_intent(
            ctx=CTX,
            conversation="Quero agendar uma visita.",
            opportunity=OPPORTUNITY,
            pipeline_rules=rules,
            model_id="gpt-4o",
        )

    assert result.relevant is False
    assert result.skill is None
    assert result.automation_kind == "none"
    assert "Downgraded" in result.reason


@pytest.mark.asyncio
async def test_skill_not_in_enabled_list_is_downgraded() -> None:
    """A registered skill not in enabled_skills must be downgraded."""
    decision = _make_decision(skill="core_table")  # core_table IS registered
    rules = {**PIPELINE_RULES_ENABLED, "enabled_skills": []}  # but not enabled here

    with patch("app.cascade.floor_doorman.Agent") as MockAgent:
        MockAgent.return_value.arun = AsyncMock(return_value=_mock_response(decision))
        result = await triage_intent(
            ctx=CTX,
            conversation="Quero confirmar a visita.",
            opportunity=OPPORTUNITY,
            pipeline_rules=rules,
            model_id="gpt-4o",
        )

    assert result.relevant is False
    assert result.skill is None
    assert "Downgraded" in result.reason


@pytest.mark.asyncio
async def test_registered_and_enabled_skill_passes_through() -> None:
    """core_table is registered AND in enabled_skills — should not be downgraded."""
    decision = _make_decision(skill="core_table")

    with patch("app.cascade.floor_doorman.Agent") as MockAgent:
        MockAgent.return_value.arun = AsyncMock(return_value=_mock_response(decision))
        result = await triage_intent(
            ctx=CTX,
            conversation="São 3 quartos e a mobília é de alto padrão.",
            opportunity=OPPORTUNITY,
            pipeline_rules=PIPELINE_RULES_ENABLED,
            model_id="gpt-4o",
        )

    assert result.skill == "core_table"
    assert result.relevant is True


@pytest.mark.asyncio
async def test_irrelevant_conversation_returns_none_kind() -> None:
    irrelevant = _make_decision(
        relevant=False,
        automation_kind="none",
        skill=None,
        args={},
        confidence=0.9,
        reason="Saudação sem dados relevantes para CRM.",
    )

    with patch("app.cascade.floor_doorman.Agent") as MockAgent:
        MockAgent.return_value.arun = AsyncMock(return_value=_mock_response(irrelevant))
        result = await triage_intent(
            ctx=CTX,
            conversation="Oi, tudo bem?",
            opportunity=OPPORTUNITY,
            pipeline_rules=PIPELINE_RULES_ENABLED,
            model_id="gpt-4o",
        )

    assert result.relevant is False
    assert result.automation_kind == "none"
    assert result.skill is None


@pytest.mark.asyncio
async def test_urgency_preserved_on_downgrade() -> None:
    """urgency from the original decision should carry over after a downgrade."""
    urgent_bad = _make_decision(skill="unknown_skill", urgency="urgent")
    rules = {**PIPELINE_RULES_ENABLED, "enabled_skills": ["unknown_skill"]}

    with patch("app.cascade.floor_doorman.Agent") as MockAgent:
        MockAgent.return_value.arun = AsyncMock(return_value=_mock_response(urgent_bad))
        result = await triage_intent(
            ctx=CTX,
            conversation="URGENTE: preciso marcar hoje!",
            opportunity=OPPORTUNITY,
            pipeline_rules=rules,
            model_id="gpt-4o",
        )

    assert result.relevant is False
    assert result.urgency == "urgent"


@pytest.mark.asyncio
async def test_agentic_kind_accepted() -> None:
    agentic = _make_decision(
        automation_kind="agentic",
        skill="core_table",
        args={"goal": "extract and update all custom fields from this conversation"},
    )

    with patch("app.cascade.floor_doorman.Agent") as MockAgent:
        MockAgent.return_value.arun = AsyncMock(return_value=_mock_response(agentic))
        result = await triage_intent(
            ctx=CTX,
            conversation="São 3 quartos, condomínio R$850, visita na segunda às 10h.",
            opportunity=OPPORTUNITY,
            pipeline_rules=PIPELINE_RULES_ENABLED,
            model_id="gpt-4o",
        )

    assert result.automation_kind == "agentic"
    assert result.skill == "core_table"


@pytest.mark.asyncio
async def test_null_skill_is_not_downgraded() -> None:
    """skill=None (automation_kind=none) must never trigger the downgrade guard."""
    no_skill = _make_decision(
        relevant=False,
        automation_kind="none",
        skill=None,
        args={},
        reason="Sem ação necessária.",
    )

    with patch("app.cascade.floor_doorman.Agent") as MockAgent:
        MockAgent.return_value.arun = AsyncMock(return_value=_mock_response(no_skill))
        result = await triage_intent(
            ctx=CTX,
            conversation="Ok, entendido.",
            opportunity=OPPORTUNITY,
            pipeline_rules=PIPELINE_RULES_EMPTY,
            model_id="gpt-4o",
        )

    assert result.skill is None
    assert "Downgraded" not in result.reason


@pytest.mark.asyncio
async def test_dict_response_content_is_validated() -> None:
    """If Agno returns a plain dict, model_validate must produce IntentDecision."""
    raw = {
        "relevant": True,
        "automation_kind": "deterministic",
        "skill": "core_table",
        "args": {"verb": "add_note", "lead_id": LEAD_ID, "content": "Lead confirmou interesse."},
        "urgency": "normal",
        "confidence": 0.8,
        "reason": "Adicionar nota sobre interesse confirmado.",
    }
    resp = MagicMock()
    resp.content = raw

    with patch("app.cascade.floor_doorman.Agent") as MockAgent:
        MockAgent.return_value.arun = AsyncMock(return_value=resp)
        result = await triage_intent(
            ctx=CTX,
            conversation="Sim, tenho interesse!",
            opportunity=OPPORTUNITY,
            pipeline_rules=PIPELINE_RULES_ENABLED,
            model_id="gpt-4o",
        )

    assert isinstance(result, IntentDecision)
    assert result.automation_kind == "deterministic"
