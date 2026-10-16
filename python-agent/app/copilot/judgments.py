"""Sprint 13 — the keeper's System One: which questions, and what they decide.

    triage (before the LLM)  — is there anything here? which stage? did it close?
    verify (after the LLM)   — does the conversation support each proposed action?

The client (app/cognition/system_one.py) is generic; this file is the part that
is specific to *this* agent. Replicating the pattern elsewhere means writing a
new file like this one: a state, a few narrow questions, and a policy.

The state the model reads uses names, never ids: an option key or a uuid means
nothing to it. Stage options go out as e1..eN and map back here, so two stages
with the same name still resolve to the right id.

Policy lives in System1:
  mode "shadow" — ask, log, change nothing (the experiment);
  mode "on"     — a quiet triage skips the LLM; verification replaces the
                  LLM's self-reported confidence with P(the conversation
                  supports the action), which is what crm_copilot_apply gates on.
Both calls fail open: an error is logged and the keeper does what it did
before System One existed.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Literal

from app.cognition.system_one import Judgments, choice, noul

# Jev reads up to 32k tokens of state + the longest question. Portuguese runs
# ~3.5 chars/token; 40k chars of conversation leaves room for stages and fields.
MAX_CONVERSATION_CHARS = 40_000

_WHO = {"customer": "cliente", "agent": "agente IA", "member": "equipe", "system": "sistema"}

Mode = Literal["shadow", "on"]


def _current_stage(ctx: dict[str, Any]) -> dict[str, Any]:
    return next((s for s in ctx.get("stages") or [] if s.get("current")), {})


def _recent(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    kept: list[dict[str, Any]] = []
    used = 0
    for m in reversed(messages):
        text = str(m.get("text") or "")
        if kept and used + len(text) > MAX_CONVERSATION_CHARS:
            break
        text = text[:MAX_CONVERSATION_CHARS]
        used += len(text)
        kept.append({"quando": m.get("at"), "de": _WHO.get(m.get("from") or "", m.get("from") or "?"), "texto": text})
    return list(reversed(kept))


def jev_state(ctx: dict[str, Any]) -> dict[str, Any]:
    """What System One reads: the deal by name, and the new conversation (the newest messages survive a cut)."""
    opp = ctx.get("opportunity") or {}
    lead = ctx.get("lead") or {}
    messages = ctx.get("messages") or []
    conversation = _recent(messages)
    return {
        "negocio": {
            "linha": (ctx.get("pipeline") or {}).get("name"),
            "etapa_atual": _current_stage(ctx).get("name"),
            "valor": opp.get("value"),
            "status": opp.get("status"),
        },
        "etapas": [
            {"nome": s.get("name"), "tipo": s.get("stage_type"), "marco": s.get("funnel_event"), "descricao": s.get("description")}
            for s in ctx.get("stages") or []
        ],
        "campos": [
            {"rotulo": f.get("label") or f.get("key"), "tipo": f.get("type"), "opcoes": f.get("options"), "valor_atual": f.get("value")}
            for f in ctx.get("fields") or []
        ],
        "contato": {"nome": lead.get("name"), "nome_provisorio": lead.get("name_is_placeholder"), "email": lead.get("email")},
        "resumo_anterior": (ctx.get("memory") or {}).get("summary") or "(primeira leitura)",
        "conversa_nova": conversation,
        "mensagens_antigas_omitidas": len(messages) - len(conversation),
    }


# ── triage ─────────────────────────────────────────────────────────────────────

INTENTS = ("next_step", "value", "contact", "field")


def triage_questions(ctx: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], dict[str, str]]:
    """The triage questions, and the map from stage option key (e1..eN) to stage id."""
    questions: dict[str, dict[str, Any]] = {
        "signal": noul(
            "A `conversa_nova` traz algum fato novo que deveria mudar o registro deste negócio no CRM "
            "(etapa, valor, campo, dado do contato, próximo passo ou fechamento), considerando o que o "
            "`resumo_anterior` e o `negocio` já dizem?",
            true="Sim: há pelo menos um fato novo e concreto para registrar.",
            false="Não: só cumprimento, agradecimento, mensagem automática, repetição do que já se sabia ou conversa vazia.",
        ),
        "outcome": choice(
            "O negócio foi fechado na `conversa_nova`?",
            {
                "aberto": "Não: o negócio segue em andamento.",
                "ganho": "Sim, ganho: o cliente confirmou explicitamente a compra, a assinatura ou o pagamento.",
                "perdido": "Sim, perdido: o cliente desistiu ou recusou explicitamente.",
            },
        ),
        # v1 asked "combinado ou necessário": every open deal "needs" a next step,
        # so it fired on greetings and auto-replies (0.67 on "retorno em breve").
        "next_step": noul(
            "Na `conversa_nova`, o cliente e o vendedor combinaram, ou o cliente pediu, um próximo passo concreto "
            "(enviar proposta, marcar visita ou reunião, retornar numa data, fazer pagamento)?",
            true="Sim: há um pedido ou combinado concreto que vira tarefa.",
            false="Não: cumprimento, agradecimento, resposta automática ou conversa sem pedido nem combinado.",
        ),
        "value": noul("Alguém disse na `conversa_nova` o valor em dinheiro deste negócio (preço, orçamento, valor da proposta)?"),
        "contact": noul("O próprio contato informou na `conversa_nova` o nome ou o e-mail dele?"),
    }
    if ctx.get("fields"):
        questions["field"] = noul(
            "A `conversa_nova` informa algum dado que preenche ou corrige um dos `campos` do negócio?"
        )

    keys: dict[str, str] = {}
    stages = ctx.get("stages") or []
    if stages:
        criteria: dict[str, str] = {}
        for i, s in enumerate(stages, start=1):
            key = f"e{i}"
            keys[key] = str(s.get("id"))
            parts = [str(s.get("name") or key)]
            if s.get("current"):
                parts[0] += " (etapa atual)"
            if s.get("description"):
                parts.append(str(s["description"]))
            if s.get("funnel_event"):
                parts.append(f"marco: {s['funnel_event']}")
            if s.get("stage_type") in ("won", "lost"):
                parts.append("fechamento " + ("ganho" if s["stage_type"] == "won" else "perdido"))
            criteria[key] = " — ".join(parts)
        questions["stage"] = choice(
            "Em qual etapa este negócio está agora, depois da `conversa_nova`? Se a conversa não mostra avanço "
            "nem recuo, é a etapa atual.",
            criteria,
        )
    return questions, keys


@dataclass(frozen=True)
class Triage:
    signal: float | None
    intents: dict[str, float | None] = field(default_factory=dict)
    stage_id: str | None = None
    stage_confidence: float | None = None
    stage_is_current: bool = True
    outcome: str | None = None
    outcome_confidence: float | None = None

    def quiet(self, below: float) -> bool:
        """Nothing at all points to a change — the LLM would have nothing to write."""
        if self.signal is None or self.signal >= below:
            return False
        if any(p is not None and p >= below for p in self.intents.values()):
            return False
        if self.outcome not in (None, "aberto"):
            return False
        return self.stage_is_current

    def as_log(self) -> dict[str, Any]:
        return {
            "signal": self.signal,
            "intents": self.intents,
            "stage_id": self.stage_id,
            "stage_confidence": self.stage_confidence,
            "stage_is_current": self.stage_is_current,
            "outcome": self.outcome,
            "outcome_confidence": self.outcome_confidence,
        }


def read_triage(j: Judgments, stage_keys: dict[str, str], ctx: dict[str, Any]) -> Triage:
    key, stage_conf = j.choice("stage")
    stage_id = stage_keys.get(key or "")
    current = str(_current_stage(ctx).get("id") or "") or None
    outcome, outcome_conf = j.choice("outcome")
    return Triage(
        signal=j.noul("signal"),
        intents={k: j.noul(k) for k in INTENTS if k in j.answers},
        stage_id=stage_id,
        stage_confidence=stage_conf,
        stage_is_current=stage_id is None or stage_id == current,
        outcome=outcome,
        outcome_confidence=outcome_conf,
    )


# ── verification ───────────────────────────────────────────────────────────────

def _quote(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else f'"{value}"'


def action_claim(action: dict[str, Any], ctx: dict[str, Any]) -> str:
    """The action as one sentence a person (or Jev) can check against the conversation."""
    kind = action.get("type")
    if kind == "note":
        return f"Registrar no negócio a nota: {_quote(action.get('text') or '')}"
    if kind == "set_field":
        f = next((f for f in ctx.get("fields") or [] if f.get("field_id") == action.get("field_id")), {})
        return f"Preencher o campo {_quote(f.get('label') or f.get('key') or 'desconhecido')} com o valor {_quote(action.get('value'))}"
    if kind == "set_contact":
        what = "e-mail" if action.get("attribute") == "email" else "nome"
        return f"Atualizar o {what} do contato para {_quote(action.get('value'))}"
    if kind == "create_task":
        return f"Criar a tarefa {_quote(action.get('title') or '')} para {action.get('due_at') or 'sem data'}"
    if kind == "add_tag":
        return f"Adicionar a etiqueta {_quote(action.get('tag') or '')} ao contato"
    if kind == "move_stage":
        s = next((s for s in ctx.get("stages") or [] if str(s.get("id")) == str(action.get("stage_id"))), {})
        text = f"Mover o negócio para a etapa {_quote(s.get('name') or 'desconhecida')}"
        return text + (f" ({s['description']})" if s.get("description") else "")
    if kind == "set_outcome":
        text = "Marcar o negócio como " + ("GANHO" if action.get("outcome") == "won" else "PERDIDO")
        return text + (f" (motivo: {action['reason']})" if action.get("reason") else "")
    if kind == "set_value":
        return f"Definir o valor do negócio como R$ {action.get('value')}"
    return f"Executar a ação {kind}: {_quote({k: v for k, v in action.items() if k not in ('confidence', 'reason')})}"


def verify_questions(ctx: dict[str, Any], actions: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """One yes/no per action, keyed a1..aN — the same 1-based index crm_copilot_apply records."""
    return {
        f"a{i}": noul(
            {
                "acao_proposta": action_claim(a, ctx),
                "pergunta": "A `conversa_nova`, lida junto com o `resumo_anterior` e o `negocio`, sustenta que o CRM "
                "faça agora a `acao_proposta`?",
            },
            true="Sim: a conversa mostra claramente o fato que justifica a ação, e a ação não inventa nada.",
            false="Não: a conversa não mostra isso, a ação é precipitada, contradiz a conversa ou inventa dados "
            "(valor, data, nome, etapa).",
        )
        for i, a in enumerate(actions, start=1)
    }


def calibrate(actions: list[dict[str, Any]], probs: list[float | None]) -> list[dict[str, Any]]:
    """Copies of the actions with confidence := P(supported). The LLM's number is kept beside it."""
    out = []
    for action, p in zip(actions, probs):
        if p is None:
            out.append(action)
        else:
            out.append({**action, "confidence": round(p, 3), "llm_confidence": action.get("confidence")})
    return out + actions[len(probs):]


# ── policy ─────────────────────────────────────────────────────────────────────

@dataclass
class System1:
    client: Any  # SystemOne, or anything with `async judge(state, questions) -> Judgments`
    mode: Mode = "shadow"
    quiet_below: float = 0.2

    @property
    def acts(self) -> bool:
        return self.mode == "on"

    async def triage(self, ctx: dict[str, Any]) -> tuple[Triage | None, dict[str, Any]]:
        questions, keys = triage_questions(ctx)
        try:
            j = await self.client.judge(jev_state(ctx), questions)
            t = read_triage(j, keys, ctx)
        except Exception as exc:  # fail open: System One never decides a pass by failing
            return None, {"error": str(exc)[:300] or exc.__class__.__name__}
        return t, {"model": j.model, "ms": j.ms, "tokens": j.input_tokens, **t.as_log(), "would_quiet": t.quiet(self.quiet_below)}

    async def verify(self, ctx: dict[str, Any], actions: list[dict[str, Any]]) -> tuple[list[float | None] | None, dict[str, Any]]:
        if not actions:
            return [], {}
        try:
            j = await self.client.judge(jev_state(ctx), verify_questions(ctx, actions))
        except Exception as exc:
            return None, {"error": str(exc)[:300] or exc.__class__.__name__}
        probs = [j.noul(f"a{i}") for i in range(1, len(actions) + 1)]
        return probs, {
            "model": j.model,
            "ms": j.ms,
            "tokens": j.input_tokens,
            "p": probs,
            "llm": [a.get("confidence") for a in actions],
            "types": [a.get("type") for a in actions],
        }
