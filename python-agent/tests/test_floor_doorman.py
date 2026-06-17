"""Tests for app.cascade.floor_doorman — all LLM calls are mocked."""

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Import core_table so the registry is populated before tests run.
import app.skills.core_table  # noqa: F401
from app.cascade import floor_doorman
from app.cascade.floor_doorman import triage_intent, triage_plan
from app.schemas import ActionPlan, IntentDecision, PlannedAction
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


@pytest.mark.asyncio
async def test_triage_plan_returns_actionplan(monkeypatch) -> None:
    async def fake_run(agent, message):
        return type(
            "R",
            (),
            {
                "content": ActionPlan(
                    relevant=True,
                    actions=[PlannedAction(verb="set_field", args={"field_id": "f1", "value": "x"})],
                    confidence=0.8,
                    reason="ok",
                )
            },
        )()

    monkeypatch.setattr(floor_doorman, "_arun_agent", fake_run)

    plan = await triage_plan(
        ctx=CTX,
        conversation="oi",
        opportunity={"id": "o1", "pipeline_id": "p1", "stage_id": "s1"},
        pipeline_rules={},
        model_id="deepseek-v4-flash",
    )
    assert isinstance(plan, ActionPlan)
    assert plan.actions[0].verb == "set_field"
    assert plan.actions[0].requires_confirmation is False


@pytest.mark.asyncio
async def test_triage_plan_flags_high_stakes_confirmation(monkeypatch) -> None:
    async def fake_run(agent, message):
        return type(
            "R",
            (),
            {
                "content": ActionPlan(
                    relevant=True,
                    actions=[
                        PlannedAction(verb="set_field", args={"field_id": "f1", "value": "x"}),
                        PlannedAction(verb="move_stage", args={"stage_type": "won"}),
                        PlannedAction(verb="trigger_webhook", args={"url": "https://x"}),
                    ],
                    confidence=0.9,
                    reason="enrich then close",
                )
            },
        )()

    monkeypatch.setattr(floor_doorman, "_arun_agent", fake_run)

    plan = await triage_plan(
        ctx=CTX,
        conversation="fechado!",
        opportunity={"id": "o1", "pipeline_id": "p1", "stage_id": "s1"},
        pipeline_rules={},
        model_id="deepseek-v4-flash",
    )
    assert plan.actions[0].requires_confirmation is False  # routine set_field
    assert plan.actions[1].requires_confirmation is True   # won move
    assert plan.actions[2].requires_confirmation is True   # webhook


# ─── T4: Intent Safety Net tests ────────────────────────────────────────────

from app.cascade.floor_doorman import detect_high_intent, HIGH_INTENT_KEYWORDS  # noqa: E402


def test_detect_high_intent_returns_keyword_for_scheduling_message() -> None:
    """detect_high_intent must return a keyword when a scheduling word is present."""
    result = detect_high_intent("vamos marcar uma reunião amanhã?")
    assert result is not None
    assert result in HIGH_INTENT_KEYWORDS


def test_detect_high_intent_matches_accent_insensitively() -> None:
    """'reuniao' (no accent) must match 'reunião' in the keyword set."""
    result = detect_high_intent("preciso agendar uma reuniao hoje")
    assert result is not None
    # canonical form in HIGH_INTENT_KEYWORDS is "reunião" or "reuniao" — either is fine
    assert result in HIGH_INTENT_KEYWORDS


def test_detect_high_intent_returns_none_for_irrelevant_message() -> None:
    """detect_high_intent must return None when no scheduling keyword is present."""
    assert detect_high_intent("bom dia, tudo bem?") is None


def test_detect_high_intent_returns_none_for_empty_string() -> None:
    """Edge case: empty conversation must return None."""
    assert detect_high_intent("") is None


def test_high_intent_keywords_appear_in_system_prompt() -> None:
    """_SYSTEM_PT must contain a high-intent instruction block so the LLM is calibrated."""
    from app.cascade.floor_doorman import _SYSTEM_PT
    # The prompt must mention at least one canonical scheduling keyword
    assert any(kw in _SYSTEM_PT for kw in ("reunião", "agendar", "marcar", "meeting", "call"))


@pytest.mark.asyncio
async def test_triage_intent_sets_intent_detected_even_when_llm_returns_none_action(
    monkeypatch,
) -> None:
    """intent_detected=True must be set on the returned decision even if the LLM
    classified the conversation as automation_kind='none' (i.e. the deterministic
    keyword guard overrides the LLM under-classification)."""

    llm_none_decision = IntentDecision(
        relevant=False,
        automation_kind="none",
        skill=None,
        args={},
        urgency="normal",
        confidence=0.4,
        reason="Sem ação necessária.",
    )

    async def fake_run(agent, message):
        return type("R", (), {"content": llm_none_decision})()

    monkeypatch.setattr(floor_doorman, "_arun_agent", fake_run)

    result = await triage_intent(
        ctx=CTX,
        conversation="vamos marcar uma reunião amanhã?",
        opportunity=OPPORTUNITY,
        pipeline_rules=PIPELINE_RULES_ENABLED,
        model_id="gpt-4o",
    )

    assert result.intent_detected is True
    assert result.intent_keyword in HIGH_INTENT_KEYWORDS


@pytest.mark.asyncio
async def test_triage_intent_no_intent_detected_for_irrelevant_message(monkeypatch) -> None:
    """intent_detected must remain False when no scheduling keyword is present."""

    llm_decision = IntentDecision(
        relevant=False,
        automation_kind="none",
        skill=None,
        args={},
        urgency="normal",
        confidence=0.9,
        reason="Saudação sem dados.",
    )

    async def fake_run(agent, message):
        return type("R", (), {"content": llm_decision})()

    monkeypatch.setattr(floor_doorman, "_arun_agent", fake_run)

    result = await triage_intent(
        ctx=CTX,
        conversation="bom dia, tudo bem?",
        opportunity=OPPORTUNITY,
        pipeline_rules=PIPELINE_RULES_ENABLED,
        model_id="gpt-4o",
    )

    assert result.intent_detected is False
    assert result.intent_keyword is None


@pytest.mark.asyncio
async def test_triage_intent_intent_fields_survive_skill_downgrade(monkeypatch) -> None:
    """intent_detected/intent_keyword must survive the skill-downgrade reconstruction."""

    bad_decision = _make_decision(skill="nonexistent_skill")
    rules = {**PIPELINE_RULES_ENABLED, "enabled_skills": ["nonexistent_skill"]}

    async def fake_run(agent, message):
        return type("R", (), {"content": bad_decision})()

    monkeypatch.setattr(floor_doorman, "_arun_agent", fake_run)

    result = await triage_intent(
        ctx=CTX,
        conversation="vamos marcar uma reunião amanhã?",
        opportunity=OPPORTUNITY,
        pipeline_rules=rules,
        model_id="gpt-4o",
    )

    # Skill is downgraded
    assert result.relevant is False
    assert "Downgraded" in result.reason
    # But intent fields must still be set
    assert result.intent_detected is True
    assert result.intent_keyword in HIGH_INTENT_KEYWORDS


@pytest.mark.asyncio
async def test_triage_plan_sets_intent_detected(monkeypatch) -> None:
    """triage_plan must set intent_detected/intent_keyword on the returned ActionPlan."""

    async def fake_run(agent, message):
        return type(
            "R",
            (),
            {
                "content": ActionPlan(
                    relevant=False,
                    actions=[],
                    confidence=0.3,
                    reason="Sem ação.",
                )
            },
        )()

    monkeypatch.setattr(floor_doorman, "_arun_agent", fake_run)

    plan = await triage_plan(
        ctx=CTX,
        conversation="vamos agendar uma call amanhã?",
        opportunity=OPPORTUNITY,
        pipeline_rules=PIPELINE_RULES_ENABLED,
        model_id="gpt-4o",
    )

    assert plan.intent_detected is True
    assert plan.intent_keyword in HIGH_INTENT_KEYWORDS


@pytest.mark.asyncio
async def test_triage_plan_no_intent_for_non_scheduling_message(monkeypatch) -> None:
    """triage_plan must leave intent_detected=False for non-scheduling conversations."""

    async def fake_run(agent, message):
        return type(
            "R",
            (),
            {
                "content": ActionPlan(
                    relevant=False,
                    actions=[],
                    confidence=0.9,
                    reason="Saudação.",
                )
            },
        )()

    monkeypatch.setattr(floor_doorman, "_arun_agent", fake_run)

    plan = await triage_plan(
        ctx=CTX,
        conversation="bom dia, tudo bem?",
        opportunity=OPPORTUNITY,
        pipeline_rules=PIPELINE_RULES_ENABLED,
        model_id="gpt-4o",
    )

    assert plan.intent_detected is False
    assert plan.intent_keyword is None
