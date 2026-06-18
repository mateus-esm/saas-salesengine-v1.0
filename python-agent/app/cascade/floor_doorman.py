"""JTBD 2 — Floor Doorman: triage conversation intent and choose the right CRM skill."""

import json
import re
import unicodedata
from typing import Any

from agno.agent import Agent
from app.llm import build_chat_model

from app.schemas import ActionPlan, IntentDecision, PlannedAction
from app.security import TenantContext
from app.skills.registry import SkillRegistryError, get_skill

# Deterministic high-intent scheduling keyword set.
# Accent-normalized check is done at detection time; both "reunião" and "reuniao"
# are listed so the canonical return value is clear.
HIGH_INTENT_KEYWORDS: frozenset[str] = frozenset(
    {"reunião", "reuniao", "call", "agendar", "marcar", "zoom", "meeting"}
)


def _normalize(text: str) -> str:
    """Return a casefolded, accent-stripped version of *text*."""
    return unicodedata.normalize("NFD", text.casefold()).encode("ascii", "ignore").decode()


def _build_normalized_keywords() -> dict[str, str]:
    """Build a mapping from normalized keyword → canonical keyword (computed once at import)."""
    mapping: dict[str, str] = {}
    for kw in HIGH_INTENT_KEYWORDS:
        norm = _normalize(kw)
        # Prefer "reunião" over "reuniao" when they collide after normalization.
        if norm not in mapping or kw == "reunião":
            mapping[norm] = kw
    return mapping


_NORMALIZED_KEYWORDS: dict[str, str] = _build_normalized_keywords()  # normalized_form → canonical_keyword


def detect_high_intent(conversation: str) -> str | None:
    """Return the first high-conversion scheduling keyword present (accent/case-
    insensitive), else None. Deterministic — independent of the LLM."""
    norm_conv = _normalize(conversation)
    for norm_kw, canonical in _NORMALIZED_KEYWORDS.items():
        if re.search(r"\b" + re.escape(norm_kw) + r"\b", norm_conv):
            return canonical
    return None

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

PRIORIDADE MÁXIMA — PALAVRAS-CHAVE DE AGENDAMENTO:
Mensagens contendo qualquer uma das seguintes palavras têm MÁXIMA prioridade e DEVEM
produzir uma decisão ativa (relevant=true; prefira create_task ou move_stage com alta
confiança). NUNCA retorne automation_kind:"none" quando a palavra indicar claramente
uma solicitação de agendamento: reunião, call, agendar, marcar, zoom, meeting.

Exemplos few-shot:
- Conversa: "Vamos marcar uma reunião para amanhã de manhã?"
  → {"relevant": true, "automation_kind": "deterministic", "skill": "core_table",
     "args": {"verb": "create_task", "title": "Agendar reunião", "due_in_hours": 18},
     "urgency": "urgent", "confidence": 0.92, "reason": "Lead solicitou agendamento de reunião."}
- Conversa: "Podemos fazer uma call na sexta?"
  → {"relevant": true, "automation_kind": "deterministic", "skill": "core_table",
     "args": {"verb": "create_task", "title": "Agendar call na sexta", "due_in_hours": 72},
     "urgency": "normal", "confidence": 0.88, "reason": "Lead pediu call — criar tarefa de acompanhamento."}

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
    stage_guide: list | None = None,
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
    blocks = [
        f"CONVERSA RECEBIDA:\n{conversation}\n",
        f"OPORTUNIDADE ATUAL:\n{json.dumps(opportunity_summary, ensure_ascii=False, indent=2)}\n",
        f"REGRAS DO PIPELINE:\n{json.dumps(rules_summary, ensure_ascii=False, indent=2)}",
    ]
    if stage_guide:
        guide_lines = [
            f'  - "{s["name"]}" ({s["stage_type"]}): {s.get("description") or "sem descrição"}'
            + (f' [SLA {s["max_idle_hours"]}h]' if s.get("max_idle_hours") else "")
            for s in stage_guide
        ]
        blocks.append("GUIA DE ETAPAS (use o nome exato em stage_name_hint):\n" + "\n".join(guide_lines))
    return "\n\n".join(blocks)


async def _arun_agent(agent: Agent, message: str):
    """Seam around the Agno run boundary so tests can patch the real API surface.

    See [[agno-agent-api-and-mock-blindspot]] — assert against the actual Agno call,
    not only a mocked Agent class.
    """
    return await agent.arun(message)


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
    stage_guide: list | None = None,
) -> IntentDecision:
    """Determine what CRM action (if any) the conversation warrants.

    No DB writes — pure classification. If the LLM chooses a skill that is not
    in the pipeline's enabled_skills or not registered, the decision is downgraded
    to relevant=False so the caller never dispatches an unknown skill.

    Raises:
        ValidationError: if the LLM output fails Pydantic validation (caller maps to 422).
    """
    agent = Agent(
        model=build_chat_model(model_id),
        output_schema=IntentDecision,
        system_message=_SYSTEM_PT,
        telemetry=False,
        # JSON mode (parse-based) instead of OpenAI strict structured outputs,
        # which rejects free-form dict fields (args) and optional fields.
        use_json_mode=True,
    )
    message = _build_user_message(conversation, opportunity, pipeline_rules, stage_guide)
    response = await _arun_agent(agent, message)

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

    # Deterministic intent detection — overrides LLM under-classification.
    kw = detect_high_intent(conversation)
    decision.intent_detected = kw is not None
    decision.intent_keyword = kw

    return decision


_PLAN_SYSTEM_PT = """\
Você é o Porteiro do Andar do Solo Copilot — o segundo filtro no cascata de automação de CRM.
Você recebe uma conversa já filtrada pela Torre e produz um PLANO ORDENADO de ações de CRM
(`ActionPlan`) — uma ou mais ações executadas em sequência num único pulso de sincronização.

RESPONSABILIDADES:
1. Determine se a conversa contém informação relevante para atualizar o CRM (`relevant: true/false`).
2. Se relevante, monte `actions`: uma lista ORDENADA de `PlannedAction`. Cada ação tem:
   { "verb": "nome_do_verbo", "args": { ...parâmetros do verbo... }, "skill": "core_table" }
   Ordene as ações da forma como devem ser aplicadas (ex.: primeiro enriquecer campos, depois mover etapa).
3. Defina `automation_kind` ("deterministic" | "agentic" | "none") e `urgency` ("normal" | "urgent").
4. Defina `confidence` entre 0.0 e 1.0 e escreva um `reason` curto em português.

VERBOS DISPONÍVEIS NO SKILL "core_table":
- move_stage(opportunity_id, stage_type, stage_name_hint)  → muda a etapa kanban
- set_status(opportunity_id, status)                        → define won/lost/open
- set_field(opportunity_id, field_id, value)                → grava campo customizado
- set_contact_field(lead_id, key, value)                    → grava campo do lead
- add_touchpoint(lead_id, touchpoint_type, content)         → registra touchpoint
- add_note(lead_id, content)                                → adiciona nota
- create_task(lead_id, title, due_in_hours)                 → cria tarefa
- add_tag(lead_id, tag)                                     → adiciona tag
- trigger_webhook(url, payload)                             → dispara webhook

REGRAS CRÍTICAS:
- Proponha apenas ações com evidência na conversa — nunca invente dados.
- Se nada for relevante, retorne relevant=false e actions=[].
- Responda APENAS com o JSON do schema ActionPlan — sem texto adicional.

PRIORIDADE MÁXIMA — PALAVRAS-CHAVE DE AGENDAMENTO:
Mensagens contendo qualquer uma das seguintes palavras têm MÁXIMA prioridade e DEVEM
produzir pelo menos uma ação ativa no plano (prefira create_task ou move_stage com alta
confiança). NUNCA retorne actions=[] quando a palavra indicar claramente uma solicitação
de agendamento: reunião, call, agendar, marcar, zoom, meeting.

Exemplos few-shot:
- Conversa: "Vamos marcar uma reunião para amanhã de manhã?"
  → actions: [{"verb": "create_task", "args": {"title": "Agendar reunião", "due_in_hours": 18}, "skill": "core_table"}]
- Conversa: "Podemos fazer uma call na sexta?"
  → actions: [{"verb": "create_task", "args": {"title": "Agendar call na sexta", "due_in_hours": 72}, "skill": "core_table"}]
"""

# High-stakes verbs that always pause for human approval (mirrors B5 / CoreTableSkill).
_HIGH_STAKES_VERBS = frozenset({"set_status", "trigger_webhook"})
_HIGH_STAKES_STAGES = frozenset({"won", "lost"})


def _confirm_verbs() -> frozenset[str]:
    """High-stakes verb set — prefer the CoreTableSkill source of truth when available."""
    try:
        from app.skills.core_table import CoreTableSkill

        return CoreTableSkill.confirmation_required_verbs()
    except Exception:
        return _HIGH_STAKES_VERBS


def _is_high_stakes(action: PlannedAction) -> bool:
    if action.verb in _confirm_verbs():
        return True
    stage = (action.args or {}).get("stage_type") or (action.args or {}).get("status")
    return stage in _HIGH_STAKES_STAGES


def _mark_confirmations(plan: ActionPlan) -> ActionPlan:
    """Flag high-stakes actions so the executor defers them to the HITL approval path."""
    for action in plan.actions:
        if _is_high_stakes(action):
            action.requires_confirmation = True
    return plan


async def triage_plan(
    *,
    ctx: TenantContext,
    conversation: str,
    opportunity: dict[str, Any],
    pipeline_rules: dict[str, Any],
    model_id: str,
    model: Any = None,
    stage_guide: list | None = None,
) -> ActionPlan:
    """Produce a multi-action `ActionPlan` for one sync pulse.

    Like `triage_intent` this is pure classification (no DB writes). High-stakes
    actions (won/lost moves, status close, webhooks) are flagged
    `requires_confirmation=True` so the executor defers them to the HITL path.

    When `model` is provided (e.g. a strategic reasoning model from the cost
    router) it is used as-is; otherwise a cheap chat model is built from `model_id`.

    Raises:
        ValidationError: if the LLM output fails Pydantic validation (caller maps to 422).
    """
    agent = Agent(
        model=model if model is not None else build_chat_model(model_id),
        output_schema=ActionPlan,
        system_message=_PLAN_SYSTEM_PT,
        telemetry=False,
        use_json_mode=True,
    )
    message = _build_user_message(conversation, opportunity, pipeline_rules, stage_guide)
    response = await _arun_agent(agent, message)

    if isinstance(response.content, ActionPlan):
        plan = response.content
    else:
        plan = ActionPlan.model_validate(response.content)

    _mark_confirmations(plan)

    # Deterministic intent detection — set on the plan regardless of LLM output.
    kw = detect_high_intent(conversation)
    plan.intent_detected = kw is not None
    plan.intent_keyword = kw

    return plan
