"""Sprint 13 · the System One client (Jev, TypeSafe).

What these tests protect: the request carries the pinned model, the state and
the questions with a Bearer key; answers are read by type; a transient failure
(429/5xx/timeout) is tried once more, a permanent one (401/400) is not; anything
that is not a well-formed answer becomes SystemOneError — the only exception
callers ever need to catch.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import httpx
import pytest
import respx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.cognition.system_one import JEV_URL, SystemOne, SystemOneError, choice, noul

ANSWER = {
    "model": "jev-1.13.0",
    "answers": {
        "signal": {"type": "noul", "noul": 0.97},
        "stage": {"type": "choice", "choice": "e2", "confidence": 0.85, "probabilities": {"e1": 0.1, "e2": 0.88, "e3": 0.02}},
    },
    "usage": {"input_tokens": 745, "output_tokens": 20},
}

QUESTIONS = {
    "signal": noul("Há fato novo?", true="sim", false="não"),
    "stage": choice("Qual etapa?", {"e1": "Novo", "e2": "Proposta", "e3": None}),
}


def test_builders_shape_the_questions():
    assert QUESTIONS["signal"] == {"type": "noul", "instructions": "Há fato novo?", "criteria": {"true": "sim", "false": "não"}}
    assert noul("x") == {"type": "noul", "instructions": "x"}
    assert QUESTIONS["stage"]["type"] == "choice"
    assert QUESTIONS["stage"]["criteria"]["e3"] is None


@respx.mock
async def test_judge_sends_model_state_questions_and_reads_answers():
    route = respx.post(JEV_URL).mock(return_value=httpx.Response(200, json=ANSWER))
    j = await SystemOne("k-123").judge({"conversa": "oi"}, QUESTIONS)

    sent = route.calls.last.request
    assert sent.headers["authorization"] == "Bearer k-123"
    body = json.loads(sent.content)
    assert body == {"model": "jev-1.13.0", "state": {"conversa": "oi"}, "questions": QUESTIONS}

    assert j.model == "jev-1.13.0"
    assert j.input_tokens == 745
    assert j.noul("signal") == 0.97
    assert j.choice("stage") == ("e2", 0.85)
    assert j.probabilities("stage")["e2"] == 0.88
    assert j.noul("missing") is None
    assert j.choice("missing") == (None, None)
    assert j.ms >= 0


@respx.mock
async def test_transient_failure_is_tried_once_more():
    route = respx.post(JEV_URL).mock(side_effect=[httpx.Response(503), httpx.Response(200, json=ANSWER)])
    j = await SystemOne("k", retry_wait=0).judge("s", QUESTIONS)
    assert route.call_count == 2
    assert j.noul("signal") == 0.97


@respx.mock
async def test_permanent_failure_is_not_retried():
    route = respx.post(JEV_URL).mock(return_value=httpx.Response(401, json={"detail": "bad key"}))
    with pytest.raises(SystemOneError, match="401"):
        await SystemOne("k", retry_wait=0).judge("s", QUESTIONS)
    assert route.call_count == 1


@respx.mock
async def test_timeout_twice_becomes_system_one_error():
    respx.post(JEV_URL).mock(side_effect=httpx.ReadTimeout("slow"))
    with pytest.raises(SystemOneError, match="timeout"):
        await SystemOne("k", retry_wait=0).judge("s", QUESTIONS)


@respx.mock
async def test_malformed_answer_becomes_system_one_error():
    respx.post(JEV_URL).mock(return_value=httpx.Response(200, json={"model": "jev"}))
    with pytest.raises(SystemOneError, match="answers"):
        await SystemOne("k").judge("s", QUESTIONS)


def test_key_is_required():
    with pytest.raises(ValueError):
        SystemOne("")
