"""Accuracy eval (LLM-as-judge) — SLOW, hits a model.

Skipped automatically when no LLM key is configured (so the suite still imports
and the reliability eval runs in CI without secrets). Pre-deploy, run with a key:

    LLM_API_KEY=... python -m pytest evals/test_eval_doorman_accuracy.py -v

The committed baseline is intentionally conservative; raise it as the model and
prompts stabilize. The point is a regression GATE, not a leaderboard.
"""
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from evals.fixtures import DOORMAN_CASES

ACCURACY_BASELINE = 0.8

_HAS_LLM = bool(os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY"))

pytestmark = pytest.mark.skipif(
    not _HAS_LLM,
    reason="No LLM key configured — accuracy eval needs a judge model (run pre-deploy).",
)


def _agno_accuracy_available() -> bool:
    try:
        import agno.eval.accuracy  # noqa: F401
        return True
    except Exception:
        return False


@pytest.mark.asyncio
async def test_doorman_accuracy_meets_baseline():
    """Feed each seeded conversation through Tower+Floor; judge the route+verb."""
    if not _agno_accuracy_available():
        pytest.skip("agno.eval.accuracy not installed")

    from agno.eval.accuracy import AccuracyEval

    from app.cascade.floor_doorman import triage_plan
    from app.llm import build_chat_model
    from app.security import TenantContext

    ctx = TenantContext(equipe_id="eval", actor_user_id="judge")
    scores: list[float] = []

    for case in DOORMAN_CASES:
        if case.expected_contact_type == "spam":
            continue  # spam handled by Tower prefilter; not part of plan accuracy
        plan = await triage_plan(
            ctx=ctx,
            conversation=case.conversation,
            opportunity={"id": "o1", "pipeline_id": "p1", "stage_id": "s1"},
            pipeline_rules={},
            model_id=os.getenv("DOORMAN_MODEL", "gpt-4o-mini"),
        )
        produced = plan.actions[0].verb if plan.actions else ""
        result = AccuracyEval(
            model=build_chat_model(os.getenv("JUDGE_MODEL", "gpt-4o")),
            input=case.conversation,
            expected_output=f"first structural verb == {case.expected_first_verb}",
            additional_context=f"agent produced first verb: {produced!r}",
        ).run(print_results=False)
        scores.append(float(getattr(result, "avg_score", 0.0)))

    assert scores, "no scored cases"
    mean = sum(scores) / len(scores)
    assert mean >= ACCURACY_BASELINE, f"doorman accuracy {mean:.2f} < {ACCURACY_BASELINE}"
