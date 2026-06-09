"""JTBD 2 — Tower Doorman: classify incoming contact and route to the right pipeline."""

import json
from typing import Any

from agno.agent import Agent
from agno.models.openai import OpenAIChat

from app.schemas import RouteDecision
from app.security import TenantContext

_SYSTEM_PT = """\
Você é o Porteiro da Torre do Solo Copilot — o primeiro filtro no cascata de automação de CRM.
Sua função é analisar uma conversa recebida, identificar o tipo de contato e decidir para qual
pipeline de vendas ele deve ser direcionado.

RESPONSABILIDADES:
1. Classifique o `contact_type`:
   - "lead"    → contato novo com intenção comercial clara (quer comprar, contratar, saber preço)
   - "contact" → contato conhecido OU sem intenção comercial imediata (suporte, dúvida geral)
   - "spam"    → propagandas, robôs, mensagens irrelevantes, textos sem sentido
   - "other"   → não se encaixa nas categorias acima

2. Se `contact_type` for "lead" ou "contact":
   - Analise os pipelines disponíveis e selecione o `pipeline_id` do pipeline mais adequado ao contexto
   - Se nenhum pipeline for adequado, retorne `pipeline_id: null`
   - Nunca invente um `pipeline_id` — use apenas os IDs exatos fornecidos na lista

3. Extraia dados úteis da conversa (números, datas, produtos mencionados, intenções declaradas)
   e coloque-os no campo `extracted` como pares chave-valor simples.

4. Defina `confidence` entre 0.0 (muito incerto) e 1.0 (certeza absoluta).

5. Escreva um `reason` curto em português explicando sua decisão.

REGRAS CRÍTICAS:
- `pipeline_id` DEVE ser um dos IDs da lista fornecida, ou null — nunca outro valor
- Para spam e other, sempre retorne `pipeline_id: null` e `stage_id: null`
- Responda APENAS com o JSON do schema RouteDecision — sem texto adicional

SCHEMA DE SAÍDA:
{
  "contact_type": "lead" | "contact" | "spam" | "other",
  "pipeline_id": "uuid-do-pipeline" | null,
  "stage_id": null,
  "confidence": 0.0 a 1.0,
  "extracted": {"chave": "valor"},
  "reason": "explicação curta em português"
}
"""


def _build_user_message(
    conversation: str,
    lead: dict[str, Any],
    pipelines: list[dict[str, Any]],
) -> str:
    pipeline_summary = [
        {
            "id": p.get("id"),
            "name": p.get("name", ""),
            "description": p.get("description") or "",
        }
        for p in pipelines
    ]
    lead_summary = {
        k: lead.get(k)
        for k in ("id", "name", "email", "phone", "tags", "source")
        if lead.get(k) is not None
    }
    return (
        f"CONVERSA RECEBIDA:\n{conversation}\n\n"
        f"DADOS DO LEAD:\n{json.dumps(lead_summary, ensure_ascii=False, indent=2)}\n\n"
        f"PIPELINES DISPONÍVEIS:\n{json.dumps(pipeline_summary, ensure_ascii=False, indent=2)}"
    )


async def classify_and_route(
    *,
    ctx: TenantContext,
    conversation: str,
    lead: dict[str, Any],
    pipelines: list[dict[str, Any]],
    model_id: str,
) -> RouteDecision:
    """Classify an incoming conversation and route it to the right pipeline.

    No DB writes — pure classification. Caller is responsible for acting on the decision.

    Raises:
        ValidationError: if the LLM output fails Pydantic validation (caller maps to 422).
    """
    agent = Agent(
        model=OpenAIChat(id=model_id),
        output_schema=RouteDecision,
        system_prompt=_SYSTEM_PT,
        telemetry=False,
    )
    message = _build_user_message(conversation, lead, pipelines)
    response = await agent.arun(message)

    if isinstance(response.content, RouteDecision):
        decision = response.content
    else:
        decision = RouteDecision.model_validate(response.content)

    # Guard: LLM must only reference pipeline IDs from the supplied list.
    valid_ids = {str(p["id"]) for p in pipelines if p.get("id")}
    if decision.pipeline_id is not None and str(decision.pipeline_id) not in valid_ids:
        decision = decision.model_copy(update={"pipeline_id": None, "stage_id": None})

    return decision
