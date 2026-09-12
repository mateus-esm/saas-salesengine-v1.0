-- Sprint 11 · Onda 5 · T56 — legado: a origem das bases antigas (decisão 38).
--
-- Um toque por lead que ainda não tem nenhum, na data de criação do lead, com o
-- carimbo deduzido da origem antiga (`leads.origem`, ou `source`):
--
--   Tráfego Pago / Social Pago     → social pago, sem plataforma (campanha não recuperável)
--   Google ADS                     → busca paga · google
--   Meta ADS…                      → social pago · meta
--   Landing Page… / Site           → direto/marca · site, com o nome da página
--   Indicação                      → indicação
--   Mensagem Whatsapp / Base Ativa → mensagem ativa (cold message)
--   Prospecção Ativa               → ligação ativa (cold call)
--   Database / Jestor / Solo App   → importação
--   IA                             → entrada do agente, categoria em branco
--
-- A ENTRADA: o webhook de onde o lead veio, quando o log de atividade guarda o
-- webhook (`lead_activities` 'webhook_inbound' → config_id); senão o agente (IA),
-- a importação/API (webhook sem rastro), o manual (criado à mão) ou a importação.
--
-- O QUE MUDA NO LEAD: first_touch_id, entry_id, origin_platform (se vazia) e a
-- categoria só onde está vazia — a categoria escrita (à mão ou pela classificação
-- da Sprint 9) nunca é trocada, e ela vence o mapa no próprio toque. Nada muda em
-- origin_detail, origem, source, e o `updated_at` fica como estava (o gatilho é
-- desligado só dentro desta transação).
--
-- IDEMPOTENTE: só lead sem toque nenhum. Rodar de novo não faz nada.
-- ORDEM: depois das migrations 20260913000100…0400. Produção só com aprovação do
-- founder (ponto de parada da T57) e depois do ensaio
-- supabase/tests/sprint11_w5_backfill.test.sql passar.

-- 1. O plano: cada lead sem toque, a origem antiga e a entrada.
drop table if exists pg_temp._t56_plan;
create temp table _t56_plan as
select l.id                         as lead_id,
       l.equipe_id,
       l.created_at,
       nullif(btrim(coalesce(l.origem, l.source)), '') as legacy,
       l.creation_source,
       hook.entry_id                as hook_entry,
       case
         when hook.entry_id is not null then 'webhook'
         when l.creation_source = 'ai_agent' or coalesce(l.origem, l.source) = 'IA' then 'agent'
         -- Webhook sem rastro do webhook: a porta da API. (Antes da T50 o crm-webhook
         -- gravava esses leads como 'manual'.)
         when coalesce(l.origem, l.source) in ('webhook', 'webhook_inbound') then 'import'
         when l.creation_source = 'manual' then 'manual'
         else 'import'
       end                          as kind
  from public.leads l
  left join lateral (
    select e.id as entry_id
      from public.lead_activities a
      join public.crm_entries e on e.webhook_config_id::text = a.metadata->>'config_id'
     where a.lead_id = l.id and a.tipo = 'webhook_inbound'
     order by a.created_at
     limit 1
  ) hook on true
 where l.deleted_at is null
   and l.first_touch_id is null
   and not exists (select 1 from public.lead_touches t where t.lead_id = l.id);

-- 2. As entradas singulares que o plano usa (criadas se faltarem).
drop table if exists pg_temp._t56_entries;
create temp table _t56_entries as
select p.equipe_id, p.kind, public._crm_entry_for(p.equipe_id, p.kind) as entry_id
  from (select distinct equipe_id, kind from _t56_plan where kind <> 'webhook') p;

-- 3. O toque de cada lead, e o lead apontando para ele.
alter table public.leads disable trigger update_leads_updated_at;

with stamped as (
  select p.lead_id,
         p.equipe_id,
         p.created_at,
         coalesce(p.hook_entry, en.entry_id) as entry_id,
         coalesce(l.origin_category,
                  case
                    when p.legacy in ('Tráfego Pago', 'Social Pago') then 'paid_social'
                    when p.legacy = 'Google ADS' then 'paid_search'
                    when p.legacy like 'Meta ADS%' then 'paid_social'
                    when p.legacy like 'Landing Page%' or p.legacy = 'Site' then 'direct_brand'
                    when p.legacy = 'Indicação' then 'referral'
                    when p.legacy in ('Mensagem Whatsapp', 'Base Ativa') then 'outbound_message'
                    when p.legacy = 'Prospecção Ativa' then 'outbound_phone'
                    when p.legacy in ('Database', 'Jestor', 'Solo App') then 'api_import'
                    when p.legacy = 'organic_search' then 'organic_search'
                  end,
                  he.origin_category) as origin_category,
         case
           when p.legacy = 'Google ADS' then 'google'
           when p.legacy like 'Meta ADS%' then 'meta'
           when p.legacy like 'Landing Page%' or p.legacy = 'Site' then 'site'
           else he.platform
         end as platform,
         case when p.legacy like 'Landing Page%' or p.legacy = 'Site' then p.legacy end as landing_page,
         jsonb_build_object('backfill', 'sprint11_t56', 'legacy_origin', p.legacy,
                            'creation_source', p.creation_source) as raw
    from _t56_plan p
    join public.leads l on l.id = p.lead_id
    left join _t56_entries en on en.equipe_id = p.equipe_id and en.kind = p.kind
    left join public.crm_entries he on he.id = p.hook_entry
),
ins as (
  insert into public.lead_touches (equipe_id, lead_id, entry_id, occurred_at, origin_category, platform, landing_page, raw)
  select equipe_id, lead_id, entry_id, created_at, origin_category, platform, landing_page, raw
    from stamped
  returning id, lead_id, entry_id, origin_category, platform
)
update public.leads l
   set first_touch_id  = ins.id,
       entry_id        = ins.entry_id,
       origin_platform = coalesce(l.origin_platform, ins.platform),
       origin_category = coalesce(l.origin_category, ins.origin_category)
  from ins
 where l.id = ins.lead_id;

alter table public.leads enable trigger update_leads_updated_at;
