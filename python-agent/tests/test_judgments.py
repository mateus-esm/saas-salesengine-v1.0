"""Sprint 13 · the keeper's System One questions and policy.

What these tests protect: stage options map back to the real stage id even
when names repeat; a long conversation is cut to its most recent messages; a
pass is "quiet" only when nothing at all points to a change; every action type
becomes a sentence with names (never ids); verification questions are numbered
like crm_copilot_apply's 1-based index; calibration never mutates its input;
and a System One failure never escapes — it becomes a logged error.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.cognition.system_one import Judgments, SystemOneError
from app.copilot.judgments import (
    MAX_CONVERSATION_CHARS,
    System1,
    Triage,
    action_claim,
    calibrate,
    jev_state,
    read_triage,
    triage_questions,
    verify_questions,
)

CTX = {
    "pipeline": {"name": "Usinas"},
    "opportunity": {"value": 0, "status": "open"},
    "lead": {"name": "[Novo Contato]", "name_is_placeholder": True, "email": None},
    "stages": [
        {"id": "st-a", "name": "Novo", "stage_type": "open", "current": True, "description": "Chegou."},
        {"id": "st-b", "name": "Proposta", "stage_type": "open", "funnel_event": "proposal_sent"},
        {"id": "st-c", "name": "Proposta", "stage_type": "open"},
        {"id": "st-won", "name": "Ganho", "stage_type": "won"},
    ],
    "fields": [{"field_id": "f-kwh", "label": "Consumo (kWh)", "type": "number", "value": None}],
    "messages": [{"at": "2026-09-27T12:00:00+00:00", "from": "customer", "text": "Minha conta é 450 kWh"}],
    "memory": {"summary": "Quer orçamento."},
}


def _judg(answers):
    return Judgments(model="jev-1.13.0", answers=answers, input_tokens=700, ms=400)


def test_stage_keys_map_back_even_with_repeated_names():
    questions, keys = triage_questions(CTX)
    assert keys == {"e1": "st-a", "e2": "st-b", "e3": "st-c", "e4": "st-won"}
    crit = questions["stage"]["criteria"]
    assert set(crit) == {"e1", "e2", "e3", "e4"}
    assert "etapa atual" in crit["e1"] and "Chegou." in crit["e1"]
    assert {"signal", "outcome", "next_step", "value", "contact", "field"} <= set(questions)


def test_no_stage_or_field_questions_without_stages_or_fields():
    questions, keys = triage_questions({**CTX, "stages": [], "fields": []})
    assert "stage" not in questions and "field" not in questions and keys == {}


def test_state_uses_names_and_keeps_the_most_recent_messages():
    long_text = "x" * 1000
    msgs = [{"at": None, "from": "customer", "text": f"{i}-{long_text}"} for i in range(200)]
    state = jev_state({**CTX, "messages": msgs})
    conv = state["conversa_nova"]
    assert sum(len(m["texto"]) for m in conv) <= MAX_CONVERSATION_CHARS
    assert conv[-1]["texto"].startswith("199-")
    assert state["mensagens_antigas_omitidas"] == 200 - len(conv)
    assert state["negocio"]["etapa_atual"] == "Novo"
    assert "st-a" not in str(state)  # the model reads names, not ids


def _triage(**over):
    answers = {
        "signal": {"type": "noul", "noul": 0.05},
        "next_step": {"type": "noul", "noul": 0.05},
        "value": {"type": "noul", "noul": 0.02},
        "contact": {"type": "noul", "noul": 0.01},
        "field": {"type": "noul", "noul": 0.03},
        "stage": {"type": "choice", "choice": "e1", "confidence": 0.8, "probabilities": {"e1": 0.9}},
        "outcome": {"type": "choice", "choice": "aberto", "confidence": 1.0, "probabilities": {"aberto": 1.0}},
    }
    answers.update(over)
    _, keys = triage_questions(CTX)
    return read_triage(_judg(answers), keys, CTX)


def test_quiet_only_when_nothing_points_to_a_change():
    assert _triage().quiet(0.2) is True
    assert _triage(signal={"type": "noul", "noul": 0.6}).quiet(0.2) is False
    assert _triage(field={"type": "noul", "noul": 0.4}).quiet(0.2) is False
    assert _triage(stage={"type": "choice", "choice": "e2", "confidence": 0.7}).quiet(0.2) is False
    assert _triage(outcome={"type": "choice", "choice": "ganho", "confidence": 0.6}).quiet(0.2) is False
    t = _triage(stage={"type": "choice", "choice": "e2", "confidence": 0.7})
    assert t.stage_id == "st-b" and t.stage_is_current is False


def test_missing_signal_is_never_quiet():
    t = _triage(signal={"type": "noul"})
    assert t.signal is None and t.quiet(0.2) is False


def test_claims_use_names_for_every_action_type():
    claims = [action_claim(a, CTX) for a in [
        {"type": "note", "text": "Pediu orçamento"},
        {"type": "set_field", "field_id": "f-kwh", "value": 450},
        {"type": "set_contact", "attribute": "email", "value": "a@b.com"},
        {"type": "create_task", "title": "Enviar proposta", "due_at": "2026-09-28T10:00:00-03:00"},
        {"type": "add_tag", "tag": "residencial"},
        {"type": "move_stage", "stage_id": "st-b"},
        {"type": "set_outcome", "outcome": "won", "reason": "assinou"},
        {"type": "set_value", "value": 18000},
        {"type": "mystery"},
    ]]
    assert "Pediu orçamento" in claims[0]
    assert "Consumo (kWh)" in claims[1] and "450" in claims[1]
    assert "e-mail" in claims[2] and "a@b.com" in claims[2]
    assert "Enviar proposta" in claims[3]
    assert "residencial" in claims[4]
    assert '"Proposta"' in claims[5] and "st-b" not in claims[5]
    assert "GANHO" in claims[6]
    assert "18000" in claims[7] or "18.000" in claims[7]
    assert "mystery" in claims[8]


def test_verify_questions_are_numbered_like_apply():
    actions = [{"type": "note", "text": "a"}, {"type": "add_tag", "tag": "b"}]
    questions = verify_questions(CTX, actions)
    assert list(questions) == ["a1", "a2"]
    assert questions["a2"]["type"] == "noul"
    assert '"b"' in questions["a2"]["instructions"]["acao_proposta"]


def test_calibrate_replaces_confidence_and_keeps_the_llm_one():
    actions = [{"type": "note", "text": "a", "confidence": 0.62}, {"type": "add_tag", "tag": "b", "confidence": 0.9}]
    out = calibrate(actions, [0.91, None])
    assert out[0]["confidence"] == 0.91 and out[0]["llm_confidence"] == 0.62
    assert out[1] == actions[1]  # no judgment → untouched
    assert actions[0]["confidence"] == 0.62  # input not mutated


class _Client:
    def __init__(self, result=None, error=None):
        self.result, self.error, self.calls = result, error, []

    async def judge(self, state, questions):
        self.calls.append((state, questions))
        if self.error:
            raise self.error
        return self.result


async def test_triage_failure_is_logged_not_raised():
    t, log = await System1(_Client(error=SystemOneError("timeout"))).triage(CTX)
    assert t is None and log["error"] == "timeout"


async def test_triage_logs_the_judgment():
    t, log = await System1(_Client(result=_judg({"signal": {"type": "noul", "noul": 0.9}}))).triage(CTX)
    assert isinstance(t, Triage) and t.signal == 0.9
    assert log["signal"] == 0.9 and log["would_quiet"] is False and log["ms"] == 400 and log["model"] == "jev-1.13.0"


async def test_verify_reads_one_probability_per_action():
    client = _Client(result=_judg({"a1": {"type": "noul", "noul": 0.8}, "a2": {"type": "noul", "noul": 0.1}}))
    actions = [{"type": "note", "text": "a", "confidence": 0.7}, {"type": "add_tag", "tag": "b", "confidence": 0.85}]
    probs, log = await System1(client).verify(CTX, actions)
    assert probs == [0.8, 0.1]
    assert log["p"] == [0.8, 0.1] and log["llm"] == [0.7, 0.85] and log["types"] == ["note", "add_tag"]


async def test_verify_without_actions_does_not_call():
    client = _Client()
    probs, log = await System1(client).verify(CTX, [])
    assert probs == [] and log == {} and client.calls == []
