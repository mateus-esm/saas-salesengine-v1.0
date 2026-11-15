# Rev — Sales Engine

Máquina de receita para empresas brasileiras que vendem por conversa. O Rev junta, num app só, o
atendimento por WhatsApp (agente de IA e equipe), o CRM com pipeline e tabelas relacionais, o
Copilot que lê as conversas e mantém o CRM em dia, o outreach (sequências e follow-ups agendados),
a cobrança (Asaas) e o onboarding de novos clientes.

Produção: <https://solo-saas.netlify.app> · Plano e direção: [`Planning/Project Management/ROADMAP.md`](Planning/Project%20Management/ROADMAP.md)

## Arquitetura

| Camada | Onde | O que é |
| :-- | :-- | :-- |
| App web | `src/` | React 18 + Vite + TypeScript, Tailwind e shadcn/ui, TanStack Query. Publicado pelo Netlify a partir de `main`. |
| Banco e regras | `supabase/migrations/` | Postgres no Supabase. As regras de negócio são RPCs (`crm_*`, `admin_*`) com RLS por equipe; o app não escreve em tabela direto. |
| Funções | `supabase/functions/` | Edge functions em Deno: webhooks do WhatsApp (Solo API, GPT Maker), outreach, cobrança Asaas, relatórios, provisionamento. Código comum em `_shared/` (telefone sempre por `_shared/phone.ts`). |
| Copilot | `python-agent/` | Serviço FastAPI + Agno que analisa conversas e propõe/aplica ações no CRM por verbos. Ver [`python-agent/README.md`](python-agent/README.md) e [`python-agent/DEPLOY.md`](python-agent/DEPLOY.md). |
| Agendamentos | pg_cron | Fila de outreach, follow-ups (`crm_run_followups`), reciclo e recorrência (`crm_run_timers`), cobrança e relatórios. |

## Rodar localmente

Requisitos: Node 20, npm, [Deno](https://deno.com) (para as funções) e, para o Copilot, Python com [uv](https://docs.astral.sh/uv/).

```bash
cp .env.example .env        # preencha VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_COPILOT_URL
npm ci
npm run dev                 # http://localhost:8080
```

## Testes e checagens

```bash
npm test                                      # vitest (front)
npm run typecheck                             # tsc -b
npm run lint
npm run build
deno test -A supabase/functions/_shared/      # funções (o -A é necessário: alguns testes leem env)
bash scripts/sqltest.sh supabase/tests/<arquivo>.test.sql   # teste SQL contra o projeto, sempre em begin…rollback
cd python-agent && uv sync --dev && uv run pytest tests/ -q
```

O CI (`.github/workflows/ci.yml`) roda em todo PR: **Backend unit tests** (pytest do `python-agent`) e
**Frontend build gate** (`npm ci`, `tsc -b`, `npm run build`). Os dois são obrigatórios para entrar em `main`.

## Fluxo de trabalho

- `main` é protegida: nada entra por push direto. Todo trabalho vai num branch (`task/SE-<ÁREA>-<NNN>-<descrição>`, `fix/…`, `docs/…`), abre PR, passa nos dois checks e é mesclado com *merge commit*. O branch é apagado depois do merge.
- Cada sprint tem um plano em `Planning/Sprints/` (o que, por quê, tarefas e decisões); estudos e diagnósticos ficam em `docs/dev/projects/saas-salesengine-v1.0/SE-*/`.
- Texto de tela em pt-BR com acentos; cores só por token (`src/index.css`, contraste AA travado por teste).

## Deploy

| O quê | Como |
| :-- | :-- |
| Front | Automático: o Netlify publica cada merge em `main`. |
| Migration | Manual e nesta ordem: teste SQL em rollback (`scripts/sqltest.sh`), aplicar com `python supabase/scripts/run_sql.py <migration> --commit` e registrar a linha em `supabase_migrations.schema_migrations`. Não usar `supabase db push --include-all`. |
| Edge function | Manual: `npx -y supabase@2 functions deploy <nome> --use-api --project-ref egxzsivzqlqadoqpgfby` com `SUPABASE_ACCESS_TOKEN` no ambiente (a CLI v3 recusa o `supabase/config.toml` atual). |
| Copilot | Ver [`python-agent/DEPLOY.md`](python-agent/DEPLOY.md). |

Quando uma mudança mexe em banco e função juntos, a ordem é: migration → função → front.

## Onde está cada coisa

```
src/                      app web (pages/, components/, hooks/, lib/ com a lógica pura e testada)
supabase/migrations/      schema e RPCs, em ordem de data
supabase/functions/       edge functions (Deno) e _shared/
supabase/tests/           testes SQL (begin…rollback)
supabase/scripts/         scripts operacionais (run_sql.py, auditorias e reparos por cliente)
python-agent/             Copilot (FastAPI + Agno)
Planning/                 roadmap, sprints, arquitetura, benchmarks e operação por cliente (AppOps)
docs/                     runbooks de deploy, estudos e especificações
db/CONVENTIONS.md         convenções do banco
```

## Segredos

Nunca versionar `.env`, tokens ou dumps de dados de cliente. `tmp/` é ignorado e é o lugar de
rascunhos locais. Segredos de produção ficam nas variáveis do Supabase (Edge Functions) e no Vault.
