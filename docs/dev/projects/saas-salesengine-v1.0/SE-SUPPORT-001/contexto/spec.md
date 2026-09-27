# SE-SUPPORT-001 — Task Contract

Projeto | Tarefa | Agent | Status
---|---|---|---
saas-salesengine-v1.0 | SE-SUPPORT-001 | codex | pending

## Outcome

Interligar a tela **Suporte** (cliente) com o **painel Admin** (equipe Solo), para que o admin veja os tickets de suporte abertos pelos clientes, responda e acompanhe o andamento.

Visão do dono (verbatim): "I need an interconnection between the support and the admin panel, where I can see the support tickets of the clients."

Duas pontas, uma fonte de verdade:
1. **Lado cliente (`/suporte`)** — o cliente abre um ticket (assunto + descrição) e acompanha os seus próprios tickets e as respostas.
2. **Lado admin (`/admin`)** — uma aba nova onde o admin vê os tickets de **todos os tenants**, filtra, abre, responde e muda o status.

## Context

Reconhecimento já feito pelo orquestrador (o harness deve reconfirmar no repo antes de decidir):

- **Hoje NÃO existe ticket.** `src/pages/Suporte.tsx` (~93 linhas) é estático: botão WhatsApp (`wa.me`), botão e-mail (`mailto:suporte@soloventures.com.br`) e um card "Informações da Equipe" (nome, nicho, créditos). Não há criação nem listagem de ticket.
- **`src/pages/Admin.tsx`** (~1100+ linhas) tem abas em `<Tabs>`: `nichos`, `equipes`, `usuarios`, `solo-instances`, `propostas`, `onboarding`, `faturamento`, `notificacoes`. **Nenhuma de suporte.** O padrão de aba é `<TabsTrigger value="x">` + `<TabsContent value="x">`, e as abas "pesadas" são componentes próprios em `src/components/admin/<área>/` (ex.: `src/components/admin/notifications/NotificationsTab.tsx`). Siga esse padrão — não infle o `Admin.tsx`.
- **Role/permissão:** `src/hooks/useRole.ts` define `user | admin | owner | super_admin` com hierarquia (`super_admin: 4`); `isOwner()` = `owner || super_admin`; `isAdmin()` inclui os três. `Admin.tsx` já usa `useRole()` e `isSuperAdmin()`.
- **Multi-tenant:** `equipes` é o tenant; `profiles.equipe_id` liga usuário → equipe; RLS por equipe é o padrão do repo. `src/contexts/TenantContext.tsx` resolve o tenant pelo hostname (para branding), **não** substitui a checagem de equipe do usuário logado.
- **Infra de notificação existente e reaproveitável:** `public.notification_types` tem `audience in ('tenant','founder','both')` e já existe o propósito **`suporte`** documentado ("Tickets e respostas de atendimento"). Há RPC `public.notify(p_equipe_id, p_type, p_title, p_body, p_action_url, p_data, p_dedup_key, p_user_id, p_severity)` e a aba admin de notificações (`NotificationsTab.tsx`) mostra a matriz. **Avalie usar isso** em vez de inventar um segundo canal de aviso — mas um tipo de notificação novo precisa entrar em `notification_types` (o `notify` lança `unknown_notification_type` para tipo inexistente).
- **Padrões do repo:** React + Vite + TS, Tailwind + shadcn/ui, Supabase (Postgres + RLS + edge functions Deno), react-query para dados, deploy Netlify no push da `main`. Migrations em `supabase/migrations/` com timestamp; o CI roda `tsc -b` e `npm run build` (não roda vitest), então erro de tipo quebra o merge.

Decisões que o harness DEVE resolver e justificar no artefato (não invente schema sem dizer por quê):
- Modelo de dados do ticket: quais colunas, e como o histórico de mensagens é guardado (uma tabela de ticket + uma de mensagens? campo jsonb?).
- Quem pode ler o quê: a policy de RLS que deixa o cliente ver **só** os tickets da própria equipe, e o admin ver **todos**. Deixe explícito como o admin atravessa o escopo de equipe sem abrir buraco (não use `service_role` no cliente).
- Como o admin é notificado de ticket novo (reaproveitar `notify` com um tipo novo vs. só badge na aba).

## Excluído (NÃO TOCAR)

- Motor de outreach (`supabase/functions/_shared/outreach/*`, `outreach`, `outreach-worker`), `send-chat-message`, `start-conversation`, `crm-webhook`, `gpt-maker-webhook`: sem mudança.
- Infra de artefatos (`artifact-callback`, `artifact-inbound`, `artifactActions`): sem mudança.
- Abas existentes do Admin (`nichos`, `equipes`, `usuarios`, `solo-instances`, `propostas`, `onboarding`, `faturamento`, `notificacoes`): não alterar comportamento.
- Não remover o WhatsApp/e-mail atuais da tela Suporte — eles continuam; o ticket é um caminho adicional.
- Sem segredos no código. Sem `main` direto. Sem migration destrutiva.

## Acceptance

- [ ] Cliente abre ticket pela tela `/suporte` e vê a lista dos **seus** tickets com status e respostas.
- [ ] Cliente **não** consegue ver ticket de outra equipe (prove: RLS/policy, não só esconder na UI).
- [ ] Admin (owner/super_admin) tem aba própria no `/admin` listando os tickets de **todos** os tenants, com filtro por status e por equipe.
- [ ] Admin responde um ticket e muda o status; a resposta aparece para o cliente.
- [ ] Notificação de ticket novo chega ao admin (reaproveitando `notify` ou justificando por que não).
- [ ] `npm run typecheck` OK, `npm run lint` sem novos errors, `npm run build` OK, `npm test` sem regressão vs baseline (registrar baseline ANTES).
- [ ] Rodar explicitamente o guard `src/__tests__/no-provider-branding.test.ts` (varre todo `.ts`/`.tsx` em `src/` e falha em arquivo novo que cite a marca do provider — reescreva a referência, nunca apague a citação para "passar").
- [ ] Idioma dos artefatos: pt-BR.
- [ ] Artefatos em `docs/dev/projects/saas-salesengine-v1.0/SE-SUPPORT-001/codex/`.

## Risk

Médio — tabela nova + RLS multi-tenant + tela de admin que atravessa tenants. O ponto sensível é o isolamento entre equipes.

## Nota de deploy

O harness entrega código + artefatos no worktree; o orquestrador faz commit/push/PR e executa o deploy (migration + Netlify) após auditoria.
