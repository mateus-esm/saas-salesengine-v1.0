-- SE-BUGFIX-001 · Bug 3 — notificações de crédito.
--
-- O QUE ESTAVA ERRADO
--
-- Os três avisos existentes (credits.low / credits.critical / credits.exhausted)
-- são emitidos pelo billing-cron a partir do SALDO. Nenhum deles é emitido no
-- momento em que o agente realmente para: a pausa acontece no job agentPower,
-- que roda depois, e ali o aviso saía com o tipo `credits.exhausted` — o mesmo
-- tipo do aviso de saldo. Consequência: o dono não tinha como distinguir
-- "acabou o crédito" de "o agente parou", e o texto de credits.exhausted
-- ("O agente parou de responder automaticamente") afirmava uma pausa que ainda
-- não tinha acontecido.
--
-- A CORREÇÃO
--
--   * credits.low      (80%)  — aviso de que está ACABANDO.  [já existia]
--   * credits.critical (95%)  — aviso de que está ACABANDO.  [já existia]
--   * credits.exhausted       — aviso de que ACABOU, deixando claro que o
--                               agente AINDA NÃO parou (tolerância pós-crédito).
--                               Texto corrigido no billing-cron.
--   * credits.agent_paused    — NOVO. Emitido no ponto de pausa
--                               (_shared/agent-power.ts), quando o provedor
--                               confirmou o desligamento.
--
-- TOLERÂNCIA PÓS-CRÉDITO — JÁ EXISTE, NÃO FOI INVENTADA
--
--   `agents_to_pause` só retorna o time quando `agent_paused_at is null`, e
--   `agents_to_resume` exige `credit_balance(whatsapp) > 0`. O agente continua
--   respondendo enquanto o saldo não é checado de novo (o cron é diário) e é
--   religado automaticamente quando o crédito volta — é exatamente o
--   "continua um pouco e desconta quando o crédito voltar". Nada disso foi
--   alterado aqui; só a mensagem passou a dizer a verdade sobre esse estado.
--
-- Idempotente: `on conflict (type) do nothing` preserva qualquer edição feita
-- no painel admin depois desta migration.

insert into public.notification_types
  (type, default_severity, default_channels, audience, description, purpose, variables)
values (
  'credits.agent_paused',
  'critical',
  array['in_app', 'email', 'whatsapp'],
  'tenant',
  'O agente de atendimento realmente parou por falta de crédito',
  'operacao',
  array['equipe_id']
)
on conflict (type) do nothing;