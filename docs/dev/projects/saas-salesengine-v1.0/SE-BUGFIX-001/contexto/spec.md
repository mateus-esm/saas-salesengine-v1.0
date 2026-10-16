# SE-BUGFIX-001 — Task Contract

Projeto | Tarefa | Agent | Status
---|---|---|---
saas-salesengine-v1.0 | SE-BUGFIX-001 | verboo | pending

## Outcome

Corrigir **3 bugs** reportados pelo dono, todos com causa raiz já diagnosticada pelo orquestrador contra produção. O harness deve **reconfirmar cada causa no repo/banco**, corrigir, e provar com teste.

### Bug 1 (GRAVE — vazamento entre tenants): mensagens de ticket aparecem para outras equipes

Relato do dono (verbatim): "As mensagens de ticket de suporte estão aparecendo também para por exemplo o time da Casa Flow, uma mensagem do Solo Energia apareceu lá, só quem pode ver essas mensagens é o próprio time e o Master admin no caso eu."

**Causa raiz encontrada (confirmar):** a policy `support_messages_read` usa um `EXISTS` que **não filtra por equipe**:
```
EXISTS (SELECT 1 FROM support_tickets t WHERE t.id = support_ticket_messages.ticket_id)
```
Como `support_tickets` tem RLS, o `EXISTS` deveria herdar o filtro — mas em Postgres o RLS da tabela referenciada **não é aplicado** dentro de uma policy quando a subconsulta roda com o mesmo usuário de forma que o planner inlineie; o efeito observado é que qualquer autenticado enxerga mensagens de qualquer ticket. A correção tem de ser **explícita**: a policy de mensagens deve exigir, ela mesma, que o ticket pertença à equipe do usuário OU que o usuário seja owner/super_admin. Não confie em RLS implícito de subconsulta.

**Atenção ao escopo do fix:** o dono quer que só a própria equipe e o **super_admin** vejam. O papel `owner` hoje também atravessa (policy `support_tickets_staff_read`). Decida com o dono o que fazer com `owner` — a leitura literal do pedido é "o próprio time e o Master admin (eu)". Registre a decisão em `decisions.md` e implemente o que o dono pedir; se ele não responder, mantenha `owner` como está hoje e diga isso explicitamente no resultado (não o remova por conta própria).

### Bug 2: aplicar créditos extras exige aplicar 2x

Relato: "Eu aplico créditos extras para por exemplo casa flow e não vai de primeira, preciso aplicar 2x."

**Evidência de produção (confirmar):** no `credit_ledger` da Casa Flow há **dois topups de 1000** em sequência no mesmo minuto, com `idempotency_key` diferente (`admin_whatsapp_20260927184416301_...` e `admin_whatsapp_20260927184556757_...`), e o segundo foi o que "pegou". Investigue a causa real: pode ser (a) o diálogo do Admin não recarregar o saldo após o grant, fazendo o operador repetir; (b) `recompute_credit_balance`/`credit_balance` não refletir na hora; (c) o `admin_grant_credits` retornar sucesso mas a UI mostrar valor velho. **Não presuma** — reproduza ou leia o código do diálogo (`src/components/admin/billing/*`, `Admin.tsx`) e diga qual é. A correção é no ponto que faz o operador achar que não funcionou.

### Bug 3: notificações de crédito não chegam

Relato: "não está aparecendo notificações e nem chegando a mensagem, deve chegar mensagem quando estiver próximo de acabar, quando acabar e dizer que ainda não parou e quando parar o agente. O agente pode continuar um pouco a mais após acabar os créditos e desconta quando retornar."

**Estado em produção (confirmar):** os tipos `credits.low` (80%), `credits.critical` (95%) e `credits.exhausted` **já existem** em `notification_types` (audience `tenant`; exhausted com canais in_app/email/whatsapp). Há 7 `credits.exhausted` e 2 `credits.low` registrados em `notifications` — então o tipo é emitido, mas o dono **não vê**. Descubra onde quebra: a entrega (`notification_deliveries`), a preferência/policy do tenant, o dispatcher, ou a tela. As notificações recentes que aparecem são `report.daily` e `support.ticket_created` — todas com `in_app` **sent**.

O que o dono quer que exista (e que pode não existir):
1. Aviso **próximo de acabar** (80% / 95%) — tipo existe, verificar emissão e entrega.
2. Aviso **quando acabar**, deixando claro que **o agente ainda não parou** (a tolerância pós-consumo).
3. Aviso **quando o agente realmente parar** — este tipo pode **não existir**; se não existir, crie (ex.: `credits.agent_paused`) e ligue no ponto onde o agente é pausado.
4. O agente pode continuar um pouco além do crédito e **descontar quando o crédito retornar** — verifique se essa tolerância já existe (`agents_to_resume`, `agent_paused_at`, `agent_paused_reason`, `reset_agent_power_error`, `charge_credits`) e reporte o comportamento real; se já existir, **não invente** — só garanta a mensagem correta.

## Context

Recon do orquestrador (reconfirme antes de decidir):
- `support_tickets` / `support_ticket_messages` criadas na migration `20260927000100_sesupport001_tickets`; 6 policies; GRANTs por coluna.
- `has_role(uid, role)` é `SECURITY DEFINER` e lê `user_roles`.
- Créditos: `credit_ledger` + `recompute_credit_balance` + `credit_balance` + `charge_credits` + `check_credits`; `admin_grant_credits` (só super_admin) grava no ledger e chama `recompute_credit_balance` + `reset_agent_power_error`.
- Notificação: RPC `notify(...)` grava em `notifications` e `notification_deliveries`; respeita `notification_policies` (por equipe+tipo) e `notification_preferences`; `auto=false` prepara sem despachar.
- Front: `src/pages/Admin.tsx` (aba Tickets + diálogo de billing), `src/components/admin/billing/*`, `src/pages/Suporte.tsx`, `src/components/support/*`.

## Excluído (NÃO TOCAR)

- Motor de outreach (`_shared/outreach/*`, `outreach`, `outreach-worker`), `send-chat-message`, `start-conversation`, `crm-webhook`, `gpt-maker-webhook`.
- Infra de artefatos (`artifact-callback`, `artifact-inbound`, `artifactActions`) e os workflows n8n.
- Não alterar as 8 abas existentes do Admin além do necessário para o bug 2.
- Sem segredos no código. Sem `main` direto. Sem migration destrutiva.

## Acceptance

- [ ] **Bug 1:** um usuário de uma equipe NÃO consegue ler ticket nem mensagem de outra equipe — provado por teste SQL de RLS com duas equipes e papéis distintos (não só escondido na UI). Super_admin continua vendo tudo.
- [ ] **Bug 2:** aplicar crédito extra funciona na primeira vez; o saldo exibido reflete o grant sem exigir segunda tentativa (prove com o ponto corrigido e o porquê).
- [ ] **Bug 3:** existem e **chegam** os avisos de (a) crédito próximo de acabar, (b) crédito acabado com o agente ainda rodando, (c) agente parado. Prove a entrega (linha em `notification_deliveries` com status) e não só a emissão.
- [ ] `npm run typecheck` OK, `npm run lint` sem novos errors, `npm run build` OK, `npm test` sem regressão vs baseline (registrar baseline ANTES).
- [ ] Rodar explicitamente o guard `src/__tests__/no-provider-branding.test.ts`.
- [ ] Idioma dos artefatos: pt-BR.
- [ ] Artefatos em `docs/dev/projects/saas-salesengine-v1.0/SE-BUGFIX-001/verboo/`.

## Risk

Alto no bug 1 (segurança/isolamento entre tenants) e médio no 3 (toca o caminho de pausa/retomada do agente). O bug 1 deve ser tratado como prioridade.

## Nota de deploy

O harness entrega código + artefatos no worktree; o orquestrador faz commit/push/PR e executa o deploy (migration + edge functions + Netlify) após auditoria.
