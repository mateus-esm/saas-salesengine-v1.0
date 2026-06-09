"""JTBD 2 — Floor Doorman: triage conversation intent and choose the right CRM skill."""

import json
from typing import Any

from agno.agent import Agent
from agno.models.openai import OpenAIChat

from app.schemas import IntentDecision
from app.security import TenantContext
from app.skills.registry import SkillRegistryError, get_skill

_SYSTEM_PT = """\
Você é o Porteiro do Andar do Solo Copilot — o segundo filtro no cascata de automação de CRM.
Você recebe uma conversa já filtrada pela Torre e decide EXATAMENTE qual ação de CRM executar.

RESPONSABILIDADES:
1. Determine se a conversa contém informação relevante para atualizar o CRM (`relevant: true/false`).
   - Relevante = a conversa menciona: mudança de interesse, dados do lead, agendamentos, status, etc.
   - Irrelevante = saudação vazia, pergunta genérica, mensagem de confirmação sem dados novos

2. Se relevante, escolha `automation_kind`:
   - "deterministic" → quando você consegue mapear a ação com certeza a um skill e verbo específico
   - "agentic"       → quando a lógica é complexa demais para um único verbo (múltiplas ações)
   - "none"          → nenhuma ação automática necessária

3. Se deterministic ou agentic, preencha `skill` com o nome exato do skill habilitado e `args` com:
   {
     "verb": "nome_do_verbo",
     ... parâmetros do verbo ...
   }

4. Defina `urgency`:
   - "urgent" → o lead menciona prazo imediato, visita hoje, decisão agora, ou linguagem de urgência
   - "normal"  → todo o resto

5. Defina `confidence` entre 0.0 e 1.0.

6. Escreva um `reason` curto em português.

VERBOS DISPONÍVEIS NO SKILL "core_table":
- move_stage(opportunity_id, stage_type, stage_name_hint)       → muda a etapa kanban
- set_status(opportunity_id, status)                             → define won/lost/open
- set_field(opportunity_id, field_id, value)                     → grava campo customizado
- set_contact_field(lead_id, key, value)                         → grava campo do lead
- add_touchpoint(lead_id, touchpoint_type, content)              → registra touchpoint
- add_note(lead_id, content)                                     → adiciona nota
- create_task(lead_id, title, due_in_hours)                      → cria tarefa
- add_tag(lead_id, tag)                                          → adiciona tag
- trigger_webhook(url, payload)                                  → dispara webhook

REGRAS CRÍTICAS:
- Use APENAS skills presentes na lista `enabled_skills` fornecida — nunca invente um skill
- Se nenhum skill for habilitado, retorne `automation_kind: "none"`
- O campo `skill` deve ser o nome exato (ex: "core_table"), não o verbo
- Responda APENAS com o JSON do schema IntentDecision — sem texto adicional

SCHEMA DE SAÍDA:
{
  "relevant": true | false,
  "automation_kind": "none" | "deterministic" | "agentic",
  "skill": "core_table" | null,
  "args": {"verb": "nome_do_verbo", ...},
  "urgency": "normal" | "urgent",
  "confidence": 0.0 a 1.0,
  "reason": "explicação curta em português"
}
"""


def _build_user_message(
    conversation: str,
    opportunity: dict[str, Any],
    pipeline_rules: dict[str, Any],
) -> str:
    opportunity_summary = {
        k: opportunity.get(k)
        for k in ("id", "lead_id", "pipeline_id", "stage_id", "status", "custom_data")
        if opportunity.get(k) is not None
    }
    rules_summary = {
        "enabled_skills": pipeline_rules.get("enabled_skills") or [],
        "extraction_hints": pipeline_rules.get("extraction_hints") or {},
        "confidence_threshold": pipeline_rules.get("confidence_threshold"),
        "reasoning_enabled": pipeline_rules.get("reasoning_enabled", False),
    }
    return (
        f"CONVERSA RECEBIDA:\n{conversation}\n\n"
        f"OPORTUNIDADE ATUAL:\n{json.dumps(opportunity_summary, ensure_ascii=False, indent=2)}\n\n"
        f"REGRAS DO PIPELINE:\n{json.dumps(rules_summary, ensure_ascii=False, indent=2)}"
    )


def _is_skill_active(skill_name: str, enabled_skills: list[str]) -> tuple[bool, str]:
    """Return (is_active, reason_if_not)."""
    if skill_name not in set(enabled_skills):
        return False, f"skill '{skill_name}' não está na lista enabled_skills deste pipeline"
    try:
        get_skill(skill_name)
    except SkillRegistryError:
        return False, f"skill '{skill_name}' não está registrado no servidor"
    return True, ""


async def triage_intent(
    *,
    ctx: TenantContext,
    conversation: str,
    opportunity: dict[str, Any],
    pipeline_rules: dict[str, Any],
    model_id: str,
) -> IntentDecision:
    """Determine what CRM action (if any) the conversation warrants.

    No DB writes — pure classification. If the LLM chooses a skill that is not
    in the pipeline's enabled_skills or not registered, the decision is downgraded
    to relevant=False so the caller never dispatches an unknown skill.

    Raises:
        ValidationError: if the LLM output fails Pydantic validation (caller maps to 422).
    """
    agent = Agent(
        model=OpenAIChat(id=model_id),
        output_schema=IntentDecision,
        system_prompt=_SYSTEM_PT,
        telemetry=False,
    )
    message = _build_user_message(conversation, opportunity, pipeline_rules)
    response = await agent.arun(message)

    if isinstance(response.content, IntentDecision):
        decision = response.content
    else:
        decision = IntentDecision.model_validate(response.content)

    # Guard: downgrade if the chosen skill is not active in this pipeline.
    if decision.skill is not None:
        enabled = list(pipeline_rules.get("enabled_skills") or [])
        active, reason = _is_skill_active(decision.skill, enabled)
        if not active:
            decision = IntentDecision(
                relevant=False,
                automation_kind="none",
                skill=None,
                args={},
                urgency=decision.urgency,
                confidence=decision.confidence,
                reason=f"[Downgraded] {reason}. Motivo original: {decision.reason}",
            )

    return decision
