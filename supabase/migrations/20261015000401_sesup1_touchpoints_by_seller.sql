-- 20261015000401_sesup1_touchpoints_by_seller.sql
-- SE-SUP1-5 (#13) — touchpoints por vendedor.
--
-- O dashboard só tinha o TOTAL de touchpoints (get_funnel_overview). O gestor
-- quer saber QUEM está trabalhando: este RPC devolve uma linha por vendedor e o
-- total do mesmo conjunto.
--
-- MESMA ARQUITETURA DO RESTO DO DASHBOARD (Sprint 9): um _core que recebe
-- (equipe, restrict) explícitos — o relatório agendado chama sem auth.uid() — e
-- um wrapper público que resolve o escopo por _funnel_scope(). Um assento comum
-- (restrict = auth.uid()) só enxerga os próprios números, como nos demais RPCs.
--
-- QUEM É "O VENDEDOR": quem registrou o touchpoint (touchpoints.user_id). Sem
-- user_id (legado/importado) cai para o responsável do lead; sem os dois, é
-- "Não atribuído" — a linha existe, o total não perde ninguém.
--
-- O DIA É DO FUSO DO CLIENTE: touchpoints.contact_date é `date`. Comparar uma
-- date com timestamptz converte a data para meia-noite UTC, e para uma janela
-- de Brasília [03:00Z, 03:00Z) isso conta o dia ERRADO (o de ontem sai, o de
-- hoje entra). Aqui a janela é convertida para dias locais antes de comparar;
-- o fim é `to - 1µs`, o que serve tanto a [00:00, 00:00) quanto a endOfDay.
--
-- O escopo (lead não apagado, responsável, canal de aquisição) é o mesmo do
-- get_funnel_overview, e o filtro de pipeline vale de verdade: só contam
-- touchpoints de leads com negócio no pipeline pedido.

begin;

create or replace function public._touchpoints_by_seller_core(
  p_equipe          uuid,
  p_restrict        uuid,
  p_from            timestamptz,
  p_to              timestamptz,
  p_pipeline_ids    uuid[] default null,
  p_channels        text[] default null,
  p_responsible_ids uuid[] default null,
  p_timezone        text   default 'America/Sao_Paulo'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
stable
as $$
declare
  v_from_day date := (p_from at time zone p_timezone)::date;
  v_to_day   date := ((p_to - interval '1 microsecond') at time zone p_timezone)::date;
  v_rows     jsonb;
begin
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'seller_id',   s.seller_id,
             'seller_name', coalesce(pr.nome_completo, case when s.seller_id is null then 'Não atribuído' end),
             'touchpoints', s.n
           ) order by s.n desc, pr.nome_completo nulls last),
         '[]'::jsonb)
    into v_rows
  from (
    select coalesce(t.user_id, l.responsible_id) as seller_id, count(*)::int as n
      from public.touchpoints t
      join public.leads l on l.id = t.lead_id
      join public.v_lead_channel c on c.lead_id = l.id
     where l.equipe_id = p_equipe
       and l.deleted_at is null
       and t.contact_date >= v_from_day
       and t.contact_date <= v_to_day
       and (p_restrict is null or l.responsible_id = p_restrict)
       and (p_responsible_ids is null or l.responsible_id = any(p_responsible_ids))
       and (p_channels is null or c.acquisition_channel = any(p_channels))
       and (p_pipeline_ids is null or exists (
             select 1 from public.opportunities o
              where o.lead_id = l.id
                and o.equipe_id = p_equipe
                and o.deleted_at is null
                and o.pipeline_id = any(p_pipeline_ids)))
       -- Assento comum: nem os colegas aparecem em touchpoints de leads dele.
       and (p_restrict is null or coalesce(t.user_id, l.responsible_id) = p_restrict)
     group by 1
  ) s
  left join public.profiles pr on pr.id = s.seller_id;

  return jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'total',  coalesce((select sum((x->>'touchpoints')::int) from jsonb_array_elements(v_rows) x), 0),
    'rows',   v_rows
  );
end;
$$;

revoke all on function public._touchpoints_by_seller_core(uuid, uuid, timestamptz, timestamptz, uuid[], text[], uuid[], text)
  from public, anon, authenticated;

create or replace function public.get_touchpoints_by_seller(
  p_from         timestamptz,
  p_to           timestamptz,
  p_pipeline_ids uuid[] default null,
  p_channels     text[] default null,
  p_timezone     text   default 'America/Sao_Paulo'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
stable
as $$
declare
  v_equipe uuid; v_restrict uuid;
begin
  select s.v_equipe, s.v_restrict into v_equipe, v_restrict from public._funnel_scope() s;
  return public._touchpoints_by_seller_core(
    v_equipe, v_restrict, p_from, p_to, p_pipeline_ids, p_channels, null, p_timezone);
end;
$$;

revoke all on function public.get_touchpoints_by_seller(timestamptz, timestamptz, uuid[], text[], text) from public, anon;
grant execute on function public.get_touchpoints_by_seller(timestamptz, timestamptz, uuid[], text[], text) to authenticated;

comment on function public.get_touchpoints_by_seller(timestamptz, timestamptz, uuid[], text[], text) is
  'SE-SUP1-5 #13: touchpoints por vendedor + total. Escopo da equipe do chamador; assento comum só vê os próprios.';

commit;
