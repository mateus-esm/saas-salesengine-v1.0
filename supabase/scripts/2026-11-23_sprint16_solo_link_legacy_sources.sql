-- Sprint 16 · ajuste 3 — Solo Energia: ligar o histórico sem campanha a campanhas/iniciativas.
-- Rodado UMA vez em 2026-11-23. O histórico importado (Jestor) só tem o rótulo da origem
-- antiga; cada rótulo vira (ou cai em) uma campanha do canal certo. Nada é atribuído a um
-- anúncio específico — o retorno desses leads é medido por CANAL (Resultados › Por canal).
--
-- Desfazer:
--   update public.leads l set campaign_id = null from public._bk_s16_legacy_links b where b.lead_id = l.id;
--   update public.lead_touches t set campaign_id = null from public._bk_s16_legacy_links b
--    where b.touch_id = t.id and b.touch_was_null;
--   update public.crm_campaigns set status = 'archived' where equipe_id = '939d7dd8-592c-4fda-946e-3568f2909904'
--    and exists (select 1 from unnest(match_keys) k where k like 'legado:%');

create table if not exists public._bk_s16_legacy_links (
  lead_id uuid primary key, campaign_id uuid, touch_id uuid, touch_was_null boolean, linked_at timestamptz default now());
alter table public._bk_s16_legacy_links enable row level security;
revoke all on public._bk_s16_legacy_links from anon, authenticated;

do $$
declare
  v_eq constant uuid := '939d7dd8-592c-4fda-946e-3568f2909904';
  m record;
  v_camp uuid;
begin
  for m in
    select * from (values
      -- ordem importa: o primeiro que casa leva o lead
      (1,  '[LEADS] [LP]',                          null,               null,     'paid_social',      'Landing Page%'),
      (2,  'Meta Ads · histórico (sem anúncio)',    'paid_social',      'meta',   'paid_social',      '%'),
      (3,  'Outbound · Mensagem WhatsApp',          'outbound_message', null,     'outbound_message', 'Mensagem Whatsapp'),
      (4,  'Base Ativa (reativação)',               'outbound_message', null,     'outbound_message', 'Base Ativa'),
      (5,  'Prospecção Ativa',                      'outbound_phone',   null,     'outbound_phone',   '%'),
      (6,  'Programa de Indicação',                 'referral',         null,     'referral',         '%'),
      (7,  'Landing Page · Lead Land',              'direct_brand',     'site',   'direct_brand',     'Landing Page%'),
      (8,  'Site',                                  'direct_brand',     'site',   'direct_brand',     'Site'),
      (9,  'Lead Magnet · Billing',                 'direct_brand',     'site',   'direct_brand',     'Lead Magnet%'),
      (10, 'Lead Magnet · Billing',                 'direct_brand',     'site',   'partner_channel',  'Lead Magnet%'),
      (11, 'Google Ads · histórico',                'paid_search',      'google', 'paid_search',      '%'),
      (12, 'Base importada (Database / Jestor)',    'api_import',       null,     'api_import',       '%'),
      (13, 'Parcerias',                             'partner_channel',  null,     'partner_channel',  '%'),
      (14, 'Agente de IA · WhatsApp',               null,               'whatsapp', null,             'Agente de IA'),
      (15, 'Agente de IA · WhatsApp',               null,               'whatsapp', null,             'IA')
    ) as x(ord, camp_name, camp_cat, camp_platform, lead_cat, label_like)
    order by ord
  loop
    select id into v_camp from public.crm_campaigns where equipe_id = v_eq and name = m.camp_name and status <> 'archived' limit 1;
    if v_camp is null then
      if m.ord = 1 then continue; end if;  -- a campanha da plataforma tem que existir
      insert into public.crm_campaigns (equipe_id, name, origin_category, platform, status, match_keys)
      values (v_eq, m.camp_name, m.camp_cat, m.camp_platform, 'active',
              array['legado:' || lower(regexp_replace(m.camp_name, '[^A-Za-z0-9]+', '-', 'g'))])
      returning id into v_camp;
    end if;

    with picked as (
      select l.id, l.first_touch_id
        from public.leads l
       where l.equipe_id = v_eq and l.deleted_at is null and l.campaign_id is null
         and l.origin_category is not distinct from m.lead_cat
         and public._crm_source_label(l.origin_detail, l.source) like m.label_like
    ), bk as (
      insert into public._bk_s16_legacy_links (lead_id, campaign_id, touch_id, touch_was_null)
      select p.id, v_camp, p.first_touch_id,
             coalesce((select t.campaign_id is null from public.lead_touches t where t.id = p.first_touch_id), false)
        from picked p
      on conflict (lead_id) do nothing
      returning lead_id
    ), upl as (
      update public.leads l set campaign_id = v_camp from picked p where l.id = p.id returning l.id
    )
    update public.lead_touches t set campaign_id = v_camp
      from picked p where t.id = p.first_touch_id and t.campaign_id is null;
  end loop;
end $$;

select public._crm_source_label(origin_detail, source) as sobra, origin_category, count(*)
  from public.leads
 where equipe_id = '939d7dd8-592c-4fda-946e-3568f2909904' and deleted_at is null and campaign_id is null
 group by 1, 2 order by 3 desc;
