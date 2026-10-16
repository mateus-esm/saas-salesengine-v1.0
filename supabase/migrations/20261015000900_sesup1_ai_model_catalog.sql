-- 20261015000900_sesup1_ai_model_catalog.sql
-- Sprint Suporte 1 · Onda 9 (#2) — cache da lista de modelos do provedor de IA.
--
-- A lista é do provedor, igual para todas as equipes: não há equipe_id. O cache
-- guarda só QUAIS ids o provedor lista; preço e rótulo continuam no
-- MODEL_CATALOG da função, para que reprecificar seja um deploy e não um
-- UPDATE em cache. Só a edge function (service role) escreve.

create table if not exists public.ai_model_catalog (
  id          text primary key,
  label       text,
  vendor      text,
  -- Última vez que o provedor listou este id; o maior valor da tabela é o
  -- "último refresh" que o TTL de 6 h consulta.
  synced_at   timestamptz not null default now(),
  -- Quando o admin foi avisado de que falta preço. Evita o alerta repetido a
  -- cada refresh; a notificação ainda tem dedup_key por garantia.
  alerted_at  timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.ai_model_catalog enable row level security;

-- Cliente não lê nem escreve: a função devolve já convertido em créditos
-- cobrados. Só quem administra a plataforma enxerga o cache cru.
drop policy if exists "admin_read_ai_model_catalog" on public.ai_model_catalog;
create policy "admin_read_ai_model_catalog"
  on public.ai_model_catalog for select to authenticated
  using (public.has_role(auth.uid(), 'owner') or public.has_role(auth.uid(), 'super_admin'));

revoke all on public.ai_model_catalog from anon, authenticated;
grant select on public.ai_model_catalog to authenticated;
grant all on public.ai_model_catalog to service_role;

-- Última TENTATIVA de buscar no provedor (sucesso ou falha). Numa queda o
-- synced_at não anda; sem isto cada chamada bateria no provedor de novo.
create table if not exists public.ai_model_catalog_state (
  id              boolean primary key default true check (id),
  last_attempt_at timestamptz
);
alter table public.ai_model_catalog_state enable row level security;
revoke all on public.ai_model_catalog_state from anon, authenticated;
grant all on public.ai_model_catalog_state to service_role;

-- ---------------------------------------------------------------------------
-- Alerta ao painel admin: reaproveita notify() e o mesmo endereçamento do
-- ticket de suporte (audience 'founder' não faz fan-out; endereça-se à equipe
-- de cada owner/super_admin, com user_id para não vazar aos colegas).
-- ---------------------------------------------------------------------------
insert into public.notification_types
  (type, default_severity, default_channels, audience, description, purpose, variables)
values ('ai.model_unpriced', 'warn', array['in_app'], 'founder',
  'Modelo de IA novo no provedor, sem preço definido', 'operacao',
  array['model_id', 'label', 'vendor'])
on conflict (type) do nothing;

create or replace function public.ai_model_alert_unpriced(p_model_id text)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_row  public.ai_model_catalog%rowtype;
  v_dest record;
  v_n    integer := 0;
begin
  -- O UPDATE ... RETURNING é o trinco: duas chamadas simultâneas não alertam em dobro.
  update public.ai_model_catalog
     set alerted_at = now()
   where id = p_model_id::text and alerted_at is null
  returning * into v_row;
  if v_row.id is null then
    return 0;
  end if;

  for v_dest in
    select distinct p.user_id, p.equipe_id
      from public.profiles p
      join public.user_roles r on r.user_id = p.user_id
     where r.role in ('owner', 'super_admin') and p.equipe_id is not null
  loop
    perform public.notify(
      p_equipe_id => v_dest.equipe_id,
      p_type      => 'ai.model_unpriced',
      p_title     => 'Modelo de IA novo sem preço: ' || coalesce(v_row.label, v_row.id),
      p_body      => 'O provedor passou a listar "' || v_row.id || '". Está sendo cobrado pelo maior preço do fornecedor até ser precificado em MODEL_CATALOG (manage-agent-settings).',
      p_data      => jsonb_build_object('model_id', v_row.id, 'label', coalesce(v_row.label, v_row.id), 'vendor', coalesce(v_row.vendor, '')),
      p_dedup_key => 'ai.model_unpriced:' || v_row.id || ':' || v_dest.user_id::text,
      p_user_id   => v_dest.user_id
    );
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$fn$;

revoke all on function public.ai_model_alert_unpriced(text) from public, anon, authenticated;
grant execute on function public.ai_model_alert_unpriced(text) to service_role;
