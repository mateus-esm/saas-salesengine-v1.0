"""Sprint 11 · Onda 6 · T60 — one pass over one deal.

What these tests protect: nothing new closes the job without calling the model;
a pass is exactly one model call followed by one apply, with the read cursor;
the prompt carries the real ids and only the new conversation; a provider
failure, an unreadable answer or a failed apply closes the job as failed and
applies nothing; closing never raises; the answer schema keeps only objects.
"""

from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.copilot.actions import KeeperOutput
from app.copilot.keeper import build_message, run_job
from app.llm import ModelProviderError

JOB = {
    "id": "11111111-1111-4111-8111-111111111111",
    "opportunity_id": "22222222-2222-4222-8222-222222222222",
    "run_id": "33333333-3333-4333-8333-333333333333",
    "equipe_id": "44444444-4444-4444-8444-444444444444",
    "reason": "conversation",
}

CTX = {
    "opportunity": {"id": JOB["opportunity_id"], "value": 0, "status": "open"},
    "lead": {"name": "[Novo Contato - WhatsApp]", "name_is_placeholder": True, "email": None, "tags": []},
    "pipeline": {"name": "Usinas", "offer_mode": "free"},
    "stages": [
        {"id": "stage-novo", "name": "Novo", "stage_type": "open", "position": 0, "current": True},
        {"id": "stage-proposta", "name": "Proposta", "stage_type": "open", "funnel_event": "proposal_sent", "position": 1},
    ],
    "fields": [{"field_id": "f-consumo", "label": "Consumo (kWh)", "type": "number", "value": None}],
    "team_tags": ["solar"],
    "messages": [{"at": "2026-09-14T11:58:00+00:00", "from": "customer", "text": "Minha conta é 450 kWh"}],
    "last_message_at": "2026-09-14T11:58:00+00:00",
    "memory": {"summary": "Quer orçamento."},
    "settings": {"mode": "autonomous", "threshold": 0.75, "extraction_hints": "Consumo em kWh"},
}


class FakeRepo:
    def __init__(self, ctx=None, *, apply_result=None, apply_error=None, finish_error=None):
        self.ctx = CTX if ctx is None else ctx
        self.apply_result = apply_result or {"mode": "autonomous", "applied": [{"index": 1}], "pending": [], "proposed": [], "rejected": []}
        self.apply_error = apply_error
        self.finish_error = finish_error
        self.applied: list[dict] = []
        self.finished: list[tuple] = []
        self.events: list[dict] = []

    def context(self, opportunity_id):
        return self.ctx

    def apply(self, **kwargs):
        if self.apply_error:
            raise self.apply_error
        self.applied.append(kwargs)
        return self.apply_result

    def finish(self, job_id, status, error=None, result=None):
        if self.finish_error:
            raise self.finish_error
        self.finished.append((job_id, status, error, result))
        return status

    def event(self, **kwargs):
        self.events.append(kwargs)


def _thinker(output=None, error=None):
    calls: list[str] = []

    async def think(message: str) -> KeeperOutput:
        calls.append(message)
        if error:
            raise error
        return output or KeeperOutput()

    return think, calls


def _run(coro):
    return asyncio.run(coro)


def test_nothing_new_closes_as_skipped_without_calling_the_model():
    repo = FakeRepo({**CTX, "messages": []})
    think, calls = _thinker()
    out = _run(run_job(JOB, repo=repo, think=think, model_id="m"))
    assert out["status"] == "skipped"
    assert calls == []
    assert repo.applied == []
    assert repo.finished[0][1] == "skipped"


def test_one_model_call_then_one_apply_with_the_read_cursor():
    output = KeeperOutput(summary="Conta de 450 kWh.", confidence=0.9,
                          actions=[{"type": "set_field", "field_id": "f-consumo", "value": 450, "confidence": 0.9}])
    repo = FakeRepo()
    think, calls = _thinker(output)
    out = _run(run_job(JOB, repo=repo, think=think, model_id="deepseek"))

    assert len(calls) == 1
    assert len(repo.applied) == 1
    call = repo.applied[0]
    assert call["actions"] == output.actions
    assert call["cursor"] == CTX["last_message_at"]
    assert call["run_id"] == JOB["run_id"] and call["model"] == "deepseek"
    assert call["summary"] == "Conta de 450 kWh." and call["confidence"] == 0.9

    assert out["status"] == "done" and out["applied"] == 1
    status, result = repo.finished[0][1], repo.finished[0][3]
    assert status == "done"
    assert set(result["timings"]) == {"context_ms", "model_ms", "apply_ms"}
    assert repo.events[0]["kind"] == "keeper_done"


def test_the_prompt_carries_the_real_ids_and_only_the_new_conversation():
    message = build_message(CTX, now=datetime(2026, 9, 14, 12, 0, tzinfo=timezone.utc))
    assert "AGORA: 2026-09-14 09:00" in message
    assert '"stage_id": "stage-proposta"' in message and '"marco": "proposal_sent"' in message
    assert '"field_id": "f-consumo"' in message
    assert "[14/09 08:58 cliente] Minha conta é 450 kWh" in message
    assert "RESUMO ANTERIOR: Quer orçamento." in message
    assert "DICAS DA LINHA: Consumo em kWh" in message


def test_a_provider_failure_closes_failed_and_applies_nothing():
    repo = FakeRepo()
    think, _ = _thinker(error=ModelProviderError("invalid or expired token"))
    out = _run(run_job(JOB, repo=repo, think=think, model_id="m"))
    assert out["status"] == "failed" and out["error"].startswith("provedor")
    assert repo.applied == []
    assert repo.events[0]["kind"] == "keeper_failed"


def test_an_unreadable_answer_closes_failed():
    async def think(message):
        return KeeperOutput.model_validate({"confidence": 7})

    repo = FakeRepo()
    out = _run(run_job(JOB, repo=repo, think=think, model_id="m"))
    assert out["status"] == "failed" and out["error"].startswith("resposta ilegível")
    assert repo.applied == []


def test_a_failed_apply_closes_failed():
    repo = FakeRepo(apply_error=RuntimeError("opportunity_not_found"))
    think, _ = _thinker(KeeperOutput(actions=[{"type": "note", "text": "x"}]))
    out = _run(run_job(JOB, repo=repo, think=think, model_id="m"))
    assert out["status"] == "failed" and "opportunity_not_found" in out["error"]


def test_closing_never_raises():
    repo = FakeRepo(finish_error=RuntimeError("db down"))
    think, _ = _thinker(KeeperOutput())
    out = _run(run_job(JOB, repo=repo, think=think, model_id="m"))
    assert out["status"] == "unclosed"


def test_the_answer_schema_keeps_only_objects():
    assert KeeperOutput.model_validate({"actions": [1, "x", {"type": "note"}]}).actions == [{"type": "note"}]
    assert KeeperOutput.model_validate({"actions": None}).actions == []
    assert len(KeeperOutput.model_validate({"actions": [{"type": "note"}] * 30}).actions) == 20


# ── Sprint 13 · System One around the model call ──────────────────────────────
# What these protect: without s1 nothing changes (the tests above); "on" + a
# quiet triage skips the model but still moves the read cursor; "on" + signal
# sends Jev's calibrated confidence to apply; "shadow" changes nothing but logs
# everything; a Jev failure is logged and the pass runs as before; a model that
# does not answer in time closes the job as failed.

from app.cognition.system_one import Judgments, SystemOneError
from app.copilot.judgments import System1

QUIET = {
    "signal": {"type": "noul", "noul": 0.04}, "next_step": {"type": "noul", "noul": 0.03},
    "value": {"type": "noul", "noul": 0.02}, "contact": {"type": "noul", "noul": 0.01},
    "field": {"type": "noul", "noul": 0.05},
    "stage": {"type": "choice", "choice": "e1", "confidence": 0.9},
    "outcome": {"type": "choice", "choice": "aberto", "confidence": 1.0},
}
LOUD = {**QUIET, "signal": {"type": "noul", "noul": 0.95}, "field": {"type": "noul", "noul": 0.97}}
VERIFY = {"a1": {"type": "noul", "noul": 0.93}}
ACTION = {"type": "set_field", "field_id": "f-consumo", "value": 450, "confidence": 0.62}


class FakeJev:
    """Answers triage with `triage` and verification with `verify` (told apart by the question ids)."""

    def __init__(self, triage=None, verify=None, error=None):
        self.triage, self.verify, self.error, self.calls = triage, verify, error, []

    async def judge(self, state, questions):
        self.calls.append(sorted(questions))
        if self.error:
            raise self.error
        answers = self.verify if "a1" in questions else self.triage
        return Judgments(model="jev-1.13.0", answers=answers, input_tokens=700, ms=380)


def test_on_and_quiet_skips_the_model_and_moves_the_cursor():
    repo = FakeRepo()
    think, calls = _thinker(KeeperOutput(actions=[ACTION]))
    s1 = System1(FakeJev(triage=QUIET), mode="on")
    out = _run(run_job(JOB, repo=repo, think=think, model_id="m", s1=s1))

    assert calls == []
    assert repo.applied[0]["actions"] == [] and repo.applied[0]["summary"] is None
    assert repo.applied[0]["cursor"] == CTX["last_message_at"]
    assert out["status"] == "skipped" and out["route"] == "quiet"
    result = repo.finished[0][3]
    assert result["s1"]["mode"] == "on" and result["s1"]["triage"]["would_quiet"] is True
    assert repo.events[0]["kind"] == "keeper_skipped"


def test_on_with_signal_sends_calibrated_confidence_to_apply():
    repo = FakeRepo()
    think, calls = _thinker(KeeperOutput(actions=[ACTION]))
    s1 = System1(FakeJev(triage=LOUD, verify=VERIFY), mode="on")
    out = _run(run_job(JOB, repo=repo, think=think, model_id="m", s1=s1))

    assert len(calls) == 1
    sent = repo.applied[0]["actions"][0]
    assert sent["confidence"] == 0.93 and sent["llm_confidence"] == 0.62
    assert out["status"] == "done" and out["route"] == "model"
    s1_log = repo.finished[0][3]["s1"]
    assert s1_log["verify"]["p"] == [0.93] and s1_log["verify"]["llm"] == [0.62]
    assert s1_log["calibrated"] is True


def test_shadow_changes_nothing_but_logs_everything():
    repo = FakeRepo()
    think, calls = _thinker(KeeperOutput(actions=[ACTION]))
    s1 = System1(FakeJev(triage=QUIET, verify=VERIFY), mode="shadow")
    out = _run(run_job(JOB, repo=repo, think=think, model_id="m", s1=s1))

    assert len(calls) == 1  # quiet, but shadow still asks the model
    assert repo.applied[0]["actions"] == [ACTION]  # the LLM's own confidence
    s1_log = repo.finished[0][3]["s1"]
    assert s1_log["mode"] == "shadow" and s1_log["calibrated"] is False
    assert s1_log["triage"]["would_quiet"] is True and s1_log["verify"]["p"] == [0.93]
    assert out["status"] == "done"


def test_jev_failure_runs_the_pass_as_before_and_logs_it():
    repo = FakeRepo()
    think, calls = _thinker(KeeperOutput(actions=[ACTION]))
    s1 = System1(FakeJev(error=SystemOneError("timeout")), mode="on")
    out = _run(run_job(JOB, repo=repo, think=think, model_id="m", s1=s1))

    assert len(calls) == 1
    assert repo.applied[0]["actions"] == [ACTION]
    s1_log = repo.finished[0][3]["s1"]
    assert s1_log["triage"]["error"] == "timeout" and s1_log["verify"]["error"] == "timeout"
    assert out["status"] == "done"


def test_nothing_new_never_asks_jev():
    jev = FakeJev(triage=QUIET)
    think, _ = _thinker()
    _run(run_job(JOB, repo=FakeRepo({**CTX, "messages": []}), think=think, model_id="m", s1=System1(jev, mode="on")))
    assert jev.calls == []


def test_a_model_that_does_not_answer_in_time_fails_the_pass():
    async def think(message):
        await asyncio.sleep(1)
        return KeeperOutput()

    repo = FakeRepo()
    out = _run(run_job(JOB, repo=repo, think=think, model_id="m", model_timeout_s=0.01))
    assert out["status"] == "failed" and "tempo esgotado" in out["error"]
    assert repo.applied == []
