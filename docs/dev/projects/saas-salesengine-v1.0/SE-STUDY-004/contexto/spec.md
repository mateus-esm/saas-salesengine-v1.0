# SE-STUDY-004 — Task Contract

Projeto | Tarefa | Agent
saas-salesengine-v1.0 | SE-STUDY-004 | verboo

Project: saas-salesengine-v1.0
Agent: verboo
Branch: study/typesafe-jev-copilot
Risk: read-only study (zero code changes)

## Outcome

Estudo COMPLETO e READ-ONLY (sem mudanças de código) respondendo se é viável trocar/complementar os schemas Pydantic usados nas decisões e rotas do Copilot (python-agent + Agno) por Agno + TypeSafe Jev (modelo jev-latest, API SystemOne com Noul/Choice/Score) para melhorar latência e custo do Solo Copilot.

Entregáveis (todos em PT-BR):

1. `docs/dev/projects/saas-salesengine-v1.0/SE-STUDY-004/verboo/estudo-completo.md`
   Estudo técnico completo: viabilidade, arquitetura atual vs proposta, mapa de gaps, evidência de código, análise de latência e custo.
2. `docs/dev/projects/saas-salesengine-v1.0/SE-STUDY-004/verboo/resumo-executivo.md`
   Resumo executivo de 1 página: veredito, prós/contras/trade-offs, decisões necessárias, próximos passos.
3. `docs/dev/projects/saas-salesengine-v1.0/SE-STUDY-004/README.md`
   Header Projeto | Tarefa | Origem | Agentes | Status | Artefatos | Pendências.

## Pergunta central

Hoje o Copilot (python-agent FastAPI + Agno) usa LLMs (via `build_chat_model` + `OpenAIChat` apontado para router OpenAI-compatível) que retornam JSON validado por schemas Pydantic (`RouteDecision`, `IntentDecision`, `ActionPlan`, `PlannedAction` em `app/schemas.py`), via `parse_model_output` em `app/llm.py`. A pergunta é:

> É viável substituir/complementar as decisões e rotas hoje feitas por LLM + Pydantic (tower_doorman `classify_and_route`, floor_doorman `triage_intent` + `ActionPlan`, workflow `run_cascade`) por chamadas à API TypeSafe SystemOne (modelo `jev-latest`, questões Noul/Choice/Score) mantendo o Agno como orquestrador, para reduzir latência e custo do Solo Copilot?

Se sim: como seria? Se não/parcial: o que falta, e o que seria necessário?

Referência externa: https://docs.typesafe.ai/introduction/quickstart (API POST https://api.typesafe.ai/v1/systemone, SDK `typesafe-sdk`, tipos Noul/Choice/Score, resposta com choice/probabilities/confidence, score, noul + usage input/output tokens).

## Contexto (evidência real levantada 2026-09-17)

### python-agent — `/srv/solo-dev/repos/saas-salesengine-v1.0/python-agent`
- Stack: FastAPI + Agno + Postgres. `app/schemas.py` (134 linhas): `RouteDecision` (contact_type lead/contact/spam/other, pipeline_id, stage_id, confidence, extracted, reason), `IntentDecision` (relevant, automation_kind none/deterministic/agentic, skill, args, urgency, confidence, reason, intent_detected, intent_keyword), `ActionPlan` (relevant, actions: list[PlannedAction], automation_kind, urgency, confidence, reason), `PlannedAction` (verb, args, requires_confirmation, skill), `ActionResult`, blueprints de pipeline.
- `app/llm.py` (161 linhas): `build_chat_model` (OpenAIChat via LLM_BASE_URL/LLM_API_KEY, role_map clássico para routers), `structured_output_kwargs` (desligado quando há base_url custom — Verboo retorna 403 structured_output_not_enabled), `parse_model_output` (aceita model já validado, JSON dict/texto, senão ModelProviderError), `ModelProviderError` para falhas de provider.
- `app/cascade/tower_doorman.py`: `classify_and_route` — Agent Agno com system prompt PT-BR, pede APENAS JSON do schema RouteDecision, valida pipeline_id contra lista fornecida.
- `app/cascade/floor_doorman.py`: `triage_intent` (IntentDecision) + `ActionPlan` com verbos core_table (move_stage, set_status, set_field, set_contact_field, add_touchpoint, add_note, create_task, add_tag, trigger_webhook), keywords determinísticas de agendamento + few-shots.
- `app/cascade/workflow.py`: `run_cascade` — orquestra tower → floor → worker, com confidence gate (default 0.75), audit via record_decision.
- Base: `origin/main` = `3737d59` (Merge PR #25). Repo ativo.

### TypeSafe Jev (a avaliar)
- Endpoint: POST https://api.typesafe.ai/v1/systemone, auth Bearer TYPESAFE_API_KEY, body {state, model: jev-latest, questions: {nome: {type: noul|choice|score, instructions, criteria}}}.
- Resposta: answers com choice+probabilities+confidence, score+legend+confidence, noul (0..1), mais usage {input_tokens, output_tokens}.
- SDK Python: `pip install typesafe-sdk`, `TypeSafeClient().system_one(state, questions)`.
- Skill de agente disponível (Claude Code plugin / npx skills).

## Perguntas a responder (com evidência do código)

1. **Inventário do uso atual.** Mapear onde cada schema Pydantic é usado (tower, floor, enricher, worker, executor, approvals, routers) e qual o custo/latência atual (nº de chamadas LLM por pulso, tokens médios, modelos por papel DOORMAN/WORKER/SHAPER).
2. **O que o Jev faz bem.** Quais decisões atuais são classificação pura (contact_type, relevant, urgency, automation_kind, skill choice) e cabem em Noul/Choice/Score — com mapeamento campo-a-campo (ex.: RouteDecision.contact_type → Choice, IntentDecision.relevant → Noul, urgency → Noul/Choice, confidence → Score).
3. **O que o Jev NÃO faz.** Extração livre (`extracted` dict), `args` de verbos, `actions` ordenadas, `pipeline_id` dinâmico contra lista, reasons em PT-BR, guards de IDs — como ficaria? Híbrido LLM+Jev ou Jev+regras determinísticas?
4. **Viabilidade.** É possível manter o Agno como orquestrador e trocar só a camada de decisão/classificação por Jev? Sim/não/parcial com evidência.
5. **Arquitetura proposta.** Desenhar fluxo atual vs proposto (canal → tower → floor → worker; onde entra SystemOne; o que permanece em LLM; envelope de request/response; idempotência; fallback quando Jev falha).
6. **Latência.** Estimar latência atual (LLM generativo por pulso) vs Jev (classificador pequeno): nº de round-trips, paralelização de questions num call único, timeouts, impacto no Sync.
7. **Custo.** Comparar custo atual (tokens LLM por decisão × volume) vs Jev (input/output tokens por question + preço por chamada); incluir custo de manter LLM para extração/geração residual. Não inventar preços — usar tabelas públicas citadas ou marcar como hipótese a validar.
8. **Mapa de gaps.** O que não existe e precisaria ser construído: client Jev no python-agent, mapeamento schema→questions, validação de pipeline_id/skill, fallback LLM, telemetria/metering por decisão, testes, feature flag, multi-tenant.
9. **Prós, contras e trade-offs** (latência, custo, controle, qualidade, lock-in a mais um provider, observabilidade, esforço).
10. **Riscos.** Qualidade de classificação em PT-BR, dependência de API externa no hot path, timeout/fallback, LGPD (envio de conversa a terceiro), rollback.
11. **Plano de fases.** Se viável: sequência incremental (piloto shadow → 1 decisão → expansão), critério de aceite por fase, convivência/rollback com o caminho LLM+Pydantic.

## Constraints

- **READ-ONLY**: não modificar código, não rodar migração, não escrever em banco.
- Pode ler o worktree, o repo, `python-agent/` e o `docs/dev/projects/.../contexto/`.
- **NÃO citar credenciais reais** — referir como "env vars"/"secrets".
- **NÃO inventar** preços, latências, nem arquitetura que não esteja no código. Marcar como hipótese o que não tiver evidência.
- **PT-BR obrigatório** (nunca espanhol). Verificar antes de finalizar:
  `grep -lE 'Archivo|Fuente|decisión|teléfono|Migración|el agente|la respuesta' <artefatos>` deve voltar vazio.
- Escrever APENAS em: `docs/dev/projects/saas-salesengine-v1.0/SE-STUDY-004/verboo/` e o
  `README.md` em `docs/dev/projects/saas-salesengine-v1.0/SE-STUDY-004/`.
- Não fazer commit/push/PR — isso é do orquestrador.

## Acceptance

- [ ] `estudo-completo.md` responde às 11 perguntas com evidência (arquivo + trecho) do repo.
- [ ] `resumo-executivo.md` (1 página) com veredito claro, prós/contras/trade-offs e próximo passo.
- [ ] `README.md` com header Projeto | Tarefa | Agentes | Status | Artefatos | Pendências.
- [ ] Nenhuma mudança de código no worktree (`git status` só mostra os .md novos).
- [ ] Idioma PT-BR confirmado; zero credenciais reais citadas.

## Do not touch

- Código de produção, migrations, `main`/`master`, secrets, assets compartilhados, pastas de clientes.
- `supabase/functions/**` e `src/**` (somente leitura/análise).
