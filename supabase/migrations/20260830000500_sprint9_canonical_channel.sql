-- 20260830000500_sprint9_canonical_channel.sql
-- Sprint 9 · T3 — one answer to "de onde veio este lead?"
--
-- WHY THIS EXISTS
--
-- The Vision asks for "Lead per channel". A lead currently carries SIX columns
-- that could answer that, written by different code from different sprints:
--
--   origin_category  MECE enum of 12, CHECK-constrained, the Sprint 4 canon
--   origin_detail    free text refining the above
--   origin           legacy free text
--   source           legacy free text — AddContactModal still writes it
--   origem           legacy free text, Portuguese spelling of the same idea
--   channel          NOT the same thing at all (see below)
--
-- Group by any one of them and you get a different chart. Group by the wrong
-- one and you get a chart that is mostly "null". None of them is wrong, exactly
-- — they are sediment, each correct for the sprint that added it.
--
-- THE TRAP: `channel` IS A DIFFERENT QUESTION
--
-- leads.channel is written by solo-wpp-webhook as 'whatsapp'. It records how we
-- TALK to this person, not where they CAME FROM. Folding it into an "origin"
-- chart would report that 90% of leads come from WhatsApp — which is true and
-- completely useless, because WhatsApp is the inbox, not the marketing channel.
--
-- So this view exposes both, named so they cannot be confused:
--
--   acquisition_channel  where the lead came from   (marketing / prospecting)
--   contact_channel      how the conversation runs  (whatsapp / instagram / …)
--
-- The dashboard offers both as dimensions and labels them in the client's own
-- words. Collapsing them into one "canal" would have been less code and a worse
-- product.
--
-- PRECEDENCE, DECIDED ONCE AND WRITTEN DOWN
--
--   1. origin_category — the only column with a CHECK behind it, so the only
--      one that can be trusted to group cleanly. Rendered through the same
--      Portuguese labels the UI uses.
--   2. a tenant tag from origin_taxonomy matching origin/source/origem
--      case-insensitively — the client's own vocabulary wins over raw text.
--   3. the raw text itself, trimmed, first non-empty of origin, source, origem.
--   4. 'Não informado' — never NULL. A null in a group-by silently drops the
--      row from the chart and the totals stop adding up to the header number,
--      which is the single fastest way to lose a client's trust in a dashboard.

begin;

-- ============================================================================
-- 1. THE LABELS
--
-- Mirrors src/config/originTaxonomy.ts. Duplicated on purpose: the report is
-- rendered inside an edge function with no access to the React bundle, and
-- shipping "organic_search" to a client's WhatsApp instead of "Busca Orgânica"
-- is not acceptable output.
--
-- KEEP IN LOCKSTEP with src/config/originTaxonomy.ts and the
-- leads.origin_category CHECK constraint. Three places, one list — the
-- alternative is a lookup table nobody remembers to seed for new tenants.
-- ============================================================================

create or replace function public.origin_category_label(p_code text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_code
    when 'organic_search'   then 'Busca Orgânica'
    when 'organic_social'   then 'Social Orgânico'
    when 'paid_search'      then 'Busca Paga'
    when 'paid_social'      then 'Social Pago'
    when 'direct_brand'     then 'Direto / Marca'
    when 'outbound_phone'   then 'Cold Call'
    when 'outbound_message' then 'Cold Message'
    when 'outbound_email'   then 'Cold Email'
    when 'referral'         then 'Indicação'
    when 'partner_channel'  then 'Parceiro / Canal'
    when 'offline_event'    then 'Evento Offline'
    when 'api_import'       then 'Importação / API'
    else null
  end;
$$;

comment on function public.origin_category_label(text) is
  'Sprint 9: PT-BR label for a leads.origin_category code. Mirrors src/config/originTaxonomy.ts — keep the two in lockstep.';

create or replace function public.origin_category_group(p_code text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_code in ('organic_search','organic_social','paid_search','paid_social','direct_brand') then 'Inbound'
    when p_code in ('outbound_phone','outbound_message','outbound_email') then 'Outbound'
    when p_code in ('referral','partner_channel','offline_event') then 'Rede'
    when p_code = 'api_import' then 'Sistema'
    else null
  end;
$$;

comment on function public.origin_category_group(text) is
  'Sprint 9: the four-way grouping (Inbound/Outbound/Rede/Sistema) behind a lead origin. Lets the dashboard roll 12 categories up to the number a founder actually steers on.';

-- ============================================================================
-- 2. CONTACT CHANNEL LABELS
--
-- Small and closed. Anything unrecognised falls through as itself rather than
-- being hidden — an unknown channel showing up as "telegram" in a chart is a
-- useful signal that some integration started writing a new value.
-- ============================================================================

create or replace function public.contact_channel_label(p_code text)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(coalesce(nullif(trim(p_code), ''), ''))
    when 'whatsapp'  then 'WhatsApp'
    when 'instagram' then 'Instagram'
    when 'messenger' then 'Messenger'
    when 'telegram'  then 'Telegram'
    when 'email'     then 'E-mail'
    when 'sms'       then 'SMS'
    when 'webchat'   then 'Webchat'
    when 'phone'     then 'Telefone'
    when ''          then 'Não informado'
    else initcap(trim(p_code))
  end;
$$;

-- ============================================================================
-- 3. THE VIEW
--
-- security_invoker = on — RLS on leads does the tenant filtering. Sprint 8.2
-- (20260824000200) documents in detail what happens when a view over tenant
-- tables is left on definer semantics; the short version is that it becomes a
-- cross-tenant read.
-- ============================================================================

create or replace view public.v_lead_channel as
select
  l.id        as lead_id,
  l.equipe_id,
  l.created_at,

  -- 1 → 2 → 3 → 4, as documented in the header.
  coalesce(
    public.origin_category_label(l.origin_category),
    (select t.label
       from public.origin_taxonomy t
      where t.equipe_id = l.equipe_id
        and t.deleted_at is null
        and t.kind = 'origem'
        and lower(t.label) = lower(trim(coalesce(
              nullif(trim(l.origin),  ''),
              nullif(trim(l.source),  ''),
              nullif(trim(l.origem),  '')
            )))
      limit 1),
    nullif(trim(l.origin), ''),
    nullif(trim(l.source), ''),
    nullif(trim(l.origem), ''),
    'Não informado'
  ) as acquisition_channel,

  -- The roll-up. NULL when the lead has no CHECK-constrained category, because
  -- guessing a group from free text is the same mistake as guessing a stage
  -- from its name.
  public.origin_category_group(l.origin_category) as acquisition_group,

  nullif(trim(l.origin_detail), '')     as acquisition_detail,
  public.contact_channel_label(l.channel) as contact_channel,
  l.responsible_id,
  l.contact_type
from public.leads l
where l.deleted_at is null;

alter view public.v_lead_channel set (security_invoker = on);

comment on view public.v_lead_channel is
  'Sprint 9: the single answer to "where did this lead come from" (acquisition_channel) and "how do we talk to them" (contact_channel), resolved from the six overlapping origin columns. Never returns NULL for acquisition_channel — a NULL silently drops rows from a group-by and breaks the totals.';

grant select on public.v_lead_channel to authenticated;

-- Group-by on acquisition needs the source columns; this covers the common
-- "leads created in a window, grouped by origin" scan.
create index if not exists idx_leads_equipe_created_origin
  on public.leads (equipe_id, created_at desc)
  where deleted_at is null;

commit;
