"""Sprint 13 — System One (Jev) on the keeper's cases (SLOW, hits TypeSafe).

Skipped without a key; run pre-deploy:

    JEV_API_KEY=... python -m pytest evals/test_eval_system_one.py -v -s

What it measures, in the order that matters:

  1. false quiet  — a conversation WITH something to record that triage would
                    send past the model. The expensive error: gate is zero.
  2. true quiet   — small talk that triage lets skip the model (the saving).
  3. stage/outcome — the triage choice on the cases that move or close a deal.
  4. verification — P(supported) for actions the conversation supports vs
                    actions that invent or rush something. Gate: they separate.

Synthetic Portuguese conversations (no customer data). A regression gate for
the question wording, not a benchmark — the real measurement is the shadow run
(supabase/scripts/2026-09-27_copilot_jev_shadow_report.sql).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.cognition.system_one import SystemOne
from app.copilot.judgments import System1
from evals.keeper_cases import KEEPER_CASES, _ctx

QUIET_BELOW = 0.2

pytestmark = pytest.mark.skipif(not os.getenv("JEV_API_KEY"), reason="No JEV_API_KEY — run pre-deploy.")

LOUD = [c for c in KEEPER_CASES if c.expected]
QUIET = [
    ("sem novidade (caso do keeper)", next(c.ctx for c in KEEPER_CASES if not c.expected)),
    ("cumprimento", _ctx([("customer", "Bom dia!"), ("agent", "Bom dia! Como posso ajudar?"), ("customer", "tudo bem?")],
                         summary="Proposta enviada; aguardando retorno.")),
    ("agradecimento", _ctx([("customer", "👍"), ("customer", "valeu")], summary="Visita técnica marcada para sexta.")),
    ("mensagem automática", _ctx([("customer", "Mensagem automática: no momento não estou disponível. Retorno em breve.")],
                                 summary="Pediu orçamento.")),
]

# (case name, action, supported?)
QUALIF = next(c.ctx for c in KEEPER_CASES if c.name.startswith("qualificado"))
EXTRAI = next(c.ctx for c in KEEPER_CASES if c.name.startswith("extrai"))
FECHA = next(c.ctx for c in KEEPER_CASES if c.name.startswith("fechamento"))
CONTATO = next(c.ctx for c in KEEPER_CASES if c.name.startswith("o contato"))
NADA = QUIET[0][1]
CLAIMS = [
    (EXTRAI, {"type": "set_field", "field_id": "f-consumo", "value": 450}, True),
    (EXTRAI, {"type": "set_field", "field_id": "f-telhado", "value": "cerâmica"}, True),
    (EXTRAI, {"type": "set_field", "field_id": "f-consumo", "value": 900}, False),
    (EXTRAI, {"type": "set_outcome", "outcome": "won"}, False),
    (QUALIF, {"type": "move_stage", "stage_id": "st-qualif"}, True),
    (QUALIF, {"type": "create_task", "title": "Preparar e enviar a proposta", "due_at": "2026-09-15T10:00:00-03:00"}, True),
    (QUALIF, {"type": "move_stage", "stage_id": "st-ganho"}, False),
    (FECHA, {"type": "set_outcome", "outcome": "won", "reason": "cliente fechou e vai assinar hoje"}, True),
    (FECHA, {"type": "set_outcome", "outcome": "lost"}, False),
    (CONTATO, {"type": "set_contact", "attribute": "email", "value": "carla.teste@exemplo.com"}, True),
    (CONTATO, {"type": "set_contact", "attribute": "email", "value": "carla@empresa.com.br"}, False),
    (NADA, {"type": "set_value", "value": 25000}, False),
    (NADA, {"type": "move_stage", "stage_id": "st-perdido"}, False),
]


@pytest.fixture
def s1():
    return System1(SystemOne(os.environ["JEV_API_KEY"], timeout=15.0), mode="on", quiet_below=QUIET_BELOW)


async def test_triage_never_quiets_a_conversation_with_something_to_record(s1):
    false_quiet = []
    for case in LOUD:
        t, log = await s1.triage(case.ctx)
        assert t is not None, log
        print(f"  LOUD  {case.name:<50} signal={t.signal:.2f} quiet={t.quiet(QUIET_BELOW)} {log['ms']} ms")
        if t.quiet(QUIET_BELOW):
            false_quiet.append(case.name)
    assert false_quiet == []


async def test_triage_lets_small_talk_skip_the_model(s1):
    quiet = 0
    for name, ctx in QUIET:
        t, log = await s1.triage(ctx)
        assert t is not None, log
        print(f"  QUIET {name:<50} signal={t.signal:.2f} intents={ {k: round(v or 0, 2) for k, v in t.intents.items()} } quiet={t.quiet(QUIET_BELOW)}")
        quiet += t.quiet(QUIET_BELOW)
    assert quiet >= len(QUIET) - 1  # the saving: at most one miss


async def test_triage_reads_stage_and_outcome(s1):
    by_name = {c.name: c.ctx for c in KEEPER_CASES}
    t, _ = await s1.triage(by_name["qualificado quando o consumo e o telhado chegam"])
    print(f"  stage qualif → {t.stage_id} ({t.stage_confidence})")
    assert t.stage_id == "st-qualif"
    t, _ = await s1.triage(by_name["fechamento explícito"])
    print(f"  outcome fechamento → {t.outcome} ({t.outcome_confidence})")
    assert t.outcome == "ganho"
    t, _ = await s1.triage(by_name["desistência"])
    print(f"  outcome desistência → {t.outcome} ({t.outcome_confidence})")
    assert t.outcome == "perdido"


async def test_verification_separates_supported_from_invented(s1):
    supported, invented, wrong = [], [], []
    for ctx, action, ok in CLAIMS:
        probs, log = await s1.verify(ctx, [action])
        assert probs and probs[0] is not None, log
        p = probs[0]
        print(f"  {'OK ' if ok else 'BAD'} p={p:.2f}  {action}")
        (supported if ok else invented).append(p)
        if (p >= 0.5) != ok:
            wrong.append((action, p))
    print(f"  mean supported={sum(supported) / len(supported):.2f} invented={sum(invented) / len(invented):.2f} errors@0.5={len(wrong)}")
    assert min(supported) > max(invented) or len(wrong) <= 2
    assert sum(supported) / len(supported) - sum(invented) / len(invented) > 0.4
