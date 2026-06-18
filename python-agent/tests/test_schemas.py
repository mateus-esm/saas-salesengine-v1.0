"""Schema robustness against LLM output quirks."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.schemas import ActionResult, ActionPlan, IntentDecision, PlannedAction, RouteDecision


def test_none_dict_fields_coerced_to_empty():
    """Small models (deepseek etc.) emit null for empty objects; coerce to {}.
    Regression for the production IntentDecision args=None validation error."""
    intent = IntentDecision(relevant=True, confidence=0.9, reason="x", args=None)
    route = RouteDecision(contact_type="lead", confidence=0.5, reason="x", extracted=None)
    action = ActionResult(success=True, detail=None)

    assert intent.args == {}
    assert route.extracted == {}
    assert action.detail == {}


def test_dict_fields_preserved_when_present():
    intent = IntentDecision(
        relevant=True, confidence=0.9, reason="x", args={"verb": "move_stage"}
    )
    assert intent.args == {"verb": "move_stage"}


def test_action_plan_orders_and_defaults():
    plan = ActionPlan(
        relevant=True,
        actions=[
            PlannedAction(verb="set_field", args={"field_id": "f1", "value": "12kWp"}),
            PlannedAction(verb="move_stage", args={"stage_type": "open"}, requires_confirmation=True),
        ],
        confidence=0.82, reason="enrich then advance",
    )
    assert len(plan.actions) == 2
    assert plan.actions[1].requires_confirmation is True
    assert plan.actions[0].requires_confirmation is False


def test_action_plan_empty_is_valid_noop():
    plan = ActionPlan(relevant=False, actions=[], confidence=0.0, reason="nothing to do")
    assert plan.actions == []


def test_planned_action_defaults():
    pa = PlannedAction(verb="set_field")
    assert pa.args == {}
    assert pa.requires_confirmation is False
    assert pa.skill == "core_table"


def test_action_plan_extra_fields_default():
    plan = ActionPlan(relevant=True, actions=[], confidence=0.9, reason="test")
    assert plan.automation_kind == "deterministic"
    assert plan.urgency == "normal"


def test_stage_blueprint_accepts_description():
    from app.schemas import StageBlueprint
    s = StageBlueprint(name="Proposta", position=0, description="Cliente recebeu a proposta.")
    assert s.description == "Cliente recebeu a proposta."
