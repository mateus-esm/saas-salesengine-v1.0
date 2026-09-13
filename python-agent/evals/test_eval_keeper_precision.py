"""Sprint 11 · Onda 6 · T66 — the keeper's precision (SLOW, hits the model).

Skipped without an LLM key; run pre-deploy:

    LLM_API_KEY=... uv run pytest evals/test_eval_keeper_precision.py -v -s

Gates: no invented id (the database would refuse it); at least 75% of the
expected actions; at most one forbidden action across all cases. Conservative on
purpose — a regression gate, not a leaderboard.
"""

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from evals.keeper_cases import KEEPER_CASES
from evals.scoring import score_case

RECALL_BASELINE = 0.75
MAX_VIOLATIONS = 1

_HAS_LLM = bool(os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY"))
pytestmark = pytest.mark.skipif(not _HAS_LLM, reason="No LLM key configured — run pre-deploy.")


@pytest.mark.asyncio
async def test_keeper_precision_meets_baseline():
    from app.config import get_settings
    from app.copilot.keeper import build_message, make_think

    try:
        model_id = get_settings().keeper_model or get_settings().doorman_model
    except Exception:
        model_id = os.getenv("KEEPER_MODEL") or os.getenv("DOORMAN_MODEL") or "deepseek-v4-flash-0731"
    think = make_think(model_id)

    hits = expected = 0
    violations, invalid = [], []
    for case in KEEPER_CASES:
        output = await think(build_message(case.ctx))
        score = score_case(output.actions, case.ctx, case.expected, case.forbidden)
        hits += score.hits
        expected += score.expected
        violations += [(case.name, v) for v in score.violations]
        invalid += [(case.name, v) for v in score.invalid]
        print(f"{case.name}: {score.hits}/{score.expected} esperadas, {len(score.violations)} proibidas, "
              f"{len(score.invalid)} ids inventados — {output.actions}")

    recall = hits / expected if expected else 1.0
    print(f"acerto: {recall:.0%} · proibidas: {len(violations)} · ids inventados: {len(invalid)}")
    assert not invalid, f"ids inventados: {invalid}"
    assert recall >= RECALL_BASELINE, f"acerto {recall:.0%} abaixo de {RECALL_BASELINE:.0%}"
    assert len(violations) <= MAX_VIOLATIONS, f"ações proibidas: {violations}"
