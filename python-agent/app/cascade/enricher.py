"""JTBD B4 — Contact Base Enricher: extract business properties from conversation
and propose set_field / set_contact_field actions.  Uses persistent Lead Memory
(Agno ``enable_agentic_memory`` + ``user_id``) when storage is available, and
degrades gracefully to a memory-less agent in unit tests / cold environments.
"""

from __future__ import annotations

from typing import Any

from agno.agent import Agent
from app.llm import build_chat_model

from app.config import get_settings
from app.schemas import ActionPlan, PlannedAction
from app.security import TenantContext
from app.cascade.field_dictionary import FieldDef, contact_dictionary, pipeline_dictionary
from app.cascade.field_validation import validate_field_action

# ---------------------------------------------------------------------------
# System prompt (PT-BR, following the existing cascade convention)
# ---------------------------------------------------------------------------

_SYSTEM_PT = """\
Você é o Enriquecedor de Contatos do Solo Copilot.

SUA FUNÇÃO:
Leia a conversa fornecida e extraia propriedades de negócio relevantes para o CRM.
Proponha ações set_field / set_contact_field com os valores encontrados.

PROPRIEDADES DE INTERESSE:
- Dores / problemas do cliente (dores)
- Perfil do decisor (decisor, cargo, responsável)
- Consumo ou tarifa (consumo, kWh, kWp, tarifa)
- Orçamento disponível (orçamento, verba, investimento)
- Qualquer outro dado estrutural identificável na conversa

REGRAS CRÍTICAS:
1. Proponha APENAS valores que têm evidência EXPLÍCITA na conversa — nunca invente.
2. Se um fato já constar na memória do contato (fornecida pelo sistema), NÃO repita a ação.
3. Se não encontrar dados novos, retorne relevant=false com actions=[].
4. Use APENAS os verbos set_field (para campos da oportunidade) e set_contact_field (para campos do lead).
   - set_field exige args: { "field_id": "id_do_campo", "value": "valor_extraído" }
   - set_contact_field exige args: { "key": "nome_do_campo", "value": "valor_extraído" }
5. Responda APENAS com o JSON do schema ActionPlan — sem texto adicional.

SCHEMA DE SAÍDA (ActionPlan):
{
  "relevant": true | false,
  "actions": [
    {
      "verb": "set_contact_field",
      "args": { "key": "nome_do_campo", "value": "valor_extraído" },
      "requires_confirmation": false,
      "skill": "core_table"
    }
  ],
  "automation_kind": "deterministic",
  "urgency": "normal",
  "confidence": 0.0,
  "reason": "explicação curta em português"
}
"""


def _render_fields(title: str, fields: dict[str, FieldDef], id_label: str) -> str:
    if not fields:
        return f"{title}: (nenhum campo disponível)\n"
    lines = [f"{title}:"]
    for ident, field in fields.items():
        desc = f" — {field.description}" if field.description else ""
        lines.append(f'  - {id_label}="{ident}" | label="{field.label}" | tipo={field.type}{desc}')
    return "\n".join(lines) + "\n"


def _build_system_prompt(
    pipeline_fields: dict[str, FieldDef], contact_fields: dict[str, FieldDef]
) -> str:
    return (
        _SYSTEM_PT
        + "\n\nCAMPOS DISPONÍVEIS (use APENAS estes — nunca invente um campo):\n"
        + _render_fields("CAMPOS DA OPORTUNIDADE (verbo set_field, use field_id)", pipeline_fields, "field_id")
        + _render_fields("CAMPOS DO CONTATO (verbo set_contact_field, use key)", contact_fields, "key")
        + "Para anexar um arquivo/foto a um campo do tipo 'file', use attach_file "
          "com { field_id, file_url }.\n"
    )


def _noop(reason: str) -> ActionPlan:
    return ActionPlan(relevant=False, actions=[], confidence=0.0, reason=reason)


def _sanitize_plan(
    plan: ActionPlan,
    *,
    pipeline_fields: dict[str, FieldDef],
    contact_fields: dict[str, FieldDef],
) -> ActionPlan:
    actions = [
        a for a in plan.actions
        if validate_field_action(a, pipeline_fields=pipeline_fields, contact_fields=contact_fields)
    ]
    if not actions:
        return _noop(f"no valid enrichment actions. Motivo original: {plan.reason}")
    return ActionPlan(
        relevant=plan.relevant,
        actions=actions,
        automation_kind=plan.automation_kind,
        urgency=plan.urgency,
        confidence=plan.confidence,
        reason=plan.reason,
    )


# ---------------------------------------------------------------------------
# Storage helper — mirrors autonomous_team._get_storage pattern
# ---------------------------------------------------------------------------

def _get_storage() -> Any | None:
    """Lead Memory persistence is optional — degrade gracefully if unavailable."""
    try:
        from app.agno_store import get_storage

        return get_storage()
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Module-level seam so tests can monkeypatch the Agno run boundary
# ---------------------------------------------------------------------------

async def _arun_agent(agent: Agent, message: str) -> Any:
    """Thin seam around agent.arun — monkeypatch this in tests."""
    return await agent.arun(message)


# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------

def _build_agent(*, model_id: str, lead_id: str, system_prompt: str) -> Agent:
    """Build an Agno Agent with optional Lead Memory wiring."""
    agent_kwargs: dict[str, Any] = {
        "model": build_chat_model(model_id),
        "output_schema": ActionPlan,
        "system_message": system_prompt,
        "telemetry": False,
        "use_json_mode": True,
    }

    storage = _get_storage()
    if storage is not None:
        agent_kwargs["db"] = storage
        agent_kwargs["enable_agentic_memory"] = True
        agent_kwargs["user_id"] = lead_id

    return Agent(**agent_kwargs)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def enrich(
    *,
    ctx: TenantContext,
    conversation: str,
    lead: dict | None,
    opportunity: dict | None,
    rules: dict | None,
    client: Any,
) -> ActionPlan:
    """Extract CRM enrichment actions, routed to the field that owns each fact.

    Every action is validated against the live pipeline-field dictionary and the
    canonical contact-field dictionary. A fact that matches no field is dropped —
    the enricher never invents a field. Never raises.
    """
    rules = rules or {}
    lead = lead or {}
    opportunity = opportunity or {}
    lead_id: str = lead.get("id") or ""
    pipeline_id = opportunity.get("pipeline_id")

    contact_fields = contact_dictionary(client, ctx.equipe_id)
    try:
        pipeline_fields = pipeline_dictionary(client, ctx.equipe_id, pipeline_id)
    except Exception:
        pipeline_fields = {}

    model_id: str = rules.get("doorman_model") or get_settings().doorman_model
    system_prompt = _build_system_prompt(pipeline_fields, contact_fields)

    try:
        agent = _build_agent(model_id=model_id, lead_id=lead_id, system_prompt=system_prompt)
        resp = await _arun_agent(agent, conversation or "")
    except Exception:
        return _noop("enricher unavailable")

    content = getattr(resp, "content", None)
    if isinstance(content, ActionPlan):
        return _sanitize_plan(content, pipeline_fields=pipeline_fields, contact_fields=contact_fields)

    return _noop("no content")
