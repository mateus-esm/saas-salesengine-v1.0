import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.cognition.router import Stakes, select_model, select_tier


def _rules(**kw):
    base = {
        "escalate_threshold": 0.60,
        "deal_value_strategic_threshold": None,
        "strategic_model": None,
        "doorman_model": None,
    }
    base.update(kw)
    return base


def test_won_lost_is_strategic():
    assert select_tier(Stakes(stage_type="won")) == "strategic"
    assert select_tier(Stakes(stage_type="lost")) == "strategic"


def test_open_low_value_high_confidence_is_cheap():
    assert select_tier(Stakes(stage_type="open", deal_value=10, cheap_confidence=0.9)) == "cheap"


def test_low_cheap_confidence_escalates():
    stakes = Stakes(stage_type="open", cheap_confidence=0.4)

    assert select_tier(stakes, escalate_threshold=0.60) == "strategic"


def test_high_deal_value_escalates():
    stakes = Stakes(stage_type="open", deal_value=100000, cheap_confidence=0.95)

    assert select_tier(stakes, deal_value_strategic_threshold=50000) == "strategic"


def test_select_model_uses_rules_then_settings():
    class S:
        doorman_model = "deepseek-v4-flash"
        worker_model = "gpt-4o"
        strategic_model = "o4-mini"

    cheap = select_model(Stakes(stage_type="open", cheap_confidence=0.9), _rules(), S())
    strat = select_model(Stakes(stage_type="won"), _rules(strategic_model="o4-reasoning"), S())

    assert cheap == "deepseek-v4-flash"
    assert strat == "o4-reasoning"


def test_select_model_falls_back_to_settings_strategic_then_worker():
    class StrategicSettings:
        doorman_model = "cheap"
        worker_model = "worker"
        strategic_model = "strategic"

    class WorkerOnlySettings:
        doorman_model = "cheap"
        worker_model = "worker"

    assert select_model(Stakes(stage_type="lost"), _rules(), StrategicSettings()) == "strategic"
    assert select_model(Stakes(stage_type="lost"), _rules(), WorkerOnlySettings()) == "worker"
