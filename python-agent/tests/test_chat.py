"""Sprint 11 · Onda 6 · T63 — "Entenda como está sua máquina de receita".

What these tests protect: the events come in order (thread → tools → delta… →
done); the question and the answer are stored with the queries used and the
time of each step; a query that fails is reported, not invented; a suspended
account is refused before any model call; a question without data is answered
without queries; the planner only keeps known tools, three at most.
"""

from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.copilot.chat import ChatDeps, Plan, answer_stream, planner_message

EQUIPE = "44444444-4444-4444-8444-444444444444"
USER = "55555555-5555-4555-8555-555555555555"
NOW = datetime(2026, 9, 14, 15, 0, tzinfo=timezone.utc)


class FakeStore:
    def __init__(self, suspended=False):
        self.is_suspended = suspended
        self.messages: list[tuple] = []
        self.threads: list[str] = []

    def suspended(self, equipe_id):
        return self.is_suspended

    def ensure_thread(self, equipe_id, user_id, thread_id, question):
        tid = thread_id or "thread-1"
        self.threads.append(tid)
        return tid

    def history(self, thread_id, limit):
        return [{"role": "user", "content": "oi"}, {"role": "assistant", "content": "Olá!"}]

    def add_message(self, thread_id, equipe_id, user_id, role, content, tools, meta):
        self.messages.append((role, content, tools, meta))
        return f"msg-{len(self.messages)}"


def _deps(*, plan: Plan | Exception, results: dict | None = None, answer_parts=("Hoje ", "entraram ", "12 leads."),
          store: FakeStore | None = None):
    ran: list[tuple] = []
    prompts: dict[str, str] = {}

    async def run_tool(name, args):
        ran.append((name, args))
        return (results or {}).get(name, {"dados": {"leads": 12}})

    async def do_plan(message):
        prompts["plan"] = message
        if isinstance(plan, Exception):
            raise plan
        return plan

    async def answer(message):
        prompts["answer"] = message
        for part in answer_parts:
            yield part

    deps = ChatDeps(store=store or FakeStore(), run_tool=run_tool, plan=do_plan, answer=answer, model_id="deepseek")
    return deps, ran, prompts


async def _collect(deps, question="Quantos leads entraram hoje?"):
    return [e async for e in answer_stream(equipe_id=EQUIPE, user_id=USER, thread_id=None, question=question, deps=deps, now=NOW)]


def test_the_events_come_in_order_and_the_answer_is_stored():
    plan = Plan.model_validate({"tools": [{"name": "resumo", "args": {"de": "2026-09-14", "ate": "2026-09-14"}}]})
    deps, ran, prompts = _deps(plan=plan)
    events = asyncio.run(_collect(deps))

    assert [e["type"] for e in events] == ["thread", "tools", "delta", "delta", "delta", "done"]
    assert events[1]["tools"] == [{"name": "resumo", "label": "Resumo do período"}]
    assert ran == [("resumo", {"de": "2026-09-14", "ate": "2026-09-14"})]
    assert "HOJE: 2026-09-14" in prompts["plan"] and "Usuário: oi" in prompts["plan"]
    assert '"leads": 12' in prompts["answer"]

    user_msg, assistant_msg = deps.store.messages
    assert user_msg[0] == "user" and user_msg[1] == "Quantos leads entraram hoje?"
    assert assistant_msg[0] == "assistant" and assistant_msg[1] == "Hoje entraram 12 leads."
    assert assistant_msg[2][0]["name"] == "resumo" and assistant_msg[2][0]["ok"] is True
    assert set(assistant_msg[3]) >= {"planner_ms", "tools_ms", "answer_ms", "total_ms"}


def test_a_failed_query_is_passed_on_as_an_error_not_invented():
    plan = Plan.model_validate({"tools": [{"name": "placar", "args": {}}]})
    deps, _, prompts = _deps(plan=plan, results={"placar": {"erro": "diga a linha (pipeline) do placar"}})
    events = asyncio.run(_collect(deps, "Como está o placar?"))
    assert events[-1]["type"] == "done"
    assert '"erro": "diga a linha (pipeline) do placar"' in prompts["answer"]
    assert deps.store.messages[-1][2][0]["ok"] is False


def test_links_from_the_results_come_back_with_done():
    plan = Plan.model_validate({"tools": [{"name": "onde_focar", "args": {}}]})
    deps, _, _ = _deps(plan=plan, results={"onde_focar": {"negocios": [{"contact": "Ana", "link": "/crm?tab=pipeline&pipeline=p&q=Ana"}]}})
    events = asyncio.run(_collect(deps, "Onde devo focar?"))
    assert events[-1]["links"] == ["/crm?tab=pipeline&pipeline=p&q=Ana"]


def test_a_suspended_account_is_refused_before_any_model_call():
    deps, ran, prompts = _deps(plan=Plan(), store=FakeStore(suspended=True))
    events = asyncio.run(_collect(deps))
    assert [e["type"] for e in events] == ["error"]
    assert "suspensa" in events[0]["message"]
    assert ran == [] and prompts == {} and deps.store.messages == []


def test_a_question_without_data_is_answered_without_queries():
    deps, ran, _ = _deps(plan=Plan(tools=[], reply="Oi! Pergunte sobre o funil ou onde focar."))
    events = asyncio.run(_collect(deps, "Oi"))
    assert [e["type"] for e in events] == ["thread", "delta", "done"]
    assert events[1]["text"].startswith("Oi!")
    assert ran == []


def test_the_planner_failing_is_an_error_and_is_stored():
    deps, _, _ = _deps(plan=RuntimeError("invalid token"))
    events = asyncio.run(_collect(deps))
    assert events[-1]["type"] == "error"
    assert deps.store.messages[-1][0] == "assistant" and "invalid token" in deps.store.messages[-1][3]["error"]


def test_the_planner_keeps_only_known_tools_three_at_most():
    plan = Plan.model_validate({"tools": [{"name": "resumo"}, {"name": "sql_cru"}, {"name": "quebra"},
                                          {"name": "perdas"}, {"name": "placar"}, "lixo"]})
    assert [c.name for c in plan.tools] == ["resumo", "quebra", "perdas"]
    assert Plan.model_validate({"tools": None}).tools == []


def test_the_planner_message_carries_today():
    assert planner_message("x", [], NOW.date()).startswith("HOJE: 2026-09-14")
