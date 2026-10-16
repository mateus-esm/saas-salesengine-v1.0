"""Sprint 11 · Onda 6 · T60 — one pass over one deal.

    context (1 DB call) → one model call → apply (1 DB call) → close the job

Replaces the Tower → Floor → executor chain for keeping deals up to date: since
Onda 5 every door creates the deal on arrival, so there is nothing left to route,
and one call with the whole context decides what changed. The database checks and
applies (crm_copilot_apply); this module only thinks and measures.

Sprint 13 puts System One (Jev) around the model call — triage before it,
verification after it (app/copilot/judgments.py): in "on" mode a pass with no
signal skips the model, and each action's confidence is Jev's calibrated
P(the conversation supports it) instead of the model's own guess.

Nothing new since the last read → the job closes as "skipped" without calling
the model (free). A provider failure or an unreadable answer closes it as
"failed", and the queue tries again with a wait — nothing is charged.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone
from time import perf_counter
from typing import Any, Awaitable, Callable

from pydantic import ValidationError

from app.copilot.actions import KeeperOutput
from app.copilot.judgments import System1, calibrate
from app.copilot.repo import CopilotRepo
from app.llm import ModelProviderError, build_chat_model, parse_model_output, structured_output_kwargs

Think = Callable[[str], Awaitable[KeeperOutput]]

BRT = timezone(timedelta(hours=-3))

SYSTEM_PT = """Você é o Copilot de um CRM de vendas. A cada passada você lê a conversa NOVA de um negócio e mantém o negócio em dia.

Responda APENAS com um objeto JSON, sem texto fora dele:
{"summary": "...", "confidence": 0.0, "actions": [ ... ]}

REGRAS
- Use somente ids que aparecem no CONTEXTO (stage_id de ETAPAS, field_id de CAMPOS). Nunca invente id, campo, etapa, valor ou data.
- summary: o resumo ATUALIZADO do negócio — junte o RESUMO ANTERIOR com o que a conversa nova trouxe. Até 5 frases, em português, só fatos.
- confidence: o quanto a conversa sustenta as ações, de 0 a 1.
- Proponha só o que a conversa nova sustenta. Nada relevante → "actions": [].
- Toda ação leva "confidence" (0 a 1) e "reason" (por quê, em uma frase).

AÇÕES POSSÍVEIS
- {"type": "note", "text": "o que mudou, em 1 a 3 frases"} — no máximo uma por passada.
- {"type": "set_field", "field_id": "<field_id>", "value": <valor no tipo do campo; select = exatamente uma das opções; multi_select = lista de opções; date = AAAA-MM-DD>}
- {"type": "set_contact", "attribute": "name" | "email", "value": "..."} — só se o próprio contato disser.
- {"type": "create_task", "title": "próximo passo concreto", "due_at": "AAAA-MM-DDTHH:MM:SS-03:00"} — quando houver um próximo passo combinado ou necessário.
- {"type": "add_tag", "tag": "..."} — prefira as ETIQUETAS DA EQUIPE.
- {"type": "move_stage", "stage_id": "<id>"} — quando a conversa mostrar que o negócio chegou nessa etapa (leia a descrição e o marco de cada etapa).
- {"type": "set_outcome", "outcome": "won" | "lost", "reason": "..."} — só com fechamento explícito.
- {"type": "set_value", "value": 12345.67} — só com valor dito na conversa.
"""


def _line(label: str, value: Any) -> str:
    return f"{label}: {value}" if value not in (None, "", [], {}) else ""


def _when(iso: str | None) -> str:
    if not iso:
        return ""
    try:
        at = datetime.fromisoformat(str(iso).replace("Z", "+00:00")).astimezone(BRT)
    except ValueError:
        return ""
    return at.strftime("%d/%m %H:%M")


_WHO = {"customer": "cliente", "agent": "agente IA", "member": "equipe", "system": "sistema"}


def build_message(ctx: dict[str, Any], now: datetime | None = None) -> str:
    """The user message: the deal, its line, its fields, and the new conversation."""
    now = (now or datetime.now(timezone.utc)).astimezone(BRT)
    opp = ctx.get("opportunity") or {}
    lead = ctx.get("lead") or {}
    settings = ctx.get("settings") or {}
    memory = ctx.get("memory") or {}

    stages = [
        {
            "stage_id": s.get("id"),
            "nome": s.get("name"),
            "tipo": s.get("stage_type"),
            "marco": s.get("funnel_event"),
            "descricao": s.get("description"),
            "sla_horas": s.get("max_idle_hours"),
            "atual": bool(s.get("current")),
        }
        for s in ctx.get("stages") or []
    ]
    fields = [
        {
            "field_id": f.get("field_id"),
            "rotulo": f.get("label") or f.get("key"),
            "tipo": f.get("type"),
            "opcoes": f.get("options") or None,
            "descricao": f.get("description"),
            "valor_atual": f.get("value"),
        }
        for f in ctx.get("fields") or []
    ]
    conversation = "\n".join(
        f"[{_when(m.get('at'))} {_WHO.get(m.get('from') or '', m.get('from') or '?')}] {m.get('text') or ''}"
        for m in ctx.get("messages") or []
    )

    blocks = [
        f"AGORA: {now.strftime('%Y-%m-%d %H:%M')} (horário de Brasília)",
        "NEGÓCIO: " + json.dumps(
            {
                "linha": (ctx.get("pipeline") or {}).get("name"),
                "valor": opp.get("value"),
                "status": opp.get("status"),
                "oferta": (ctx.get("pipeline") or {}).get("offer_mode"),
                "itens": [i.get("name") for i in ctx.get("items") or []] or None,
            },
            ensure_ascii=False,
        ),
        "CONTATO: " + json.dumps(
            {"nome": lead.get("name"), "nome_provisorio": lead.get("name_is_placeholder"), "email": lead.get("email"), "etiquetas": lead.get("tags")},
            ensure_ascii=False,
        ),
        "ETAPAS: " + json.dumps(stages, ensure_ascii=False),
        "CAMPOS: " + json.dumps(fields, ensure_ascii=False),
        _line("ETIQUETAS DA EQUIPE", ", ".join(ctx.get("team_tags") or [])),
        _line("TAREFAS ABERTAS", json.dumps(ctx.get("open_tasks") or [], ensure_ascii=False) if ctx.get("open_tasks") else ""),
        _line("DICAS DA LINHA", settings.get("extraction_hints")),
        "RESUMO ANTERIOR: " + (memory.get("summary") or "(primeira leitura)"),
        "CONVERSA NOVA:\n" + (conversation or "(vazia)"),
    ]
    return "\n\n".join(b for b in blocks if b)


def make_think(model_id: str) -> Think:
    """The one model call of a pass, through the configured provider (app/llm.py)."""
    from agno.agent import Agent

    async def think(message: str) -> KeeperOutput:
        agent = Agent(
            model=build_chat_model(model_id),
            system_message=SYSTEM_PT,
            telemetry=False,
            **structured_output_kwargs(KeeperOutput),
        )
        response = await agent.arun(message)
        return parse_model_output(response.content, KeeperOutput)

    return think


def _ms(start: float, end: float) -> int:
    return int(round((end - start) * 1000))


async def run_job(
    job: dict[str, Any],
    *,
    repo: CopilotRepo,
    think: Think,
    model_id: str,
    s1: System1 | None = None,
    model_timeout_s: float | None = None,
) -> dict[str, Any]:
    """Process one claimed job end to end. Never raises: the job is always closed.

    With System One (Sprint 13) the pass is  triage → [model] → verify → apply:
    in "on" mode a quiet triage closes the pass without the model (the cursor
    still moves) and verification sets each action's confidence; in "shadow"
    both judgments run beside the usual pass and are only logged (s1 in the
    job result and the run event), at no extra latency.
    """
    job_id = str(job["id"])
    opp_id = str(job["opportunity_id"])
    run_id = str(job.get("run_id") or job_id)
    equipe_id = str(job["equipe_id"])
    started = perf_counter()
    s1_log: dict[str, Any] = {"mode": s1.mode, "calibrated": False} if s1 else {}
    judging: dict[str, asyncio.Task] = {}  # System One calls still in flight

    async def close(status: str, error: str | None, result: dict[str, Any]) -> dict[str, Any]:
        for key, task in judging.items():  # a judgment in flight is logged, never lost
            if key not in s1_log:
                s1_log[key] = (await task)[1]
        if s1_log:
            result = {**result, "s1": s1_log}
        kind = {"done": "keeper_done", "skipped": "keeper_skipped"}.get(status, "keeper_failed")
        try:
            await asyncio.to_thread(repo.event, equipe_id=equipe_id, run_id=run_id, opportunity_id=opp_id,
                                    kind=kind, payload={**result, **({"error": error} if error else {})})
        except Exception:  # telemetry never decides the outcome
            pass
        try:
            await asyncio.to_thread(repo.finish, job_id, status, error, result)
        except Exception as exc:
            # The job stays "running"; crm_copilot_claim returns it to the queue
            # after 5 minutes.
            return {"status": "unclosed", "error": f"finish: {exc}"[:500], **result}
        return {"status": status, "error": error, **result}

    try:
        ctx = await asyncio.to_thread(repo.context, opp_id)
    except Exception as exc:
        return await close("failed", f"contexto: {exc}"[:500], {"timings": {"context_ms": _ms(started, perf_counter())}})
    loaded = perf_counter()
    timings: dict[str, int] = {"context_ms": _ms(started, loaded)}

    if not ctx.get("messages"):
        return await close("skipped", None, {"reason": "nada novo desde a última leitura", "timings": timings})

    # System 1 — triage. In shadow it runs beside the model; in "on" it decides first.
    if s1:
        judging["triage"] = asyncio.create_task(s1.triage(ctx))
    if s1 and s1.acts:
        triage, s1_log["triage"] = await judging["triage"]
        if triage and triage.quiet(s1.quiet_below):
            try:
                await asyncio.to_thread(
                    repo.apply, opportunity_id=opp_id, run_id=run_id, actions=[], summary=None,
                    confidence=None, cursor=ctx.get("last_message_at"), model=model_id,
                )
            except Exception as exc:
                return await close("failed", f"aplicar: {exc}"[:500], {"route": "quiet", "timings": timings})
            timings["apply_ms"] = _ms(loaded, perf_counter())
            return await close("skipped", None, {"reason": "sem sinal (System 1)", "route": "quiet", "timings": timings})
        loaded = perf_counter()

    # System 2 — the one model call.
    try:
        pending = think(build_message(ctx))
        output = await (asyncio.wait_for(pending, model_timeout_s) if model_timeout_s else pending)
    except (TimeoutError, asyncio.TimeoutError):
        timings["model_ms"] = _ms(loaded, perf_counter())
        return await close("failed", f"provedor: tempo esgotado ({model_timeout_s:g} s)", {"route": "model", "timings": timings})
    except ModelProviderError as exc:
        timings["model_ms"] = _ms(loaded, perf_counter())
        return await close("failed", f"provedor: {exc}"[:500], {"route": "model", "timings": timings})
    except ValidationError as exc:
        timings["model_ms"] = _ms(loaded, perf_counter())
        return await close("failed", f"resposta ilegível: {exc.errors()[:3]}"[:500], {"route": "model", "timings": timings})
    except Exception as exc:
        timings["model_ms"] = _ms(loaded, perf_counter())
        return await close("failed", f"modelo: {exc}"[:500], {"route": "model", "timings": timings})
    thought = perf_counter()
    timings["model_ms"] = _ms(loaded, thought)

    # System 1 — verification. "on" waits for it (it sets the confidence the
    # database gates on); shadow runs it beside the apply.
    actions = output.actions
    if s1 and actions:
        judging["verify"] = asyncio.create_task(s1.verify(ctx, actions))
        if s1.acts:
            probs, s1_log["verify"] = await judging["verify"]
            if probs and any(p is not None for p in probs):
                actions = calibrate(actions, probs)
                s1_log["calibrated"] = True
            thought = perf_counter()

    try:
        applied = await asyncio.to_thread(
            repo.apply,
            opportunity_id=opp_id,
            run_id=run_id,
            actions=actions,
            summary=output.summary or None,
            confidence=output.confidence,
            cursor=ctx.get("last_message_at"),
            model=model_id,
        )
    except Exception as exc:
        timings["apply_ms"] = _ms(thought, perf_counter())
        return await close("failed", f"aplicar: {exc}"[:500], {"route": "model", "timings": timings})
    timings["apply_ms"] = _ms(thought, perf_counter())

    applied = applied or {}
    result = {
        "mode": applied.get("mode"),
        "route": "model",
        "applied": len(applied.get("applied") or []),
        "pending": len(applied.get("pending") or []),
        "proposed": len(applied.get("proposed") or []),
        "rejected": applied.get("rejected") or [],
        "timings": timings,
    }
    return await close("done", None, result)
