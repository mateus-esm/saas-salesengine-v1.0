"""Sprint 11 · Onda 6 · T63 — "Entenda como está sua máquina de receita".

A question becomes an answer in three steps:

  1. plan    — a short model call picks up to 3 read tools and their arguments
               (JSON; no dependency on the provider's native tool calling);
  2. tools   — they run in parallel, each one database call AS THE USER;
  3. answer  — a streamed model call writes the answer from the results only.

Numbers come only from the tools: the answer prompt forbids anything else, and
the evals (T66) check it. The conversation is kept per user (copilot_threads /
copilot_messages); the last turns go back with each question.

A suspended account gets a plain refusal before any model is called.
"""

from __future__ import annotations

import asyncio
import inspect
import json
from dataclasses import dataclass
from datetime import date, datetime, timezone
from time import perf_counter
from typing import Any, AsyncIterator, Awaitable, Callable

from pydantic import BaseModel, Field, field_validator

from app.copilot.tools import TOOLS, today_brt
from app.llm import build_chat_model, parse_model_output, structured_output_kwargs

MAX_CALLS = 3


class PlannedCall(BaseModel):
    name: str
    args: dict[str, Any] = Field(default_factory=dict)


class Plan(BaseModel):
    tools: list[PlannedCall] = Field(default_factory=list)
    reply: str | None = None

    @field_validator("tools", mode="before")
    @classmethod
    def _known_only(cls, value: Any) -> list[Any]:
        if not isinstance(value, list):
            return []
        known = [c for c in value if isinstance(c, dict) and c.get("name") in TOOLS]
        return known[:MAX_CALLS]


def _tool_docs() -> str:
    return "\n".join(f"- {name}: {doc}" for name, (_, _, doc) in TOOLS.items())


PLANNER_PT = """Você escolhe as consultas ao CRM para responder a pergunta de um usuário de vendas.
Responda APENAS com JSON: {"tools": [{"name": "...", "args": {...}}], "reply": null}

- No máximo 3 consultas, só da lista abaixo, com os argumentos da descrição.
- Datas em AAAA-MM-DD. HOJE vem na mensagem. Sem período dito, deixe de/ate de fora (vale o mês atual).
- "linha" e "responsavel" podem ser o nome (a consulta acha) ou o id.
- Pergunta sem dado do CRM (cumprimento, ajuda de uso): "tools": [] e "reply" com a resposta curta.

CONSULTAS
""" + _tool_docs()

ANSWER_PT = """Você é o Copilot de um CRM de vendas e responde em português do Brasil, direto e útil.

REGRAS
- Use SOMENTE os números, nomes e fatos dos RESULTADOS. Nunca invente, estime ou arredonde para cima. Se o dado não veio, diga "não tenho esse dado".
- Diga o período e o filtro que os resultados usaram.
- Se um resultado tem "erro", diga que aquela consulta não deu certo.
- Quando houver "link" nos resultados, ofereça-o em markdown — [Ver na tabela](link), [Abrir negócio](link).
- Curto: até 8 linhas ou uma lista de até 7 itens. Valores em R$ no formato brasileiro.
- Nada de JSON na resposta."""


def _history_block(history: list[dict[str, Any]]) -> str:
    if not history:
        return ""
    lines = [f"{'Usuário' if h.get('role') == 'user' else 'Copilot'}: {str(h.get('content') or '')[:600]}" for h in history]
    return "CONVERSA ATÉ AQUI:\n" + "\n".join(lines) + "\n\n"


def planner_message(question: str, history: list[dict[str, Any]], today: date) -> str:
    return f"HOJE: {today.isoformat()}\n\n{_history_block(history)}PERGUNTA: {question}"


def answer_message(question: str, history: list[dict[str, Any]], results: list[dict[str, Any]], today: date) -> str:
    payload = json.dumps(results, ensure_ascii=False, default=str)
    if len(payload) > 14000:
        payload = payload[:14000] + " …(cortado)"
    return f"HOJE: {today.isoformat()}\n\n{_history_block(history)}PERGUNTA: {question}\n\nRESULTADOS:\n{payload}"


@dataclass
class ChatDeps:
    """What the chat needs from the world — every piece replaceable in tests."""

    store: Any  # suspended, ensure_thread, history, add_message
    run_tool: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]]
    plan: Callable[[str], Awaitable[Plan]]
    answer: Callable[[str], AsyncIterator[str]]
    model_id: str = ""


def _links(results: list[dict[str, Any]]) -> list[str]:
    found: list[str] = []

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            link = node.get("link")
            if isinstance(link, str) and link not in found:
                found.append(link)
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(results)
    return found[:12]


async def answer_stream(
    *,
    equipe_id: str,
    user_id: str,
    thread_id: str | None,
    question: str,
    deps: ChatDeps,
    now: datetime | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """The events of one answer: thread → tools → delta… → done (or error)."""
    question = (question or "").strip()[:2000]
    if not question:
        yield {"type": "error", "message": "Pergunte alguma coisa."}
        return
    if await asyncio.to_thread(deps.store.suspended, equipe_id):
        yield {"type": "error", "message": "A conta está suspensa: o Copilot volta a responder quando ela for regularizada."}
        return

    today = today_brt(now)
    started = perf_counter()
    thread_id = await asyncio.to_thread(deps.store.ensure_thread, equipe_id, user_id, thread_id, question)
    yield {"type": "thread", "thread_id": thread_id}
    history = await asyncio.to_thread(deps.store.history, thread_id, 6)
    await asyncio.to_thread(deps.store.add_message, thread_id, equipe_id, user_id, "user", question, [], {})

    async def fail(reason: str) -> dict[str, Any]:
        text = "Não consegui responder agora. Tente de novo em instantes."
        await asyncio.to_thread(deps.store.add_message, thread_id, equipe_id, user_id, "assistant", text, [],
                                {"error": reason[:300], "model": deps.model_id})
        return {"type": "error", "message": text}

    try:
        plan = await deps.plan(planner_message(question, history, today))
    except Exception as exc:
        yield await fail(f"plan: {exc}")
        return
    planned = perf_counter()

    calls = plan.tools[:MAX_CALLS]
    if not calls:
        text = (plan.reply or "").strip() or (
            "Posso responder sobre o funil, as campanhas, o placar das linhas, os negócios e onde focar. O que você quer saber?"
        )
        yield {"type": "delta", "text": text}
        message_id = await asyncio.to_thread(deps.store.add_message, thread_id, equipe_id, user_id, "assistant", text, [],
                                             {"planner_ms": int((planned - started) * 1000), "model": deps.model_id})
        yield {"type": "done", "message_id": message_id, "thread_id": thread_id, "links": []}
        return

    yield {"type": "tools", "tools": [{"name": c.name, "label": TOOLS[c.name][1]} for c in calls]}
    results = await asyncio.gather(*(deps.run_tool(c.name, c.args) for c in calls))
    tooled = perf_counter()
    tagged = [{"consulta": c.name, "args": c.args, **(r if isinstance(r, dict) else {"dados": r})} for c, r in zip(calls, results)]

    parts: list[str] = []
    try:
        async for delta in deps.answer(answer_message(question, history, tagged, today)):
            if delta:
                parts.append(delta)
                yield {"type": "delta", "text": delta}
    except Exception as exc:
        yield await fail(f"answer: {exc}")
        return
    answered = perf_counter()

    content = "".join(parts).strip() or "Não consegui montar a resposta com esses dados."
    tools_meta = [{"name": c.name, "args": c.args, "label": TOOLS[c.name][1], "ok": "erro" not in r}
                  for c, r in zip(calls, results)]
    message_id = await asyncio.to_thread(
        deps.store.add_message, thread_id, equipe_id, user_id, "assistant", content, tools_meta,
        {"planner_ms": int((planned - started) * 1000), "tools_ms": int((tooled - planned) * 1000),
         "answer_ms": int((answered - tooled) * 1000), "total_ms": int((answered - started) * 1000),
         "model": deps.model_id},
    )
    yield {"type": "done", "message_id": message_id, "thread_id": thread_id, "links": _links(tagged)}


# ── the real pieces ─────────────────────────────────────────────────────────


class ChatStore:
    """Threads and messages, written by the agent (the user reads them under RLS)."""

    def __init__(self, pool: Any) -> None:
        self.pool = pool

    def _one(self, sql: str, params: tuple[Any, ...]) -> Any:
        from app.copilot.repo import _ensure_open

        _ensure_open(self.pool)
        with self.pool.connection() as conn, conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
            return row[0] if row else None

    def suspended(self, equipe_id: str) -> bool:
        return bool(self._one("select public.tenant_is_suspended(%s::uuid)", (equipe_id,)))

    def ensure_thread(self, equipe_id: str, user_id: str, thread_id: str | None, question: str) -> str:
        if thread_id:
            found = self._one(
                "update public.copilot_threads set updated_at = clock_timestamp() "
                "where id = %s::uuid and user_id = %s::uuid returning id::text",
                (thread_id, user_id),
            )
            if found:
                return found
        return self._one(
            "insert into public.copilot_threads (equipe_id, user_id, title) values (%s::uuid, %s::uuid, %s) returning id::text",
            (equipe_id, user_id, question[:80]),
        )

    def history(self, thread_id: str, limit: int) -> list[dict[str, Any]]:
        rows = self._one(
            "select coalesce(jsonb_agg(jsonb_build_object('role', m.role, 'content', m.content) order by m.created_at), '[]'::jsonb) "
            "from (select role, content, created_at from public.copilot_messages where thread_id = %s::uuid "
            "order by created_at desc limit %s) m",
            (thread_id, limit),
        )
        return rows or []

    def add_message(self, thread_id: str, equipe_id: str, user_id: str, role: str, content: str,
                    tools: list[dict[str, Any]], meta: dict[str, Any]) -> str:
        from psycopg.types.json import Jsonb

        return self._one(
            "insert into public.copilot_messages (thread_id, equipe_id, user_id, role, content, tools, meta) "
            "values (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s) returning id::text",
            (thread_id, equipe_id, user_id, role, content, Jsonb(tools), Jsonb(meta)),
        )


def make_plan(model_id: str) -> Callable[[str], Awaitable[Plan]]:
    from agno.agent import Agent

    async def plan(message: str) -> Plan:
        agent = Agent(model=build_chat_model(model_id), system_message=PLANNER_PT, telemetry=False,
                      **structured_output_kwargs(Plan))
        response = await agent.arun(message)
        return parse_model_output(response.content, Plan)

    return plan


def make_answer(model_id: str) -> Callable[[str], AsyncIterator[str]]:
    from agno.agent import Agent
    from agno.run.agent import RunContentEvent, RunErrorEvent

    async def answer(message: str) -> AsyncIterator[str]:
        agent = Agent(model=build_chat_model(model_id), system_message=ANSWER_PT, telemetry=False)
        stream = agent.arun(message, stream=True)
        if inspect.isawaitable(stream):
            stream = await stream
        async for event in stream:
            if isinstance(event, RunErrorEvent):
                raise RuntimeError(getattr(event, "content", None) or "o provedor falhou")
            if isinstance(event, RunContentEvent) and isinstance(event.content, str):
                yield event.content

    return answer


def build_deps(*, pool: Any, user_id: str, model_id: str, now: datetime | None = None) -> ChatDeps:
    from app.copilot.tools import UserDB, run_tool

    db = UserDB(pool, user_id)
    today = today_brt(now or datetime.now(timezone.utc))

    async def run(name: str, args: dict[str, Any]) -> dict[str, Any]:
        return await asyncio.to_thread(run_tool, db, name, args, today)

    return ChatDeps(store=ChatStore(pool), run_tool=run, plan=make_plan(model_id), answer=make_answer(model_id),
                    model_id=model_id)
