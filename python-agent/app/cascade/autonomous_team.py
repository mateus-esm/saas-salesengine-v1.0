"""JTBD 4 — Autonomous Team: a cost-capped Agno worker that applies pipeline
mutations exclusively through the guarded Core-Table skill verbs.

Hard rules baked in here:
- ALL mutations route through ``CoreTableSkill`` (no raw DB writes).
- The run is bounded by ``rules["autonomy_cost_ceiling"]`` (Agno ``tool_call_limit``).
  Missing / ``None`` ceiling => autonomy is disabled and the model never runs.
- Hitting the cap halts gracefully — we summarise what was applied, never raise.
"""

from __future__ import annotations

import inspect
from typing import Any

from agno.agent import Agent
from agno.models.openai import OpenAIChat

from app.config import get_settings
from app.schemas import ActionResult, IntentDecision
from app.security import TenantContext
from app.skills.core_table import CoreTableSkill
from app.skills.registry import active_skills

_SYSTEM_PT = """\
Você é o Trabalhador Autônomo do Solo Copilot — um agente de raciocínio que executa
o próximo passo de automação no pipeline de CRM em nome do vendedor.

REGRAS CRÍTICAS:
- Você só pode agir através das ferramentas (tools) fornecidas. Cada ferramenta é um
  verbo da Core-Table guardada — nunca invente ações fora dessa lista.
- Faça apenas as mutações estritamente necessárias para cumprir a intenção descrita.
- Trabalhe dentro do limite de chamadas de ferramenta permitido. Se atingir o limite,
  pare de forma limpa — não tente contornar.
- Use os IDs exatos fornecidos no contexto (opportunity_id, lead_id). Nunca os invente.
"""


def _is_public_verb(name: str, attr: Any) -> bool:
    """A Core-Table verb is a public async coroutine method."""
    if name.startswith("_"):
        return False
    if not callable(attr):
        return False
    return inspect.iscoroutinefunction(attr)


def _collect_verbs(skill: CoreTableSkill) -> list[Any]:
    """Return the bound async verb methods of a skill instance, in declaration order."""
    verbs: list[Any] = []
    for name in type(skill).__dict__:
        attr = getattr(skill, name, None)
        if _is_public_verb(name, attr):
            verbs.append(attr)
    return verbs


def _build_message(
    *,
    decision: IntentDecision,
    opportunity: dict | None,
    lead: dict | None,
) -> str:
    parts = [
        f"INTENÇÃO: {decision.reason}",
        f"SKILL SUGERIDA: {decision.skill or 'nenhuma'}",
        f"ARGS: {decision.args}",
    ]
    if opportunity and opportunity.get("id"):
        parts.append(f"OPPORTUNITY_ID: {opportunity['id']}")
    if lead and lead.get("id"):
        parts.append(f"LEAD_ID: {lead['id']}")
    parts.append("Execute o próximo passo de automação usando apenas as ferramentas disponíveis.")
    return "\n".join(parts)


def _summarize(response: Any) -> list[dict[str, Any]]:
    """Turn the executed tool calls on a RunOutput into a JSON-safe summary."""
    applied: list[dict[str, Any]] = []
    for call in getattr(response, "tools", None) or []:
        result = getattr(call, "result", None)
        success = True
        if isinstance(result, ActionResult):
            success = result.success
        elif getattr(call, "tool_call_error", None):
            success = False
        applied.append(
            {
                "verb": getattr(call, "tool_name", None),
                "args": getattr(call, "tool_args", None),
                "success": success,
            }
        )
    return applied


def _get_session_id(opportunity: dict | None) -> str | None:
    if not (opportunity and opportunity.get("id")):
        return None
    try:
        from app.agno_store import session_id_for_opportunity

        return session_id_for_opportunity(opportunity["id"])
    except Exception:
        return None


def _get_storage() -> Any | None:
    """Session persistence (E5) is optional — degrade gracefully if unavailable."""
    try:
        from app.agno_store import get_storage

        return get_storage()
    except Exception:
        return None


async def run_autonomous(
    *,
    ctx: TenantContext,
    decision: IntentDecision,
    opportunity: dict | None,
    lead: dict | None,
    rules: dict | None,
    client: Any = None,
) -> ActionResult:
    """Run a cost-capped autonomous Agno agent that applies Core-Table mutations.

    Returns a single ``ActionResult`` summarising the applied verb calls.
    Never raises: any failure is folded into the returned ActionResult.
    """
    rules = rules or {}

    # Cost cap: a missing/None ceiling means autonomy is disabled — do NOT run the model.
    ceiling = rules.get("autonomy_cost_ceiling")
    if ceiling is None:
        return ActionResult(success=False, error="autonomy_disabled")

    # Derive the active Core-Table skill verbs as the agent's only tools.
    skill_classes = active_skills(rules.get("enabled_skills"))
    if not skill_classes:
        return ActionResult(success=False, error="no_active_skills")

    if client is None:
        from app.db import get_service_client

        client = get_service_client()

    actor = ctx.actor_user_id or "copilot"

    tools: list[Any] = []
    for skill_cls in skill_classes:
        skill = skill_cls(client=client, equipe_id=ctx.equipe_id, actor=actor)
        tools.extend(_collect_verbs(skill))

    if not tools:
        return ActionResult(success=False, error="no_active_skills")

    model_id = rules.get("worker_model") or get_settings().worker_model

    agent_kwargs: dict[str, Any] = {
        "model": OpenAIChat(id=model_id),
        "tools": tools,
        "tool_call_limit": int(ceiling),
        "system_message": _SYSTEM_PT,
        "telemetry": False,
    }

    # Optional session persistence (E5), keyed by opportunity_id.
    session_id = _get_session_id(opportunity)
    if session_id is not None:
        storage = _get_storage()
        if storage is not None:
            agent_kwargs["db"] = storage
            agent_kwargs["session_id"] = session_id

    agent = Agent(**agent_kwargs)
    message = _build_message(decision=decision, opportunity=opportunity, lead=lead)

    try:
        response = await agent.arun(message)
    except Exception as exc:
        # Exceeding the cap (or any model/tool error) must halt gracefully.
        return ActionResult(
            success=False,
            error=str(exc),
            detail={"halted": True, "reason": "cap_exceeded_or_error"},
        )

    applied = _summarize(response)
    success = all(call["success"] for call in applied) if applied else True
    return ActionResult(success=success, detail={"applied": applied, "tool_call_limit": int(ceiling)})
