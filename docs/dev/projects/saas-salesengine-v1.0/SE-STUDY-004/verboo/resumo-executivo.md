# SE-STUDY-004 — Resumo executivo

**Pergunta:** dá para trocar as decisões do Copilot (LLM + Pydantic) por TypeSafe Jev
(SystemOne, `jev-latest`, questions Noul/Choice/Score), mantendo o Agno como
orquestrador, para reduzir latência e custo?

## Veredito: **PARCIAL — sim, mas não no lugar que se imaginava**

**Agno como orquestrador não é obstáculo.** O módulo chamado `agno_workflow.py` não
importa nada de `agno` (`python-agent/app/cascade/agno_workflow.py`); o Agno aparece só
como envelope de chamada de modelo no nível folha (`Agent(...)` em `tower_doorman.py:93`,
`floor_doorman.py:195`, `keeper.py:142`, `chat.py:262`). A orquestração real é fila no
Postgres + FastAPI + semáforo (`routers/jobs.py:68-88`, `jobs.py:29-36`). Trocar a
camada de decisão não toca a orquestração.

**O problema é outro: a cascata que o Jev encaixa já saiu do caminho quente.**

| | Jev encaixa? | Por quê |
| :-- | :-- | :-- |
| Cascata legada — Torre `RouteDecision` + Chão `IntentDecision`/`ActionPlan` | **SIM** | Classificação pura: `contact_type` (4 rótulos), `relevant` (Noul), `automation_kind` (Choice), `skill` (Choice sobre `enabled_skills`), `urgency` (Noul), `confidence` (Score). Hoje são **2 chamadas generativas sequenciais**; viraria **1 chamada com N questions** |
| Caminho ativo (Onda 6) — `keeper` | **NÃO** | Já é **1 chamada por negócio** (`copilot/keeper.py:192`) e é ~80% extração/geração (resumo em PT-BR + valores + `args`). O Jev **adicionaria** uma ida em vez de remover |
| Chat | **PARCIAL** | O planner é Choice sobre `TOOLS`, mas a resposta é geração e domina o tempo |
| Sync (tela) | **IRRELEVANTE** | O frontend enfileira por RPC (`src/hooks/useCopilotJobs.ts:29`) e o tick responde 202 antes de processar (`jobs.py:70-88`) — a tela já não espera modelo |

**O que o Jev não faz** e tem de continuar em outro lugar: `extracted` (dict livre),
`args` de verbos, `actions[]` **ordenadas**, `summary` e `reason` em PT-BR, e os guards
de id/skill — que são regras determinísticas e **não devem mudar**. Desenho final é
híbrido: **Jev para rótulo/escala → LLM só para extração/geração → regras para guardas,
ordem e confirmação.**

## Prós e contras

| A favor | Contra |
| :-- | :-- |
| Some uma geração inteira na cascata (2 → 1 round trip) | No caminho ativo o Jev **soma** uma chamada |
| Confidence **por question**, com probabilidades — melhor que o float auto-declarado do LLM | Sem evidência de qualidade em PT-BR informal de WhatsApp; o repo já tem fallback determinístico por isso (`floor_doorman.py:18-48`) |
| Prefill da conversa pago 1× em vez de 2×; output é rótulo, não JSON com `reason` | 2º provedor externo no hot path → 2º ponto de timeout/erro |
| O `usage{input_tokens, output_tokens}` do Jev é **exatamente o dado que hoje não existe** | Modelo de cobrança do Jev é **desconhecido** — a referência não publica preço |
| Os construtores de `state` e as guardas de lista já existem e são testados | O seam `DecisionProvider` **não existe** — é refactor antes de qualquer ganho |

**Cuidado com a conclusão econômica:** a cobrança do tenant é **por ação aplicada**
(`executor.py:1-8`, `metering.py:64-66`), não por token. Ganho de token é ganho de
**margem (COGS)**, não de preço. E hoje **não há medição de tokens em lugar nenhum** do
`python-agent` (`grep usage|input_tokens|output_tokens` → 0 resultados).

## Decisões necessárias (dono: founder)

1. **Instrumentar antes de comprar.** Sem `usage` por decisão, não existe denominador:
   qualquer comparação de custo hoje seria invenção. Autorizar a Fase 0 (telemetria de
   tokens, sem Jev).
2. **Escopo do piloto: cascata legada, não o keeper.** O keeper é 1 chamada/decisão sem
   classificação a extrair. Confirmar que a cascata legada (`/sync` + `/sync/sweep`,
   `COPILOT_WORKFLOW_ENABLED=false`) ainda vale como alvo — o `sweep` ainda a usa direto
   (`routers/sweep.py:58,133`).
3. **Modelo de cobrança e preço do SystemOne** (por token? por chamada? por question?).
   Sem isso, a decisão de custo fica bloqueada.
4. **LGPD:** o Jev é um **destinatário novo** para a conversa do cliente (hoje ela já vai
   para o router do LLM). Listar como subprocessador e definir opt-out por tenant.
5. **Aceitar a dependência de um 2º provedor externo no hot path** — com timeout
   explícito (que hoje **não existe** em nenhum lugar do `python-agent`) e fallback
   obrigatório para o caminho LLM.

## Próximos passos

1. **Fase 0 — Instrumentar (sem Jev).** Gravar `usage`/tokens, `provider` e
   `latency_ms` por decisão em `copilot_run_events` (`app/events.py:46-56`) e no ledger
   (`metering.py:83-90`). Aceite: p50/p90 de contexto/modelo/aplicar e tokens por
   negócio por ≥ 1 semana.
2. **Fase 1 — Shadow.** `JevDecision` roda em paralelo ao LLM em `RouteDecision` +
   `IntentDecision`; nada executa a partir dele (o modo `observe` já existe,
   `agno_workflow.py:258-282`). Aceite: acurácia ≥ `ACCURACY_BASELINE = 0.8`
   (`evals/test_eval_doorman_accuracy.py:21`) nos `DOORMAN_CASES` (`evals/fixtures.py:22-49`).
3. **Fase 2 — 1 decisão.** Só `RouteDecision.contact_type` para o Jev; `pipeline_id` e
   `extracted` ficam no LLM. Aceite: rota sem regressão + teste de injeção de falha
   provando o fallback + custo por decisão **medido** menor.
4. **Fase 3 — Expansão** para `relevant`/`automation_kind`/`skill`/`urgency` na cascata.
5. **Nunca** levar o Jev para o `keeper` (`summary` + valores) nem para a resposta do
   chat — não há classificação a fazer ali.

**Rollback:** trivial se o ramo LLM nunca for apagado durante o piloto — a escolha fica
no `DecisionProvider` (`TYPESAFE_ENABLED` + override por linha em `pipeline_agent_rules`,
que já carrega `doorman_model`/`strategic_model`/`escalate_threshold`). O custo real do
rollback é a flag virar permanente e ninguém testar mais o ramo antigo.

> Estudo completo, com evidência `arquivo:linha` nas 11 perguntas:
> `verboo/estudo-completo.md`.
