# SE-STUDY-004 — Trocar a camada de decisão do Copilot por TypeSafe Jev (SystemOne)

> Estudo técnico READ-ONLY. Base: `origin/main` = `3737d59` (Merge PR #25), worktree
> `study/typesafe-jev-copilot`. Nenhum código foi alterado.
> Evidência sempre no formato `arquivo:linha`, com caminhos relativos ao worktree.

---

## Veredito curto

**PARCIAL.** O `Agno como orquestrador` não é obstáculo nenhum — a orquestração já é
Python puro + fila no Postgres. O obstáculo é outro: **a cascata que o Jev encaixa
(Torre + Chão) já saiu do caminho quente**, e o caminho quente de hoje (o `keeper`,
uma chamada por negócio) é **80% extração/geração**, não classificação.

- Onde o Jev encaixa bem: `RouteDecision` (Torre) e a parte de rótulo do
  `IntentDecision`/`ActionPlan` (Chão) — classificação pura com rótulos fixos ou
  limitados a uma lista do tenant. Hoje isso são **2 chamadas generativas sequenciais**
  por pulso; viraria **1 chamada SystemOne com N questions**.
- Onde o Jev **não** encaixa: `extracted` (dict livre), `args` de verbos, `actions`
  ordenadas, `summary` em PT-BR, `reason` em PT-BR.
- No caminho **ativo** (Onda 6), o Jev **adiciona** uma ida, não remove: o `keeper`
  (`python-agent/app/copilot/keeper.py:192`) já faz 1 chamada por negócio e o resumo +
  os valores continuam sendo do LLM. Ganho de latência ali ≈ zero; ganho de custo só
  se o classificador substituir a chamada generativa, o que ele não substitui.

**Recomendação:** piloto shadow do Jev **na cascata legada** (`RouteDecision` primeiro),
com a telemetria de tokens que hoje não existe. Não levar o Jev para o `keeper`.

---

## 1. Inventário do uso atual dos schemas + custo/latência

### 1.1 Onde cada schema Pydantic é usado

| Schema | Definição | Onde é usado (evidência) |
| :-- | :-- | :-- |
| `RouteDecision` | `schemas.py:144-152` | `cascade/tower_doorman.py:9,100,105,109-110` (constrói, valida e aplica o guard de `pipeline_id`); `cascade/workflow.py:26,242`; `cascade/agno_workflow.py:34,184-187` (persiste em `output_action`); `tests/test_schemas.py:15` |
| `IntentDecision` | `schemas.py:155-166` | `cascade/floor_doorman.py:11,202,207,214-222`; `cascade/workflow.py:26,150,306`; `cascade/worker.py:7,51,56`; `cascade/autonomous_team.py:20,60,121`; `routers/approvals.py:26,150,194`; `tests/test_approvals_router.py:31,161,171` |
| `ActionPlan` | `schemas.py:188-198` | `cascade/floor_doorman.py:11,235,296,313,330,335`; `cascade/enricher.py:15,89-105,148,172,201`; `cascade/agno_workflow.py:41,94,103-106`; `cascade/executor.py:17,60` |
| `PlannedAction` | `schemas.py:177-186` | `cascade/floor_doorman.py:289,296`; `cascade/executor.py:28,39,56`; `cascade/field_validation.py:12,19` |
| `ActionResult` | `schemas.py:169-174` | `skills/core_table.py` (todos os verbos: `:60,68,76,88,93,95,99,106,108,110,119,121,125,134`); `cascade/executor.py:17,27,56`; `cascade/worker.py:7`; `metering.py:11,80`; `routers/approvals.py:26,104` |
| `PipelineBlueprint` (+ `StageBlueprint`, `CustomFieldBlueprint`, `PipelineNatures`) | `schemas.py:44-137` | `cascade/track_shaper.py:7,90-104`; `routers/shape.py` |
| `KeeperOutput` (Onda 6, separado em `app/copilot/`) | `copilot/actions.py:27-42` | `copilot/keeper.py:25,146,149` |

O contrato persistido é o mais rígido: `routers/approvals.py:150-202` **reconstrói um
`IntentDecision` a partir do `output_action`** gravado em `ai_decisions`, e
`routers/decisions.py:71-86` monta a tela lendo `output_action.args.field_id/value`.
Qualquer provedor de decisão novo tem de continuar produzindo exatamente esses campos.

### 1.2 Caminhos vivos e nº de chamadas LLM por pulso

| Caminho | Entrada | Chamadas LLM por pulso | Modelo |
| :-- | :-- | :-- | :-- |
| **Keeper (Onda 6 — o ativo)** | fila `copilot_jobs` → `pg_cron`/`pg_net` → `POST /api/v1/jobs/tick` (`routers/jobs.py:68`) → `run_job` (`copilot/keeper.py:158`) | **1** (`keeper.py:192`) | `settings.keeper_model or settings.doorman_model` (`jobs.py:83`) |
| Chat (Onda 6) | `POST /api/v1/chat` (`copilot/chat.py:126`) | **2** — planner (`chat.py:262`) + resposta em streaming (`chat.py:275`) | `chat_model or doorman_model` (`config.py:38`) |
| Cascata legada | `/api/v1/sync` (`routers/sync.py:72`), `/api/v1/ingest` (`routers/ingest.py:169,256`) | **2** sequenciais — Torre (`tower_doorman.py:103`) → Chão (`floor_doorman.py:205`); + N em `agentic` (`autonomous_team.py:181`) | `doorman_model` / `worker_model` |
| Agno Workflow | `/api/v1/sync/stream` e `/api/v1/sync/sweep` (`routers/sweep.py:58,133`) | **3–4** — Torre (`agno_workflow.py:34`) → Enricher (`:201`) → Chão (`:208`) → re-planejamento estratégico (`:243`) | `doorman_model` / `strategic_model` |
| Shape / pipeline | `/api/v1/shape/*` | **1** (`track_shaper.py:100`) | `shaper_model` |

Flags: `copilot_workflow_enabled=False` (`config.py:29`), `ingest_enabled=False`
(`config.py:30`), `copilot_jobs_enabled=False` (`config.py:34`) — tudo nasce desligado.

**Achado que muda o estudo:** o Sync do botão **não passa mais pelo python-agent**. O
frontend chama `crm_copilot_enqueue` direto por RPC (`src/hooks/useCopilotJobs.ts:29`)
e o `/api/v1/jobs/tick` responde **202 antes de processar** (`jobs.py:70-88`). Ou seja,
a tela não espera modelo nenhum. O `/api/v1/sync` virou caminho legado.

### 1.3 Modelos por papel (env vars) e provider

Todos os papéis caem no mesmo id por padrão:

- `doorman_model`, `worker_model`, `shaper_model` → `deepseek-v4-flash-0731`
  (`config.py:22-24`)
- `strategic_model` → o mesmo (`config.py:28`, com o comentário de que a conta Verboo
  serve uma família só hoje)
- `keeper_model` e `chat_model` → `None` = cai no `doorman_model` (`config.py:37-38`)

Provider: router OpenAI-compatível via `LLM_BASE_URL` / `LLM_API_KEY`
(`llm.py:116-145`), com `role_map` clássico para routers. **Structured output nativo está
desligado** quando há `base_url` custom (`llm.py:76-84`), porque o plano devolve
`403 structured_output_not_enabled` (`llm.py:60-63`; `tests/test_llm.py:64-79`).
Todo o contrato de saída é: prompt pede JSON → `parse_model_output` aceita model já
validado, dict ou texto JSON → `Pydantic.model_validate` → qualquer outra string é
`ModelProviderError` (`llm.py:34,87-113`) → HTTP 502 em `main.py:52-67`.

### 1.4 Latência atual (medida, não estimada)

- Achado 38 do planejamento da Onda 6 (`Planning/Sprints/sprint_11_crm_v1.1.md:2038-2042`):
  no caminho Workflow, Torre (1 chamada) → Chão (outra) → executor rodando cada verbo
  em sequência, cada verbo com **3–5 idas ao PostgREST a partir da VPS → 2–3 s por
  verbo**; a tela esperava tudo pelo SSE antes de mostrar a telemetria.
- Meta declarada em T66 (`sprint_11_crm_v1.1.md:2228-2230`): **~4 s por negócio**,
  resultado do Sync em **menos de 10 s**, primeira palavra do chat em **menos de 2 s**.
- Os tempos já são instrumentados no keeper: `context_ms`, `model_ms`, `apply_ms`
  (`keeper.py:186,203,219`), gravados no evento `keeper_done`/`keeper_skipped`/
  `keeper_failed` (`keeper.py:167`) e no `result` do job.
- Teto de concorrência 4, com o comentário explícito de que o pool tem 4 conexões
  (`config.py:33,36`; semáforo em `jobs.py:29-36,55`).
- **Não existe timeout explícito de modelo em nenhum lugar do `python-agent`**
  (nenhum `timeout=` em `llm.py:116-145` nem nos `Agent(...)`).

### 1.5 Custo atual

- A cobrança do tenant é por **ação aplicada**, não por token: `executor.py:1-8`
  ("on success, charges exactly 1 credit"), `metering.py:64-66` ("charges one credit
  only after a successful `ActionResult`"), e no novo caminho o `crm_copilot_apply`
  cobra por ação via `charge_credits`, idempotente por `run_id` + ação
  (`sprint_11_crm_v1.1.md:2102-2104`).
- Idempotência do crédito: `credits.py:21-25` (`charge_credits` idempotente por
  `idempotency_key`) e a chave derivada em `metering.py:20-23`
  (`{run_id}:{function_name}:{hash(args)}`).
- O ledger grava `verb`, `mode`, `run_id` e `model` (`metering.py:83-90`) — **não grava
  tokens**.
- **Verificado: não há medição de tokens/`usage` em lugar nenhum do `python-agent`.**
  `grep -E 'input_tokens|output_tokens|usage' python-agent/app` → 0 resultados.

> **Consequência dura:** o custo atual por decisão **não é observável pelo código** de
> hoje. Qualquer comparação de custo com o Jev exige instrumentar `usage` antes
> (Fase 0, §11). Sem isso, qualquer número seria invenção.

Chat: crédito a preço 0 no piloto, com intenção declarada de gravar tokens no ledger
(`sprint_11_crm_v1.1.md:2193-2194`) — também ainda não implementado.

---

## 2. O que o Jev faz bem — mapeamento campo a campo

Tipos do SystemOne (referência do contrato, `contexto/spec.md:44-48`): **Noul**
(verdadeiro/falso graduado 0..1), **Choice** (classificação com probabilidades +
confidence), **Score** (nota numa escala com legend + confidence). Uma chamada avalia
várias `questions` sobre o mesmo `state`.

| Campo atual | Evidência | Tipo Jev | Question sugerida | Observação |
| :-- | :-- | :-- | :-- | :-- |
| `RouteDecision.contact_type` | `schemas.py:145` | **Choice** | `contact_type` | 4 rótulos fixos (`lead\|contact\|spam\|other`). Encaixe perfeito. |
| `RouteDecision.pipeline_id` | `schemas.py:146` | **Choice** (lista do tenant) | `pipeline` | Rótulos dinâmicos por tenant. **Hipótese a validar:** se `criteria` aceita array arbitrário e qual o teto prático de rótulos. O guard de id continua no código (`tower_doorman.py:107-110`). |
| `RouteDecision.stage_id` | `schemas.py:147` | — | — | Hoje sempre `null` no caminho da Torre (`tower_doorman.py:45`). |
| `RouteDecision.confidence` | `schemas.py:148` | **Score** ou derivado | `confidence` | A resposta de Choice já traz `probabilities` + `confidence`; dá para usar o `confidence` da própria Choice, sem question extra. |
| `IntentDecision.relevant` | `schemas.py:156` | **Noul** | `relevant` | Binário graduado. Encaixe perfeito. |
| `IntentDecision.automation_kind` | `schemas.py:157` | **Choice** | `automation_kind` | 3 rótulos fixos (`none\|deterministic\|agentic`). |
| `IntentDecision.skill` | `schemas.py:158` | **Choice** (lista `enabled_skills`) | `skill` | Lista por pipeline (`workflow.py:36`, `floor_doorman.py:167-174`). |
| `IntentDecision.urgency` | `schemas.py:160` | **Noul** | `urgent` | 2 valores → Noul é mais barato que Choice. |
| `IntentDecision.confidence` | `schemas.py:161` | **Score** | `confidence` | Ver acima. |
| `ActionPlan.relevant` | `schemas.py:191` | **Noul** | `relevant` | Idêntico ao `IntentDecision.relevant`. |
| `ActionPlan.automation_kind` | `schemas.py:193` | **Choice** | `automation_kind` | Idem. |
| `ActionPlan.urgency` | `schemas.py:194` | **Noul** | `urgent` | Idem. |
| `ActionPlan.confidence` | `schemas.py:195` | **Score** | `confidence` | Idem. |
| `PlannedAction.requires_confirmation` | `schemas.py:182` | **Noul** (ou regra) | — | Hoje é regra determinística `_is_high_stakes`/`_mark_confirmations` (`floor_doorman.py:289,296`). **Manter a regra** — é grátis e auditável. |
| `KeeperOutput.confidence` | `copilot/actions.py:31` | **Score** | `confidence` | Único campo do keeper que é classificação. |
| `Plan.tools[].name` (chat) | `copilot/chat.py:35-50` | **Choice** (lista `TOOLS`) | `consulta` | O *nome* da ferramenta é Choice; `args` não é (`chat.py:49` filtra por `TOOLS`). |

**Leitura do mapa:** o Jev cobre bem `RouteDecision` inteiro e ~60% do
`IntentDecision`/`ActionPlan` (só a parte de rótulo). Ele **não cobre** a parte que dá
trabalho no caminho quente de hoje.

---

## 3. O que o Jev **não** faz — e como fica

Noul/Choice/Score respondem **rótulo, grau ou nota** sobre um `state`. Não devolvem
estrutura livre, nem sequer texto. O que sobra:

| O que não cabe | Evidência | Saída proposta |
| :-- | :-- | :-- |
| `extracted: dict[str, Any]` | `schemas.py:149`; prompt em `tower_doorman.py:29-30,47` | **LLM.** Extração livre (números, datas, produtos) não é classificação. Sai da Torre e fica no LLM do enricher (`enricher.py:145`). |
| `args: dict[str, Any]` dos verbos | `schemas.py:159,181`; verbo+parâmetros em `floor_doorman.py:79-88` | **LLM** para os valores; **Choice** para *qual* verbo. |
| `actions: list[PlannedAction]` **ordenada** | `schemas.py:192`; prompt "PLANO ORDENADO" (`floor_doorman.py:232-239`); ordem respeitada em `executor.py:1-8` | **LLM** ou planejador determinístico. Questões Jev são independentes; não expressam ordem. |
| `pipeline_id` dinâmico contra lista | `tower_doorman.py:107-110` | **Choice sobre rótulo + regra no código.** O guard de id **tem de continuar** (hoje: dropa para `None`). |
| `reason` em PT-BR | `schemas.py:150,162,196`; vai para `ai_decisions.output_action` (`agno_workflow.py:183-189`) e para a tela (`routers/decisions.py:71-86`) | **Template determinístico** ("linha X · confiança 0,82 · palavras-chave: reunião") ou LLM. |
| `summary` em PT-BR (≤ 5 frases) | `keeper.py:40,47` | **LLM.** Geração de texto, sem substituto. |
| Valores tipados por ação (`select`, `multi_select`, `date`, número BR) | `keeper.py:46-53`; validação no banco | **LLM propõe, banco valida.** Já é assim (`keeper.py:39`, `crm_copilot_apply`). |
| Guardas de id / skill / tenant | `tower_doorman.py:107-110`; `floor_doorman.py:166-174,209-222`; `guards.py:18-45` | **Regra determinística — não muda com o Jev.** É o que mantém o risco baixo. |
| Detecção de palavra-chave de agendamento | `floor_doorman.py:18-48,224-227` | **Regra determinística (já existe).** Pode virar insumo do `state` do Jev, não pergunta. |

**Conclusão do §3:** o desenho é **híbrido, e nessa ordem**: Jev para rótulo/escala →
LLM só para extração/geração residual → regras para guardas, ordem, `reason` e
confirmação. Nada de "Jev puro".

---

## 4. Viabilidade de manter o Agno como orquestrador

**SIM — e isso é a parte fácil.** A pergunta parte de uma premissa que o código não
sustenta: o Agno quase não orquestra.

- O módulo chamado `cascade/agno_workflow.py` **não importa nada de `agno`**
  (`grep -E 'from agno|import agno'` no arquivo → 0 resultados). É uma sequência
  escrita à mão: Torre → Enricher → Chão → roteador de custo → executor → auditoria
  (`agno_workflow.py:200-260`). O nome é aspiracional.
- O Agno aparece só como **envelope de chamada de modelo**, no nível folha:
  `from agno.agent import Agent` em `tower_doorman.py:6`, `floor_doorman.py:5`,
  `enricher.py:11`, `keeper.py:139`, `chat.py:259,271`, `autonomous_team.py:16`.
- A orquestração real do caminho ativo é **fila no Postgres + FastAPI + semáforo**:
  `copilot_jobs` → `/jobs/tick` (`jobs.py:68-88`) → `crm_copilot_claim`
  (`jobs.py:81`) → `asyncio.Semaphore` (`jobs.py:29-36`) → `run_job`
  (`keeper.py:158`).

Ou seja: trocar a camada de decisão **não toca a orquestração**. Toca a construção do
`Agent` dentro de cada doorman. O que precisa ser construído é um **seam** — que hoje
não existe: `classify_and_route` monta o `Agent` inline (`tower_doorman.py:93-101`) e
`triage_intent` idem (`floor_doorman.py:195-203`). Não há `DecisionProvider` para
pluggar. Esse seam é o primeiro trabalho de código da Fase 2.

Vantagem do desenho atual: os testes já são escritos contra seams nomeados
(`_arun_agent` em `floor_doorman.py:157`; alvos de monkeypatch documentados em
`agno_workflow.py:16-19`), e `respx` já é dependência de dev (`pyproject.toml:26`) —
dá para mockar o HTTP do Jev sem tocar nos testes de executor/cascata.

---

## 5. Arquitetura proposta

### 5.1 Hoje (caminho ativo — Onda 6)

```
mensagens (Postgres)
  └─ trigger upsert copilot_jobs            (sprint_11:2077-2080)
       └─ pg_cron/pg_net ─► POST /api/v1/jobs/tick       (jobs.py:68)
            ├─ 401 token interno / 202 imediato           (jobs.py:74-88)
            ├─ crm_copilot_claim(batch)                   (jobs.py:81)
            └─ semáforo(4) ─► run_job                     (jobs.py:55)
                 ├─ crm_copilot_context        (1 ida)    (keeper.py:182)
                 ├─ think() = 1 chamada LLM               (keeper.py:192)
                 └─ crm_copilot_apply          (1 ida)    (keeper.py:206)
```

### 5.2 Hoje (caminho legado, atrás de flag)

```
/sync | /ingest ─► run_cascade                            (sync.py:72, ingest.py:169)
   ├─ Torre  classify_and_route     (1 LLM)               (tower_doorman.py:103)
   ├─ cria/resolve oportunidade                            (workflow.py:~250)
   ├─ Chão   triage_intent          (1 LLM)               (floor_doorman.py:205)
   ├─ confidence gate 0.75                                 (workflow.py:31)
   └─ worker: determinístico (0 LLM) | agentic (LLM+tools) (autonomous_team.py:181)
```

### 5.3 Proposto (Jev só onde é classificação)

```
                     ┌──────────────────────────────────────────────┐
estado determinístico │  DecisionProvider (seam novo)                │
(conversa + contexto) │   ├─ LlmDecision   = caminho de hoje         │
                     │   └─ JevDecision   = POST SystemOne          │
                     └───────────────┬──────────────────────────────┘
                                     │ 1 chamada, N questions
                                     ▼
                     ┌──────────────────────────────────────────────┐
                     │ adapter: answers → Pydantic                  │
                     │  · rótulo → id (guardas de lista)            │
                     │  · confidence da Choice → confidence_score   │
                     │  · reason → template                         │
                     └───────────────┬──────────────────────────────┘
                                     ▼
                     MESMO contrato: RouteDecision | IntentDecision | ActionPlan
                                     ▼
                     worker / executor / crm_copilot_apply  (inalterados)
                     LLM residual: extracted, args, summary, actions[]
```

### 5.4 Decisões de desenho

- **`state` (request):** reaproveitar o que já existe. `keeper.build_message(ctx)`
  (`keeper.py:74-134`) monta um bloco determinístico com AGORA, NEGÓCIO, CONTATO,
  ETAPAS, CAMPOS, RESUMO ANTERIOR e CONVERSA NOVA. Para a cascata,
  `tower_doorman._build_user_message` (`tower_doorman.py:53-75`) e
  `floor_doorman._build_user_message` (`floor_doorman.py:125-154`) já fazem o mesmo.
  Nada de prompt novo: os construtores existem e são testados.
- **`questions`:** geradas a partir das listas reais do tenant — `pipelines`
  (`tower_doorman.py:58-65`), `enabled_skills` (`floor_doorman.py:137`),
  `stage_guide` (`stages.py:9-36`). `name` da question = nome do campo do schema, para
  o merge ser mecânico.
- **`answers` → Pydantic:** um adapter por schema, com a filosofia do
  `parse_model_output` (`llm.py:87-113`): resposta que não mapeia **não** vira default
  silencioso — vira erro tipado, para não repetir o incidente descrito em
  `llm.py:34-49` (o 401 do router que virou "seu blueprint é inválido").
- **Idempotência:** as chamadas do Jev são leitura, então a idempotência fica onde já
  está — crédito por `idempotency_key` (`credits.py:21-25`) e apply por `run_id`+ação.
  **Porém**, se o Jev cobrar por chamada, um retry **recobra**: é preciso gravar um
  `decision_key` (`run_id` + hash do `state` + conjunto de questions) e reusar a
  resposta gravada.
- **Fallback:** a chamada Jev entra embrulhada em `asyncio.wait_for` com timeout por
  env var, e o ramo de erro cai **no caminho de hoje** (`build_chat_model`). O ramo LLM
  é o *default*, não o plano B. Hoje nenhum timeout existe (§1.4) — este seria o
  primeiro do hot path.
- **Telemetria:** a resposta do Jev traz `usage{input_tokens, output_tokens}` — é
  exatamente o dado que hoje não existe (§1.5). Gravar em `copilot_run_events`
  (`events.py:46-56`, tabela `copilot_run_events`) junto de `provider`, `questions`,
  `answers`, `latency_ms`. `RunEmitter.emit` já é best-effort e nunca bloqueia o run
  (`events.py:38-41`) — mesmo padrão.

---

## 6. Latência

| | Hoje | Com Jev |
| :-- | :-- | :-- |
| Cascata legada (Torre+Chão) | **2 chamadas generativas sequenciais** (`tower_doorman.py:103` → `floor_doorman.py:205`); a segunda só começa depois da primeira porque precisa de `opportunity`/`stage_guide` (`agno_workflow.py:196-210`) | **1 round trip** com N questions. Ganho estrutural real: some uma geração inteira de JSON. |
| Enricher (só no Workflow) | 1 chamada generativa (`agno_workflow.py:201`) | Permanece (extração). |
| Keeper (caminho ativo) | **1 chamada generativa** (`keeper.py:192`) | **1 generativa + 1 classificador** — piora ou empata. O resumo e os valores continuam no LLM. |
| Chat | 2 chamadas (planner + resposta streaming, `chat.py:262,275`) | O planner é Choice (ganho pequeno); a resposta é geração e domina. |
| Sync (tela) | 202 antes de processar (`jobs.py:70-88`); frontend nem chama o agente (`useCopilotJobs.ts:29`) | **Impacto ≈ nulo.** A tela já não espera modelo. |

**O ponto que decide o estudo:** o ganho de latência do Jev só aparece quando ele
**substitui** uma chamada generativa. Na cascata legada, substitui (2 → 1). No caminho
ativo, ele **acompanha** a chamada que já existe (1 → 2). Por isso o piloto tem de ser
na cascata, não no keeper.

Metas que já existem e servem de régua: ~4 s/negócio, Sync < 10 s, 1ª palavra do chat
< 2 s (`sprint_11_crm_v1.1.md:2228-2230`).

**Hipótese a validar:** o tempo de decode do Jev para ~6 questions de rótulo é menor
que o decode de um JSON generativo de `IntentDecision`+`ActionPlan`. Plausível (rótulo
é poucos tokens; o JSON atual é maior), mas **sem medição** — o contrato do SystemOne
não publica latência na referência disponível (`contexto/spec.md:44-48`).

---

## 7. Custo

**Hoje, o que dá para afirmar do código:**

- A cobrança do tenant é por **ação aplicada** (`executor.py:1-8`,
  `metering.py:64-66`), não por token. **Reduzir token reduz COGS, não o preço pago
  pelo cliente.** Isso muda a conversa: o ganho é de margem, não de receita.
- Volume de chamadas no caminho ativo: **1 por negócio por passada** (`keeper.py:192`),
  disparado quando a conversa pausa e só com mensagem nova
  (`sprint_11_crm_v1.1.md:2018-2021`, `keeper.py:188-189`).
- Volume na cascata: **2 por pulso** (Torre+Chão), e cada uma carrega uma **cópia da
  conversa** no prompt (`tower_doorman.py:72`, `floor_doorman.py:143`) → o mesmo texto
  é pago duas vezes em prefill.
- Chat: 2 chamadas por pergunta, com a resposta em streaming (`chat.py:262,275`).

**O que o Jev muda, estruturalmente:**

- Um `state` enviado **uma vez** responde N questions. Se a cobrança for por token, o
  prefill da conversa sai de 2× para 1× na cascata.
- O output do Jev é rótulo + probabilidades — muito menor que o JSON gerado hoje
  (`IntentDecision` com `reason` em PT-BR, `args` etc., `floor_doorman.py:112-121`).

**Hipóteses a validar (não inventar):**

1. **Modelo de cobrança do SystemOne** — por token (`usage.input_tokens`,
   `usage.output_tokens`), por chamada, ou os dois. A referência disponível
   (`contexto/spec.md:44-48`) **não publica preço**.
2. **Preço das questions** — uma chamada com 6 questions custa 6× uma question, ou o
   preço da chamada é fixo? Muda toda a conclusão econômica.
3. **Volume real** — hoje não há contagem de chamadas nem de tokens por decisão
   (§1.5). Sem instrumentar, não existe denominador.

**Residual que o Jev nunca remove:** no keeper, `summary` (≤ 5 frases), os valores das
ações e o `reason` continuam saindo de geração. No caminho legado, `extracted` e `args`
continuam no LLM.

---

## 8. Mapa de gaps (o que não existe e precisaria nascer)

| # | Gap | Evidência de que não existe | O que construir |
| :-- | :-- | :-- | :-- |
| 1 | Client Jev no `python-agent` | `pyproject.toml:7-19` não tem `typesafe-sdk`; `grep -ri typesafe python-agent` → 0 | `app/typesafe/client.py` (HTTP via `httpx`, já dep de dev: `pyproject.toml:25`) ou o SDK. Env vars: `TYPESAFE_BASE_URL`, `TYPESAFE_API_KEY`, `TYPESAFE_MODEL`, `TYPESAFE_TIMEOUT_S`, `TYPESAFE_ENABLED`. |
| 2 | Mapeamento schema → questions | inexistente | `app/typesafe/questions.py`, montando as questions a partir do contexto já carregado (`tower_doorman.py:58`, `floor_doorman.py:137`, `stages.py:9`). |
| 3 | Adapter answers → Pydantic | inexistente | `app/typesafe/adapters.py` para `RouteDecision`/`IntentDecision`/`ActionPlan`, com as guardas de lista (`tower_doorman.py:107-110`, `floor_doorman.py:209-222`). |
| 4 | Seam de provedor de decisão | `Agent` montado inline em `tower_doorman.py:93` e `floor_doorman.py:195` | Protocolo `DecisionProvider` + duas implementações, escolhidas por flag. **Pré-requisito de tudo.** |
| 5 | Validação de `pipeline_id`/`skill` | **já existe** (`tower_doorman.py:107-110`; `floor_doorman.py:166-174`) | Nada. Só garantir que o adapter passe por ela. |
| 6 | Fallback LLM | inexistente como abstração | Ramo de erro do `DecisionProvider` → `build_chat_model`. |
| 7 | Telemetria/metering por decisão | `grep usage` → 0 (§1.5); ledger sem tokens (`metering.py:83-90`) | Gravar `provider`, `usage`, `latency_ms`, `answers` em `copilot_run_events` (`events.py:46-56`) e tokens no ledger. |
| 8 | Testes | seam existe mas sem provider novo | `respx` (dev, `pyproject.toml:26`) para mockar o HTTP; reaproveitar `_arun_agent` (`floor_doorman.py:157`) e os alvos de monkeypatch de `agno_workflow.py:16-19`. |
| 9 | Feature flag | flags existem para cascata/workflow/jobs (`config.py:29,30,34`) | `TYPESAFE_ENABLED` (default false) + override por linha em `pipeline_agent_rules`, que já carrega `doorman_model`/`strategic_model`/`escalate_threshold` (`agno_workflow.py:198,239`; `cognition/router.py:44-56`). |
| 10 | Multi-tenant | todo acesso já é escopado por `equipe_id` (`ingest.py:75-86`, `guards.py:27-45`) | Nada novo no código; **falta** o opt-out por tenant e a nota de tratamento de dados (§10). |
| 11 | Custo/usage → crédito | intenção existe só no chat (`sprint_11:2193-2194`) | Opcional: gravar `input_tokens`/`output_tokens` no ledger. |

---

## 9. Prós, contras e trade-offs

| Dimensão | A favor do Jev | Contra o Jev |
| :-- | :-- | :-- |
| **Latência** | Colapsa 2 chamadas generativas sequenciais em 1 round trip de rótulos (cascata) | No caminho ativo **adiciona** uma ida (keeper). Pouco/nada no chat e no Sync. |
| **Custo** | Prefill pago 1× em vez de 2× na cascata; output minúsculo (rótulo vs. JSON com `reason`) | Adiciona um 2º provedor para pagar; modelo de cobrança desconhecido (§7) |
| **Controle** | Confidence **por question**, com probabilidades — melhor proveniência que o float auto-declarado pelo LLM | Questões independentes: não expressam ordem, nem dict livre, nem texto |
| **Qualidade** | Bom em rótulo com lista fechada (`contact_type`, `relevant`, `automation_kind`) | Sem evidência de qualidade em PT-BR de WhatsApp; o repo já tem um fallback determinístico por causa exatamente disso (`floor_doorman.py:18-48`) |
| **Lock-in** | — | 2º provedor externo no hot path, com a lógica de decisão escrita nas `questions` |
| **Observabilidade** | O `usage` que o Jev devolve é o dado que hoje falta (§1.5) | Duas fontes de decisão para auditar em `ai_decisions` (`audit.py:5-53`) |
| **Esforço** | Os construtores de `state` e as guardas já existem; testes já têm seams | O seam de provedor não existe (§8.4) — é refactor antes de qualquer ganho |
| **Escopo útil** | Cascata legada (Torre/Chão) — 2 → 1 chamada | Keeper: nada a ganhar (§6) |

---

## 10. Riscos

1. **PT-BR real de WhatsApp.** O corpus do tenant é informal, com acento e sem acento.
   O repo já carrega um fallback determinístico por causa disso:
   `HIGH_INTENT_KEYWORDS` com `reunião`/`reuniao` normalizados (`floor_doorman.py:18-48`).
   Se o Jev errar a classificação de intenção de agendamento, a palavra-chave
   determinística ainda salva (`floor_doorman.py:224-227`) — mas ela só cobre 6 palavras.
   **Mitigação:** shadow mode com os fixtures de `evals/fixtures.py:22-49` antes de
   qualquer promoção; baseline de acurácia já existe
   (`evals/test_eval_doorman_accuracy.py:21`, `ACCURACY_BASELINE = 0.8`).
2. **API externa no hot path.** Hoje a única falha de provedor é tratada em um lugar
   (`ModelProviderError` → 502, `llm.py:34`, `main.py:52-67`). O Jev adiciona um
   segundo ponto de falha, com latência e disponibilidade fora do nosso controle.
   **Mitigação:** timeout explícito + fallback para o LLM como ramo default; o job já
   fecha como `failed` com espera e nada é cobrado (`keeper.py:11-12`).
3. **Timeout/retry e dupla cobrança.** Se a cobrança do Jev for por chamada, retry
   cobra de novo. **Mitigação:** `decision_key` gravado, resposta reusada (§5.4).
4. **LGPD.** A conversa passa a ir para **mais um** terceiro (hoje já vai para o router
   do LLM — `llm.py:116-145`). Não é uma categoria nova de transferência, mas é um
   destinatário novo. **Mitigação:** listar o subprocessador, opt-out por tenant, e
   usar o `state` mínimo necessário (não mandar `custom_data` inteiro se a question não
   precisa).
5. **Rollback.** Baixo custo **se** o ramo LLM nunca for apagado no piloto: a escolha
   fica no `DecisionProvider` (flag por env var + por linha). O risco é a flag virar
   permanente e ninguém mais testar o ramo antigo — o custo real é esse.
6. **Deriva de contrato.** `routers/approvals.py:150-202` reconstrói `IntentDecision` a
   partir do `output_action` gravado; se o adapter do Jev gravar um shape diferente em
   `ai_decisions`, o aprovar/recusar quebra. **Mitigação:** o adapter produz Pydantic,
   não dict ad-hoc.

---

## 11. Plano de fases

| Fase | O que | Escopo | Critério de aceite |
| :-- | :-- | :-- | :-- |
| **0 · Instrumentar** | Gravar `usage` (tokens), `provider` e `latency_ms` por decisão em `copilot_run_events` (`events.py:46-56`) e no ledger. **Sem Jev.** | `python-agent` + a SQL de relatório que já existe (`sprint_11_crm_v1.1.md:2224`) | p50/p90 de `contexto/modelo/aplicar` e tokens por negócio disponíveis por ≥ 1 semana. Sem isso, §7 fica em hipótese. |
| **1 · Shadow** | `JevDecision` roda **em paralelo** ao LLM em `RouteDecision` + `IntentDecision`; nada executa a partir do Jev. O modo `observe` já existe (`agno_workflow.py:258-282`) | cascata legada | Concordância Jev×LLM medida nos `DOORMAN_CASES` (`evals/fixtures.py:22-49`) e acurácia do Jev ≥ `ACCURACY_BASELINE` (`evals/test_eval_doorman_accuracy.py:21`). Nenhuma mutação vinda do Jev. |
| **2 · 1 decisão** | `RouteDecision.contact_type` passa a ser do Jev. `pipeline_id` e `extracted` seguem no LLM | cascata legada | Acurácia de rota não cai; taxa de erro ≤ a do LLM; **teste de injeção de falha** provando o fallback para o LLM; custo por decisão medido menor que a Fase 0. |
| **3 · Expansão** | `relevant`, `automation_kind`, `skill`, `urgency` no Jev (só cascata). `args`, `extracted`, `reason` e `actions[]` continuam no LLM | cascata legada | Acurácia do primeiro verbo não cai (`evals/fixtures.py:33-42`); custo por pulso medido menor; rollback por flag exercitado. |
| **Nunca** | Levar o Jev para `keeper.py` (`summary` + valores) ou para a resposta do chat | — | Sem classificação a fazer: §6. |

**Conviverência (rollback):** a cascata legada continua inteira e atrás de flag
(`config.py:29`), o Jev atrás de `TYPESAFE_ENABLED` e, na Fase 3, por sub-flag. Voltar é
desligar a flag — desde que o ramo LLM permaneça testado (o gate de `pytest` cobre
`tests/` e não bate em modelo, `pyproject.toml:32-36`).

---

## Anexo — Índice de evidência

**Schemas e contrato**
`python-agent/app/schemas.py:44-137` (blueprints), `:144-152` (`RouteDecision`),
`:155-166` (`IntentDecision`), `:169-174` (`ActionResult`), `:177-186`
(`PlannedAction`), `:188-198` (`ActionPlan`); `python-agent/app/copilot/actions.py:27-42`
(`KeeperOutput`).

**LLM e provider**
`python-agent/app/llm.py:34` (`ModelProviderError`), `:60-63` (403 do structured
output), `:76-84` (`structured_output_kwargs`), `:87-113` (`parse_model_output`),
`:116-145` (`build_chat_model`), `:148-161` (`build_reasoning_model`);
`python-agent/app/main.py:52-67` (502); `python-agent/tests/test_llm.py:64-118`.

**Cascata**
`tower_doorman.py:53-75,78-112`; `floor_doorman.py:18-48,51-122,125-154,157-163,
166-174,177-229,232-239,289,296,313-335`; `workflow.py:26,31,36-37,150,242,306`;
`enricher.py:15,89-105,145-157`; `worker.py:7,12-45,48-140`; `executor.py:1-8,17,24-32,
37-60`; `agno_workflow.py:16-19,34,41,94,103-106,160-194,196-260`; `stages.py:9-36`;
`agents_config.py:20-56`; `cognition/router.py:18-35,44-56`;
`evals/fixtures.py:22-49`; `evals/test_eval_doorman_accuracy.py:21,39-75`.

**Caminho ativo (Onda 6)**
`copilot/keeper.py:33-54,74-134,137-151,158-230`; `copilot/actions.py:15-42`;
`routers/jobs.py:29-36,52-65,68-88`; `routers/chat.py`; `copilot/chat.py:32,35-50,
57-76,126-200,258-285`; `app/config.py:22-38`;
`Planning/Sprints/sprint_11_crm_v1.1.md:2018-2021,2023-2025,2038-2042,2102-2104,
2116-2136,2193-2194,2220-2230`; `src/hooks/useCopilotJobs.ts:26-68`.

**Routers legados e guardas**
`routers/sync.py:31-34,49-72`; `routers/ingest.py:63-72,75-86,117-184,198-271`;
`routers/approvals.py:26,37-38,46-202`; `routers/decisions.py:16-38,65-86`;
`routers/sweep.py:38-83,90-145`; `guards.py:6-45`; `security.py:30-57`;
`audit.py:5-53`.

**Crédito, telemetria e eventos**
`credits.py:9-48,51-70`; `metering.py:11,20-23,53-96`; `events.py:20-64`;
`skills/core_table.py` (verbos); `pyproject.toml:7-19,21-27,32-36`.
