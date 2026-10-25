# SE-FIX-001 — Task Contract

Projeto | Tarefa | Agent
saas-salesengine-v1.0 | SE-FIX-001 | verboo

Project: saas-salesengine-v1.0
Agent: verboo
Branch: fix/pipelines-config-typing-lag
Risk: bug fix de UI (sem migração, sem mudança de schema)

## Outcome

Corrigir a lentidão de digitação na página **Pipelines → Config**, seção **Etapas**: escrever e apagar texto no campo de nome da etapa é muito lento (lag por caractere).

Causa provável já identificada na investigação (confirmar no worktree): em `src/components/crm/pipeline-settings/StagesEditor.tsx`, o `<Input>` do nome da etapa (`SortableStageRow`, ~linha 399) chama `onChange({ name: e.target.value })`, que sobe para `SortableStageRow` → `updateStage.mutate({ id: s.id, ...patch })` (~linha 191) — ou seja, **cada tecla dispara uma mutation de rede** (update no Supabase + invalidação de cache). O input é controlado pelo valor vindo do servidor, então o caractere só aparece depois do round-trip.

Fix esperado: desacoplar o estado local do input do valor persistido — manter estado local (ou debounce) para digitação responsiva e persistir em blur/debounce, sem disparar mutation por tecla. Preservar comportamento de salvar ao sair do campo.

## Entregáveis
1. Fix implementado em `src/components/crm/pipeline-settings/StagesEditor.tsx` (e arquivos auxiliares se necessário).
2. `docs/dev/projects/saas-salesengine-v1.0/SE-FIX-001/verboo/diagnostico.md` — causa raiz com `arquivo:linha`.
3. `docs/dev/projects/saas-salesengine-v1.0/SE-FIX-001/verboo/fix.md` — o que mudou, por quê, validação, riscos/rollback.
4. `docs/dev/projects/saas-salesengine-v1.0/SE-FIX-001/README.md` — header Projeto | Tarefa | Origem | Agentes | Status | Artefatos | Pendências.

## Acceptance
- [ ] Digitar no nome da etapa não dispara requisição por tecla.
- [ ] Valor continua sendo persistido (ao sair do campo / após debounce) e recarregado corretamente.
- [ ] Typecheck + lint + testes passam (registrar baseline sem mascarar).
- [ ] Diagnóstico com evidência `arquivo:linha`.
- [ ] PT-BR nos artefatos; zero credenciais reais.

## Do not touch
- Secrets, `main`/`master` direto, migrations destrutivas, `supabase/functions/**` (somente leitura), assets compartilhados, pastas de clientes.
