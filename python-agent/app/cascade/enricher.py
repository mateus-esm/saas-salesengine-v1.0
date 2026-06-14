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
from app.schemas import ActionPlan
from app.security import TenantContext

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

def _build_agent(*, model_id: str, lead_id: str) -> Agent:
    """Build an Agno Agent with optional Lead Memory wiring."""
    agent_kwargs: dict[str, Any] = {
        "model": build_chat_model(model_id),
        "output_schema": ActionPlan,
        "system_message": _SYSTEM_PT,
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
    """Extract CRM enrichment actions from a conversation.

    Returns an ``ActionPlan`` with ``set_field`` / ``set_contact_field`` actions
    derived from the conversation text.  Never raises — any failure or empty
    response returns a noop ``ActionPlan(relevant=False)``.
    """
    rules = rules or {}
    lead = lead or {}
    lead_id: str = lead.get("id") or ""

    model_id: str = rules.get("doorman_model") or get_settings().doorman_model

    agent = _build_agent(model_id=model_id, lead_id=lead_id)

    resp = await _arun_agent(agent, conversation or "")

    content = getattr(resp, "content", None)
    if isinstance(content, ActionPlan):
        return content

    return ActionPlan(
        relevant=False,
        actions=[],
        confidence=0.0,
        reason="no content",
    )
