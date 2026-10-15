-- ============================ ORDEM DE DEPLOY ============================
--   1. ESTA migration (colunas + gatilho + índice condicional).
--   2. Funções, nesta ordem: send-chat-message, start-conversation (e as que
--      importam _shared/outreach/*: o dispatcher de cadências), gpt-maker-webhook,
--      solo-wpp-webhook, analyze-message.
--   Funções antes da migration quebram a busca de lead (select de name_locked).
--   Se houver par de conversas ativas duplicado a migration NÃO cria o índice:
--   resolva com supabase/scripts/2026-10-15_sesup1_merge_duplicate_conversation_309b4c09.sql
--   e reaplique o bloco 3.
-- =========================================================================
--
-- Sprint Suporte 1 · #9 — qualidade da ingestão do chat (3 sintomas).
--
-- (a) CONVERSA FATIADA. Dois webhooks (ou um webhook e um envio manual) que
--     chegam juntos olham o banco, não acham conversa e inserem as duas. Para o
--     lead já existia UNIQUE parcial + tratamento de 23505; para a conversa não.
--     Os escritores (gpt-maker-webhook, solo-wpp-webhook, send-chat-message,
--     start-conversation, outreach/persist) passam por
--     _shared/conversation-once.ts, que trata o 23505 reaproveitando a vencedora.
--       -> uq_conversations_active_lead_channel: uma conversa ATIVA por
--          (lead, canal). Arquivada e apagada ficam de fora (o webhook reabre
--          arquivada; apagada é histórico).
--
-- (b) NOME ERRADO. O pushName é o apelido que o PRÓPRIO contato escolheu e a IA
--     extrai nome de frase solta; ambos sobrescreviam o que o time digitou.
--       -> leads.name_locked. Edição manual liga o lock (a UI manda
--          name_locked=true; o gatilho abaixo garante o mesmo para qualquer
--          escritor com sessão de usuário). Webhook/IA nunca tocam nome travado
--          (_shared/lead-name-policy.ts).
--
-- (c) NÃO-LEAD VIRA LEAD. _shared/inbound-filter.ts classifica a mensagem; o que
--     não é lead guarda conversa e mensagem mas não vira negócio.
--       -> leads.needs_review / review_reason: o contato fica com lead_type
--          'contact' (já permitido pelo CHECK: lead|contact|spam) e a marca para
--          alguém olhar. Nada é apagado nem mesclado automaticamente.
--
-- ORDEM DE DEPLOY: esta migration ANTES das funções (os webhooks passam a
-- ler/gravar name_locked, needs_review e review_reason).
--
-- PAR DUPLICADO CONHECIDO (Solo, lead 309b4c09-…, canal whatsapp, duas conversas
-- active criadas com 4 s de diferença, 05/10): criar o índice falharia. Em vez de
-- decidir sozinha qual conversa sobrevive (há mensagens nas duas), a migration só
-- cria o índice quando NÃO há duplicata ativa e avisa (NOTICE) quando há. Passo
-- manual, depois de olhar o par com supabase/scripts/2026-10-15_sesup1_chat_diagnostics.sql
-- (mesclar com 2026-10-15_sesup1_merge_duplicate_conversation_309b4c09.sql), e então rodar de novo o bloco 3 (idempotente) ou esta migration inteira.
-- Enquanto o índice não existe a corrida continua possível, só rara.

begin;

-- 1. Colunas ---------------------------------------------------------------
alter table public.leads
  add column if not exists name_locked   boolean not null default false,
  add column if not exists needs_review  boolean not null default false,
  add column if not exists review_reason text;

comment on column public.leads.name_locked is
  'SE-SUP1-4: nome editado à mão. Webhook e IA nunca sobrescrevem.';
comment on column public.leads.needs_review is
  'SE-SUP1-4: o filtro de entrada duvidou que seja lead (serviço, código, sem identidade). Fica fora do pipeline até alguém revisar.';
comment on column public.leads.review_reason is
  'SE-SUP1-4: service_sender | short_code | alphanumeric_sender | automated_code.';

create index if not exists idx_leads_needs_review
  on public.leads (equipe_id) where needs_review and deleted_at is null;

-- 2. Edição manual trava o nome ---------------------------------------------
-- Escritores com sessão de usuário (auth.uid() não nulo) que mudam o nome
-- travam-no; service_role (webhooks, IA) não tem uid e não trava. Quem muda
-- name_locked na mesma instrução (destravar) manda no próprio valor.
create or replace function public.leads_lock_name_on_manual_edit()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.name is distinct from old.name
     and new.name_locked is not distinct from old.name_locked
     and auth.uid() is not null then
    new.name_locked := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_leads_lock_name_on_manual_edit on public.leads;
create trigger trg_leads_lock_name_on_manual_edit
  before update of name on public.leads
  for each row
  execute function public.leads_lock_name_on_manual_edit();

-- 3. Uma conversa ativa por (lead, canal) -----------------------------------
do $$
declare
  v_dups int;
begin
  select count(*) into v_dups from (
    select 1
      from public.conversations
     where status = 'active' and deleted_at is null
     group by lead_id, channel
    having count(*) > 1
  ) d;

  if v_dups > 0 then
    raise notice 'SE-SUP1-4: % par(es) de conversa ativa duplicada por (lead, canal) — uq_conversations_active_lead_channel NÃO criado. Resolva à mão (ver cabeçalho) e reaplique.', v_dups;
  else
    create unique index if not exists uq_conversations_active_lead_channel
      on public.conversations (lead_id, channel)
      where status = 'active' and deleted_at is null;
    comment on index public.uq_conversations_active_lead_channel is
      'SE-SUP1-4: uma conversa ativa por lead e canal; a perdedora da corrida reaproveita a vencedora (_shared/conversation-once.ts).';
  end if;
end $$;

commit;
