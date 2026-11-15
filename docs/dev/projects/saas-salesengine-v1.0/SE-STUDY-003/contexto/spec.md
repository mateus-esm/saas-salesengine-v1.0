# SE-STUDY-003 — Task Contract

Projeto | Tarefa | Agent
saas-salesengine-v1.0 | SE-STUDY-003 | verboo

Project: saas-salesengine-v1.0
Agent: verboo
Branch: study/agno-agente-atendimento
Risk: read-only study (zero code changes)

## Outcome

Estudo COMPLETO e READ-ONLY (sem mudanças de código) respondendo se é possível usar a
infraestrutura Agno já existente no `python-agent` (o "Copilot" do Sales Engine) para construir
não só o agente de CRM, mas também o **agente de atendimento** (customer-facing), rebaixando o
**GPT Maker de agent provider para channel provider** — com o Copilot/Agno sendo responsável por
toda a inteligência de respostas.

Entregáveis (dois documentos, ambos em PT-BR):

1. `docs/dev/projects/saas-salesengine-v1.0/SE-STUDY-003/verboo/estudo-completo.md`
   Estudo técnico completo: viabilidade, arquitetura proposta, mapa de gaps, evidência de código.
2. `docs/dev/projects/saas-salesengine-v1.0/SE-STUDY-003/verboo/resumo-executivo.md`
   Resumo executivo de 1 página: veredito, prós/contras/trade-offs, decisões necessárias,
   ferramentas adicionais caso necessárias, próximos passos.
3. `docs/dev/projects/saas-salesengine-v1.0/SE-STUDY-003/README.md`
   Header Projeto | Tarefa | Origem | Agentes | Status | Artefatos | Pendências.

## Pergunta central

Hoje o atendimento conversacional ao cliente vive no GPT Maker (provider externo), e o Sales
Engine tem um `python-agent` (FastAPI + Agno) que já roda o Copilot de CRM. A pergunta é:

> É possível usar a MESMA infraestrutura Agno do `python-agent` para construir o agente de
> atendimento, mantendo o GPT Maker apenas como **channel provider** (transporte de mensagens),
> e o Copilot/Agno como o cérebro que decide e escreve as respostas?

Se sim: como seria? Se não: o que falta, e quais ferramentas adicionais seriam necessárias?

## Contexto (evidência real levantada 2026-09-14)

### python-agent (o "Copilot") — `/srv/solo-dev/repos/saas-salesengine-v1.0/python-agent`
- Stack: FastAPI + Agno + Postgres. `main.py` expõe routers: `shape`, `sync`, `sweep`, `ingest`,
  `approvals`, `cycle_pass`, `decisions`, `revenue`, `forecast`, `admin` + `/health`.
- `app/agno_store.py`: usa `agno.db.postgres.PostgresDb` com `db_schema` dedicado e
  `session_id_for_opportunity(opportunity_id)` — ou seja, **já existe persistência de sessão Agno
  por oportunidade**. Já existe `get_storage()` / `get_memory()`.
- `app/llm.py`: fábrica central de modelo. Provider e modelos são trocáveis **só por env var**
  (`LLM_BASE_URL`, `LLM_API_KEY`, `DOORMAN_MODEL`, `WORKER_MODEL`, `SHAPER_MODEL`). Usa
  `agno.models.openai.OpenAIChat` apontado para um router [OI]-compatível (ex.: Verboo
  `https://code.verboo.ai/router/v1`). Existe `ModelProviderError` para falha de provider.
- `app/cascade/`: já há um time de agentes — `tower_doorman`, `floor_doorman`, `track_shaper`,
  `autonomous_team`, `enricher`, `executor`, `worker`, `workflow`, `agno_workflow`, `stages`.
- `app/cognition/`, `app/skills/`, `app/knowledge.py` (RAG), `app/credits.py` (ledger),
  `app/metering.py` (telemetria), `app/events.py`, `app/guards.py`, `app/security.py`.
- Testes amplos: `test_agno_workflow.py`, `test_workflow.py`, `test_router.py`, `test_ingest_router.py`,
  `test_shape_router.py`, `test_credits.py`, `test_metering.py`, `test_knowledge`-adjacent etc.
- Ingestão: `app/routers/ingest.py` **já existe mas está desligada** (`settings.ingest_enabled = False`).

### Contrato inbound já desenhado (não implementado)
- `python-agent/docs/INBOUND_AGENT_CONTRACT.md` — "foundation only. No conversational agent ships
  in Sprint 6.1." Define:
  - **Envelope inbound** normalizado (channel, tenant_ref, contact, message, conversation_ref).
  - `message.id` é a **chave de idempotência** (mesmo provider id não pode ser processado 2x).
  - **Shape de resposta outbound** (cognição retorna zero ou mais ações que o adapter renderiza).
  - Resolução de tenant (`equipe_id`) por `channel_account` / `api_key` / `subdomain`.
  - O doc declara explicitamente: Sprint 6.2 move a conversa para dentro, com "an Agno agent that
    reads inbound messages, answers the customer, and feeds the same Workflow that the ⚡ Sync
    button already drives".
- A fronteira desenhada é: **transporte** (webhooks/canais) ↔ **cognição** (Workflow).

### GPT Maker hoje — provider de agente (o que se quer rebaixar)
- `src/services/ai-studio/providers/GPTMakerProvider.ts`: implementa `AIProvider` com
  `getUsage()`, `createTrainingBlock()`, `manageIntentions()` — **métodos com TODO/mock**, sem
  integração real de API. `getModels()` foi removido (catálogo agora vem de edge function).
- É o **único** provider em `src/services/ai-studio/providers/`.
- Edge functions ligadas ao GPT Maker: `gpt-maker-webhook`, `manage-agent-settings`,
  `manage-agent-training`, `manage-agent-intentions`, `manage-agent-channels`,
  `manage-agent-webhooks`, `manage-agent-idle-actions`, `manage-agent-transfer-rules`,
  `fetch-gpt-credits`, `agent-power-sync`, `analyze-message`, `send-chat-message`,
  `sync-chat-history`, `golive-tenant`, `provision-tenant`, `manage-solo-instances`.
- `gpt-maker-webhook/index.ts` (27.651 bytes): normaliza inbound, dedup por `gpt_message_id` +
  janela temporal (60s customer / 300s agent), ignora `role === 'tool'`, trata IDs técnicos
  (`@lid`, `@s.whatsapp.net`, `@c.us`, `@g.us`, `@broadcast`) como "sem nome", chama
  `resolveActiveOpportunity` e `normalizePhone` de `_shared/`.
- Outro webhook de canal: `solo-wpp-webhook` (dedup por `provider_message_id` + janela + echo outbound).
- `crm-webhook` (dedup por telefone).

### Estado de dados (Supabase produção, levantado 2026-09-10)
- Copilot SE: 2 `copilot_agents`, 0 `copilot_ingest_queue`, 1.220 `copilot_run_events`,
  0 `copilot_knowledge`, 0 `ai_decisions`.
- Migrations: `20260608000000_sprint6_copilot_config.sql`, `20260620000000_sprint64_w3_copilot_agents.sql`.
- Frontend Copilot: `src/pages/CopilotCockpit.tsx`, `src/services/copilot.ts` (client do FastAPI
  via `VITE_COPILOT_URL`, bearer token Supabase), componentes em `src/components/crm/copilot/`.

### Git
- Base: `origin/main` = `3737d59` (Merge PR #25 `claude/sprint11/copilot-inicio`). Repo ativo: PRs
  recentes #25, #9 (Sprint 10 migração Solo Energia).

## Perguntas a responder (com evidência do código)

1. **Inventário do que já existe.** Mapear o `python-agent`: quais peças da infra Agno já servem
   para um agente conversacional (storage de sessão, llm factory, cascade de agentes, knowledge/RAG,
   credits, metering, events, guards) e quais são específicas de CRM.
2. **O rebaixamento do GPT Maker.** O que exatamente o GPT Maker faz hoje que é "agente"
   (treinamento, intenções, transfer rules, idle actions, webhooks, analyze-message, send-chat-message)
   e o que sobrevive como "canal" (transporte WhatsApp/Instagram/webchat). Qual é a fronteira exata?
3. **Viabilidade.** É possível o `python-agent` (Agno) assumir a cognição do atendimento reusando
   o `INBOUND_AGENT_CONTRACT.md` e a infra de sessão/LLM existente? Sim/não com evidência.
4. **Arquitetura proposta.** Desenhar o fluxo completo: canal → webhook/edge function (transporte)
   → Python Agent (cognição, Agno) → decisão/resposta → retorno ao canal. Onde cada peça mora hoje
   e onde passaria a morar. Incluir o envelope inbound/outbound e a idempotência.
5. **Mapa de gaps.** O que não existe hoje e precisaria ser construído: adapter de canal,
   resolução de tenant, roteamento lead↔oportunidade, handoff humano, aprovações, telemetria,
   limite de créditos, multi-tenant, fila, retry/DLQ.
6. **Migração dos agentes existentes.** Como ficam os 2 `copilot_agents` e o Copilot de CRM após a
   mudança. Há conflito entre "agente de CRM" e "agente de atendimento" no mesmo runtime Agno?
7. **Prós, contras e trade-offs** de fazer isso vs. manter o GPT Maker como agent provider
   (custo, latência, controle, qualidade de resposta, lock-in, observabilidade, esforço).
8. **Ferramentas adicionais.** Se a infra Agno sozinha não bastar: o que seria necessário
   (ex.: fila/worker, orquestração, observabilidade, vector store, gateway de canais)? Nomear
   opções concretas com trade-offs — sem instalar nada.
9. **Riscos.** Quebra de atendimento em produção, perda de histórico, latência, custo de tokens,
   concorrência de sessões, LGPD/dados de cliente, rollback.
10. **Plano de fases.** Se viável: sequência incremental (fase 1 mínima → fase N), com critério de
    aceite por fase e uma estratégia de convivência/rollback com o GPT Maker.

## Constraints

- **READ-ONLY**: não modificar código, não rodar migração, não escrever em banco.
- Pode ler o worktree, o repo, `python-agent/` e o `docs/dev/projects/.../contexto/`.
- **NÃO citar credenciais reais** — referir como "env vars"/"secrets".
- **NÃO inventar** margem, preço, fórmula comercial, nem arquitetura da Solo que não esteja no código.
  Marcar como hipótese o que não tiver evidência.
- **PT-BR obrigatório** (nunca espanhol). Verificar antes de finalizar:
  `grep -lE 'Archivo|Fuente|decisión|teléfono|Migración|el agente|la respuesta' <artefatos>` deve voltar vazio.
- Escrever APENAS em: `docs/dev/projects/saas-salesengine-v1.0/SE-STUDY-003/verboo/` e o
  `README.md` em `docs/dev/projects/saas-salesengine-v1.0/SE-STUDY-003/`.
- Não fazer commit/push/PR — isso é do orquestrador.

## Acceptance

- [ ] `estudo-completo.md` responde às 10 perguntas com evidência (arquivo + trecho) do repo.
- [ ] `resumo-executivo.md` (1 página) com veredito claro, prós/contras/trade-offs e próximo passo.
- [ ] `README.md` com header Projeto | Tarefa | Agentes | Status | Artefatos | Pendências.
- [ ] Nenhuma mudança de código no worktree (`git status` só mostra os .md novos).
- [ ] Idioma PT-BR confirmado; zero credenciais reais citadas.

## Do not touch

- Código de produção, migrations, `main`/`master`, secrets, assets compartilhados, pastas de clientes.
- `supabase/functions/**` e `src/**` (somente leitura/análise).
