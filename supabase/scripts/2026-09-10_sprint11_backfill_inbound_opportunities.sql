-- 2026-09-10_sprint11_backfill_inbound_opportunities.sql
-- Devolve ao Kanban os leads de WhatsApp/webhook que nunca viraram negócio.
--
-- Rodar assim — DEPOIS de publicar as edge functions corrigidas (T7):
--   python supabase/scripts/run_sql.py supabase/scripts/2026-09-10_sprint11_backfill_inbound_opportunities.sql --rehearse
--   python supabase/scripts/run_sql.py supabase/scripts/2026-09-10_sprint11_backfill_inbound_opportunities.sql --commit
--
-- ============================================================================
-- O QUE ACONTECEU
-- ============================================================================
--
-- Em 23/06 (commit 876148c, Sprint 6.8) o stage_type foi reescrito para
-- português ('aberto'/'ganho'/'perdido'). A reversão para inglês consertou o
-- banco e o python-agent, mas não viu supabase/functions/_shared/opportunities.ts.
-- resolveActiveOpportunity continuou procurando a primeira etapa com
-- stage_type = 'aberto' — valor que nenhuma etapa tem — e desistia em silêncio:
--
--   "[opportunities] Pipeline default … não tem stage 'aberto'; pulando criação."
--
-- Todo lead que chegou pelo agente de WhatsApp (gpt-maker-webhook,
-- solo-wpp-webhook) ou pelo crm-webhook virou contato, mas nunca negócio. Não
-- aparece em Kanban nenhum. Medido em 10/09:
--
--   Casa Flow          174 leads   27/06 → 10/09
--   Cinemas Benficas   120 leads   01/07 → 09/09
--   Rema Digital         1 lead    04/07
--   Solo Energia         1 lead    10/09
--
-- ============================================================================
-- O QUE ESTE SCRIPT FAZ — E O QUE NÃO FAZ
-- ============================================================================
--
-- Cria, para cada um desses leads, o negócio que o helper deveria ter criado:
-- no pipeline padrão da equipe, na primeira etapa 'open', com created_at e
-- stage_entered_at = a chegada do lead (o funil e o "tempo na etapa" contam a
-- história verdadeira, não o dia do reparo).
--
-- O trigger que dispara o webhook de saída `lead_created` fica DESLIGADO dentro
-- desta transação. A Casa Flow tem um webhook `lead_created` ativo: sem isso, 174
-- eventos "lead novo" cairiam na automação dela de uma vez, sobre leads de até
-- dois meses atrás. Uma falha no meio desfaz tudo, inclusive o ALTER.
--
-- Não apaga nem altera nada existente. Cada negócio criado fica registrado em
-- sprint11_backfill_inbound_opps, então desfazer é um DELETE por essa lista.
-- Rodar de novo é seguro: só entra lead que continua sem negócio.
--
-- Leads anteriores a 23/06 sem negócio (existem, em outras equipes) têm outra
-- causa e ficam fora de propósito.

begin;

-- ============================================================================
-- 1. QUEM ENTRA
-- ============================================================================

create temp table s11_backfill on commit drop as
select l.id            as lead_id,
       l.equipe_id,
       l.created_at    as lead_created_at,
       e.default_pipeline_id as pipeline_id,
       (select s.id
          from public.pipeline_stages_v2 s
         where s.pipeline_id = e.default_pipeline_id
           and s.deleted_at is null
           and s.stage_type = 'open'
         order by s.position
         limit 1)      as stage_id
  from public.leads l
  join public.equipes e on e.id = l.equipe_id
 where l.deleted_at is null
   and l.created_at >= '2026-06-23'
   and coalesce(l.creation_source, '') in ('ai_agent', 'webhook', 'solo_api')
   and e.default_pipeline_id is not null
   and not exists (
     select 1 from public.opportunities o where o.lead_id = l.id and o.deleted_at is null
   );

delete from s11_backfill where stage_id is null;

do $$
declare v_n int;
begin
  select count(*) into v_n from s11_backfill;
  -- 296 em 10/09. Cresce enquanto a correção não estiver publicada; um número
  -- muito maior quer dizer que a regra pegou algo que não devia.
  assert v_n between 1 and 600, format('ABORT: %s leads elegiveis — esperado ~296', v_n);
end $$;

-- ============================================================================
-- 2. REGISTRO PARA DESFAZER
-- ============================================================================

create table if not exists public.sprint11_backfill_inbound_opps (
  opportunity_id uuid primary key,
  lead_id        uuid not null,
  equipe_id      uuid not null,
  created_at     timestamptz not null default now()
);

-- Tabela em `public` sem RLS ficaria legível pela API. Sem política = só o
-- service_role enxerga.
alter table public.sprint11_backfill_inbound_opps enable row level security;

comment on table public.sprint11_backfill_inbound_opps is
  'Sprint 11: negócios criados pelo backfill de 2026-09-10 (leads de WhatsApp/webhook que o bug do stage_type aberto deixou sem negócio). Desfazer = apagar esses ids de opportunities.';

-- ============================================================================
-- 3. CRIAR — com o webhook de saída desligado
-- ============================================================================

alter table public.opportunities disable trigger dispatch_pipeline_lead_created_webhooks;

with created as (
  insert into public.opportunities
    (equipe_id, lead_id, pipeline_id, stage_id, status, created_at, stage_entered_at)
  select b.equipe_id, b.lead_id, b.pipeline_id, b.stage_id, 'open', b.lead_created_at, b.lead_created_at
    from s11_backfill b
  returning id, lead_id, equipe_id
)
insert into public.sprint11_backfill_inbound_opps (opportunity_id, lead_id, equipe_id)
select id, lead_id, equipe_id from created;

alter table public.opportunities enable trigger dispatch_pipeline_lead_created_webhooks;

-- ============================================================================
-- 4. CONFERÊNCIA
-- ============================================================================

do $$
declare v_missing int; v_dup int; v_hooks int; v_trigger_on boolean;
begin
  select count(*) into v_missing
    from s11_backfill b
   where not exists (select 1 from public.opportunities o where o.lead_id = b.lead_id and o.deleted_at is null);
  assert v_missing = 0, format('ABORT: %s leads continuam sem negocio', v_missing);

  select count(*) into v_dup
    from (select o.lead_id from public.opportunities o
            join s11_backfill b on b.lead_id = o.lead_id
           where o.deleted_at is null and o.status = 'open'
           group by o.lead_id having count(*) > 1) d;
  assert v_dup = 0, format('ABORT: %s leads ficaram com dois negocios abertos', v_dup);

  -- Nenhum webhook de saída "lead_created" enfileirado por esta transação.
  select count(*) into v_hooks
    from public.webhook_logs w
   where w.event_type = 'lead_created'
     and w.created_at >= now() - interval '1 minute'
     and w.payload->'opportunity'->>'id' in (select opportunity_id::text from public.sprint11_backfill_inbound_opps);
  assert v_hooks = 0, format('ABORT: %s webhooks lead_created foram disparados', v_hooks);

  select t.tgenabled <> 'D' into v_trigger_on
    from pg_trigger t
   where t.tgrelid = 'public.opportunities'::regclass
     and t.tgname = 'dispatch_pipeline_lead_created_webhooks';
  assert v_trigger_on, 'ABORT: o trigger de webhook ficou desligado';

  raise notice 'Sprint 11 backfill: negocios criados e conferidos';
end $$;

commit;
