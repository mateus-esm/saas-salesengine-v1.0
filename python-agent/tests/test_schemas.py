"""Schema robustness against LLM output quirks."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.schemas import ActionResult, IntentDecision, RouteDecision


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
