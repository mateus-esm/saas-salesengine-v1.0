-- Sprint 11 · Onda 5 · T56 — ensaio do legado sobre os dados de verdade (rollback).
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w5_backfill.test.sql
--
-- Aplica as migrations da onda e o script do legado dentro de uma transação que
-- volta atrás, e confere: todo lead sem toque ganhou exatamente um, na data de
-- criação, por uma entrada da própria equipe; a categoria escrita nunca foi
-- trocada; origin_detail e updated_at ficaram como estavam; IA → agente sem
-- categoria; webhook com rastro → a entrada do próprio webhook; o mapa da decisão
-- 38 (Google, Tráfego Pago, landing page); rodar de novo não faz nada; o gatilho
-- do updated_at volta ligado. Não grava nada: é o ensaio que a produção exige.

begin;

-- @include supabase/migrations/20260913000100_sprint11_w5_attribution.sql
-- @include supabase/migrations/20260913000200_sprint11_w5_campaigns.sql
-- @include supabase/migrations/20260913000300_sprint11_w5_attribution_metrics.sql
-- @include supabase/migrations/20260913000400_sprint11_w5_line_natures.sql

create temp table _t56_before as
select l.id, l.equipe_id, l.created_at, l.updated_at, l.origin_category, l.origin_detail,
       nullif(btrim(coalesce(l.origem, l.source)), '') as legacy, l.creation_source
  from public.leads l
 where l.deleted_at is null and l.first_touch_id is null
   and not exists (select 1 from public.lead_touches t where t.lead_id = l.id);

create temp table _t56_hook as
select distinct on (a.lead_id) a.lead_id, e.id as entry_id
  from public.lead_activities a
  join public.crm_entries e on e.webhook_config_id::text = a.metadata->>'config_id'
 where a.tipo = 'webhook_inbound' and a.lead_id in (select id from _t56_before)
 order by a.lead_id, a.created_at;

create temp table _t56_entries_before as select id from public.crm_entries;

-- @include supabase/scripts/2026-09-13_sprint11_backfill_touches.sql

do $$
declare n_before int := (select count(*) from _t56_before);
begin
  assert n_before > 0, 'T56 FAIL: o ensaio precisa de lead sem toque para provar alguma coisa';

  -- 1. Um toque, exatamente, e o lead apontando para ele.
  assert not exists (select 1 from _t56_before b join public.leads l on l.id = b.id
                      where l.first_touch_id is null
                         or (select count(*) from public.lead_touches t where t.lead_id = b.id) <> 1
                         or not exists (select 1 from public.lead_touches t where t.id = l.first_touch_id and t.lead_id = b.id)),
    'T56 FAIL: lead sem exatamente um toque apontado pelo first_touch_id';

  -- 2. Na data de criação, por uma entrada da própria equipe.
  assert not exists (select 1 from _t56_before b
                       join public.lead_touches t on t.lead_id = b.id
                       left join public.crm_entries e on e.id = t.entry_id
                      where t.occurred_at is distinct from b.created_at
                         or e.id is null or e.equipe_id <> b.equipe_id or t.equipe_id <> b.equipe_id),
    'T56 FAIL: toque fora da data de criacao, sem entrada ou com entrada de outra equipe';

  -- 3. A categoria escrita nunca é trocada — e vence o mapa no toque.
  assert not exists (select 1 from _t56_before b join public.leads l on l.id = b.id
                      where b.origin_category is not null and l.origin_category is distinct from b.origin_category),
    'T56 FAIL: categoria escrita trocada no lead';
  assert not exists (select 1 from _t56_before b join public.lead_touches t on t.lead_id = b.id
                      where b.origin_category is not null and t.origin_category is distinct from b.origin_category),
    'T56 FAIL: o toque contradiz a categoria escrita';

  -- 4. origin_detail e updated_at intactos.
  assert not exists (select 1 from _t56_before b join public.leads l on l.id = b.id
                      where l.updated_at is distinct from b.updated_at or l.origin_detail is distinct from b.origin_detail),
    'T56 FAIL: updated_at ou origin_detail mudaram';

  -- 5. IA → a entrada do agente, sem categoria inventada.
  assert not exists (select 1 from _t56_before b
                       join public.lead_touches t on t.lead_id = b.id
                       join public.crm_entries e on e.id = t.entry_id
                      where (b.legacy = 'IA' or b.creation_source = 'ai_agent')
                        and not exists (select 1 from _t56_hook h where h.lead_id = b.id)
                        and (e.kind <> 'agent' or (b.origin_category is null and t.origin_category is not null))),
    'T56 FAIL: lead da IA fora da entrada do agente, ou com categoria inventada';

  -- 6. Webhook com rastro → a entrada do próprio webhook.
  assert not exists (select 1 from _t56_hook h join public.lead_touches t on t.lead_id = h.lead_id
                      where t.entry_id <> h.entry_id),
    'T56 FAIL: lead de webhook fora da entrada do webhook';

  -- 7. O mapa da decisão 38.
  assert not exists (select 1 from _t56_before b join public.lead_touches t on t.lead_id = b.id
                      where b.legacy = 'Google ADS' and (t.platform is distinct from 'google'
                            or (b.origin_category is null and t.origin_category <> 'paid_search'))),
    'T56 FAIL: Google ADS';
  assert not exists (select 1 from _t56_before b join public.lead_touches t on t.lead_id = b.id
                      where b.legacy = 'Tráfego Pago' and (t.platform is not null
                            or (b.origin_category is null and t.origin_category <> 'paid_social'))),
    'T56 FAIL: Trafego Pago (social pago, sem plataforma)';
  assert not exists (select 1 from _t56_before b join public.lead_touches t on t.lead_id = b.id
                      where (b.legacy like 'Landing Page%' or b.legacy = 'Site')
                        and (t.platform is distinct from 'site' or t.landing_page is distinct from b.legacy)),
    'T56 FAIL: landing page com o nome da pagina';
  assert not exists (select 1 from _t56_before b join public.lead_touches t on t.lead_id = b.id
                      where t.raw->>'backfill' is distinct from 'sprint11_t56'
                         or t.raw->>'legacy_origin' is distinct from b.legacy),
    'T56 FAIL: o toque nao diz que veio do legado';

  -- 8. Entradas novas: só as singulares (agente, manual, importação), no máximo uma de cada por equipe.
  assert not exists (select 1 from public.crm_entries e
                      where e.id not in (select id from _t56_entries_before) and e.kind not in ('agent', 'manual', 'import')),
    'T56 FAIL: o legado criou entrada que nao e singular';
end $$;

-- 9. Rodar de novo não faz nada.
create temp table _t56_after as select (select count(*) from public.lead_touches) as touches,
                                       (select count(*) from public.crm_entries)  as entries;

-- @include supabase/scripts/2026-09-13_sprint11_backfill_touches.sql

do $$
begin
  assert (select count(*) from public.lead_touches) = (select touches from _t56_after)
     and (select count(*) from public.crm_entries) = (select entries from _t56_after),
    'T56 FAIL: a segunda rodada gravou de novo';
  assert (select t.tgenabled from pg_trigger t
           where t.tgrelid = 'public.leads'::regclass and t.tgname = 'update_leads_updated_at') = 'O',
    'T56 FAIL: o gatilho do updated_at ficou desligado';
end $$;

rollback;
select 'PASS' as result;
