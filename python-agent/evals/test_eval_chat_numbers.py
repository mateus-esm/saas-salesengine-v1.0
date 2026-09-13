"""Sprint 11 · Onda 6 · T66 — the chat never invents a number (SLOW, hits the model).

Skipped without an LLM key; run pre-deploy:

    LLM_API_KEY=... uv run pytest evals/test_eval_chat_numbers.py -v -s

The answer model gets fixed query results (no database) and a question. Gates:
every number in the answer came from the results (or the question); when the
data is missing, the answer says so.
"""

import os
import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from evals.scoring import stray_numbers

_HAS_LLM = bool(os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY"))
pytestmark = pytest.mark.skipif(not _HAS_LLM, reason="No LLM key configured — run pre-deploy.")

TODAY = date(2026, 9, 14)

RESUMO = [{
    "consulta": "resumo", "args": {},
    "periodo": {"de": "2026-09-01", "ate": "2026-09-14"},
    "filtro": {"escopo": "tudo o que você pode ver"},
    "dados": {"new_leads": 124, "new_opportunities": 57, "proposals_sent": 18, "deals_won": 6, "deals_lost": 9,
              "won_value": 213500.0, "win_rate": 40.0},
}]

FOCO = [{
    "consulta": "onde_focar", "args": {},
    "negocios": [
        {"contact": "Cliente A", "stage": "Proposta enviada", "value": 42000, "score": 77,
         "reasons": ["cliente esperando resposta", "cliente escreveu hoje"], "link": "/crm?tab=pipeline&pipeline=p&q=Cliente%20A"},
        {"contact": "Cliente B", "stage": "Qualificado", "value": 18000, "score": 40,
         "reasons": ["parado há 72 h (SLA 48 h)"], "link": "/crm?tab=pipeline&pipeline=p&q=Cliente%20B"},
    ],
}]

CASES = [
    ("Como foi o mês até agora?", RESUMO, None),
    ("Onde devo focar hoje?", FOCO, None),
    ("Quantas reuniões fizemos este mês?", RESUMO, "não tenho"),
]


@pytest.mark.asyncio
async def test_the_chat_only_uses_numbers_from_the_results():
    from app.copilot.chat import answer_message, make_answer

    model_id = os.getenv("CHAT_MODEL") or os.getenv("DOORMAN_MODEL") or "deepseek-v4-flash-0731"
    answer = make_answer(model_id)

    problems = []
    for question, results, must_say in CASES:
        text = "".join([part async for part in answer(answer_message(question, [], results, TODAY))])
        stray = stray_numbers(text, results, question + " " + TODAY.isoformat())
        print(f"\n{question}\n{text}\n→ números de fora: {stray}")
        if stray:
            problems.append((question, stray))
        if must_say and must_say not in text.lower():
            problems.append((question, f"deveria dizer '{must_say}'"))
    assert not problems, problems
