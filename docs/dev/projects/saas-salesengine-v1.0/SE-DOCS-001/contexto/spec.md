# SE-DOCS-001 — Task Contract

Projeto | Tarefa | Agent | Status
---|---|---|---
saas-salesengine-v1.0 | SE-DOCS-001 | verboo | pending

## Outcome

Um **Hub de Tutoriais & Help Center nativo dentro do Rev**, v1, publicado em produção, que ensine o cliente final a operar a ferramenta sem depender de suporte humano.

O dono pediu (visão verbatim): "fazer o estudo completo da documentação do software para estruturar uma área de tutoriais onde os clientes aprendam a operar a ferramenta. O Verboo Dev deve planejar e subir a v1 disso direto em produção, com um guia prático de uso de cada parte do sistema, para irmos aprimorando depois."

Quatro entregáveis:
1. **Estrutura & IA** — hierarquia modular de base de conhecimento mapeada aos módulos centrais do Rev.
2. **Conteúdo v1** — guias passo a passo de como usar cada módulo central.
3. **Integração UI/UX** — gaveta de ajuda, modal ou rota `/docs` acessível dentro do app.
4. **Extensibilidade** — os artigos precisam ser **versionáveis e atualizáveis sem novo deploy** (zero downtime).

## Context

O mapa que o dono citou — **Cockpit, Pipelines, Forms, Tables, Automations** — NÃO corresponde 1:1 aos nomes do menu. Reconcilie com o menu real e diga o mapeamento no artefato.

Reconhecimento já feito pelo orquestrador (o harness deve reconfirmar no repo antes de decidir):

- **Já existe** `src/pages/Tutorial.tsx` (~259 linhas): página estática com 3 cards de "quick start" + um `<Accordion>` de FAQ. Rota `/tutorial` em `src/App.tsx`. Entrada no menu em `src/components/AppSidebar.tsx` (~L41): `{ title: "Tutorial", url: "/tutorial", icon: BookOpen, external: false }` — **sem** `requiredRole`/`permissionKey`, ou seja, visível para todos os usuários.
- **Já existe** `src/pages/Suporte.tsx` (~93 linhas), rota `/suporte`, com `PageRouteGuard permissionKey="suporte"`.
- **Menu real** (`src/components/AppSidebar.tsx`, ~L29-41): Início `/home`; Dashboard `/dashboard`; Chat `/chat`; CRM `/crm`; Copiloto `/copiloto` (hoje redireciona para `/home`); AI Studio `/ai-studio` (admin + `permissionKey: 'ai_studio'`); Webhooks `/webhooks` (admin + `webhooks`); Outreach `/outreach` (admin + `webhooks`); Billing `/billing` (admin + `billing`); Toolkit `/toolkit` (badge "Em Breve"); Clube Solo `/clube` (badge "Em Breve"); Suporte `/suporte` (admin + `suporte`); Tutorial `/tutorial`.
- **Stack**: React + Vite + TypeScript, Tailwind + shadcn/ui, Supabase (Postgres + RLS + edge functions Deno), deploy Netlify no push da `main`. Rotas protegidas por `ProtectedRoute` + `PageRouteGuard`.
- **Infra existente relevante**: tabelas `custom_tables`/`custom_table_records` com `table_schema jsonb` e `data jsonb`; padrão de edge functions Deno em `supabase/functions/`; `equipes`/`user_roles` para multi-tenant e papéis; `PageRouteGuard` para permissão de rota.

Ponto de decisão de arquitetura que o harness DEVE resolver e justificar: o requisito "atualizável sem deploy" implica que o conteúdo não pode viver só em código-fonte compilado. O repo já tem Supabase como backend. Avalie as opções reais (artigos em banco com RLS vs. conteúdo remoto vs. outra) e escolha — mas a escolha precisa satisfazer o requisito, não contorná-lo.

## Excluído (NÃO TOCAR)

- Motor de outreach (`supabase/functions/_shared/outreach/*`, `outreach`, `outreach-worker`), `send-chat-message`, `start-conversation`, `crm-webhook`: sem mudança.
- Lógica de Chat, Billing, CRM além do necessário para linkar a ajuda.
- Sem migration destrutiva; sem alterar contrato do provider.
- Nada de `main` direto.
- Não alterar `requiredRole`/`permissionKey` de módulos existentes.

## Acceptance

- [ ] Rota dedicada `/docs` (ou gaveta/modal de ajuda equivalente) acessível ao usuário final, integrada ao app.
- [ ] **Todo módulo primário de navegação tem um guia passo a passo correspondente** (lista exaustiva derivada do menu real, com o mapeamento explícito).
- [ ] Artigos **atualizáveis/versionáveis sem novo deploy** — provado, não afirmado (mostrar o mecanismo e como um artigo muda sem rebuild).
- [ ] Estrutura de IA modular e navegável (hierarquia, busca ou índice).
- [ ] `npm run typecheck` OK, `npm run lint` sem novos errors, `npm run build` OK, `npm test` sem regressão vs baseline (registrar baseline ANTES).
- [ ] Rodar explicitamente o guard `src/__tests__/no-provider-branding.test.ts` — ele varre todo `.ts`/`.tsx` em `src/` e falha em qualquer arquivo novo que cite a marca do provider; reescrever a referência (nunca apagar a citação para "passar").
- [ ] Idioma dos artefatos: pt-BR.
- [ ] Artefatos em `docs/dev/projects/saas-salesengine-v1.0/SE-DOCS-001/verboo/`.

## Risk

Baixo-médio — front + conteúdo; pode introduzir uma tabela nova (migration aditiva). Sem tocar produção existente.

## Nota de deploy

O dono autorizou explicitamente subir a v1 em produção. O harness entrega código + artefatos no worktree; o orquestrador faz commit/push/PR, e o deploy (merge + migration + Netlify) é executado pelo orquestrador após auditoria.
