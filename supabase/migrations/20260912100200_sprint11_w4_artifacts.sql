-- Sprint 11 · Onda 4 · T40 — o artefato preso ao negócio (decisão 21).
--
-- Um artefato (proposta, contrato, documento) é um registro de uma tabela
-- personalizada marcada como artefato (`custom_tables.artifact_kind`), preso a um
-- negócio por coluna de verdade (`custom_table_records.opportunity_id`, N:1) — não
-- por vínculo solto: a espinha entende (painel no negócio, consulta, ciclo de
-- vida, marco). Tabela que não é artefato continua como era.
--
-- `artifact_status` nasce aqui (rascunho ao criar); quem muda o status é o verbo
-- do T43 (ciclo de vida → marco).
--
-- A guarda do registro também fecha uma brecha antiga: a RLS dos registros olha
-- só a equipe do registro, então dava para gravar um registro da própria equipe
-- numa tabela de outra. Agora a equipe do registro é a da tabela, e o negócio é
-- da mesma equipe.

-- ============================================================================
-- 1. O MODELO
-- ============================================================================

alter table public.custom_tables add column if not exists artifact_kind text;
alter table public.custom_tables drop constraint if exists custom_tables_artifact_kind_check;
alter table public.custom_tables add constraint custom_tables_artifact_kind_check
  check (artifact_kind is null or artifact_kind in ('proposal', 'contract', 'document'));

alter table public.custom_table_records
  add column if not exists opportunity_id uuid references public.opportunities(id) on delete set null;
alter table public.custom_table_records add column if not exists artifact_status text;
alter table public.custom_table_records drop constraint if exists custom_table_records_artifact_status_check;
alter table public.custom_table_records add constraint custom_table_records_artifact_status_check
  check (artifact_status is null or artifact_status in ('draft', 'sent', 'accepted', 'signed', 'rejected'));

create index if not exists idx_custom_table_records_opportunity
  on public.custom_table_records (opportunity_id)
  where opportunity_id is not null and deleted_at is null;

-- ============================================================================
-- 2. A GUARDA DO REGISTRO
-- ============================================================================

create or replace function public.fn_custom_record_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
begin
  if tg_op = 'INSERT' or new.table_id is distinct from old.table_id or new.equipe_id is distinct from old.equipe_id then
    select t.artifact_kind into v_kind from public.custom_tables t
     where t.id = new.table_id and t.equipe_id = new.equipe_id;
    if not found then
      raise exception 'table_not_found' using errcode = 'P0002';
    end if;
    if tg_op = 'INSERT' and v_kind is not null and new.artifact_status is null then
      new.artifact_status := 'draft';
    end if;
  end if;

  if new.opportunity_id is not null
     and (tg_op = 'INSERT' or new.opportunity_id is distinct from old.opportunity_id or new.equipe_id is distinct from old.equipe_id)
     and not exists (select 1 from public.opportunities o
                      where o.id = new.opportunity_id and o.equipe_id = new.equipe_id) then
    raise exception 'opportunity_not_found' using errcode = 'P0002';
  end if;

  return new;
end;
$$;

revoke all on function public.fn_custom_record_guard() from public, anon, authenticated;

drop trigger if exists trg_custom_record_guard on public.custom_table_records;
create trigger trg_custom_record_guard
  before insert or update of table_id, equipe_id, opportunity_id on public.custom_table_records
  for each row execute function public.fn_custom_record_guard();

-- ============================================================================
-- 3. A LINHA CARREGA O NEGÓCIO E O STATUS
-- ============================================================================

create or replace function public._crm_custom_table_row_json(p public.custom_table_records)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
           'id', p.id, 'equipe_id', p.equipe_id, 'table_id', p.table_id, 'data', p.data,
           'created_at', p.created_at, 'updated_at', p.updated_at,
           'opportunity_id', p.opportunity_id,
           'artifact_status', p.artifact_status,
           'deal', (select jsonb_build_object('id', o.id, 'name', l.name, 'pipeline_id', o.pipeline_id)
                      from public.opportunities o
                      join public.leads l on l.id = o.lead_id
                     where o.id = p.opportunity_id));
$$;

-- ============================================================================
-- 4. OS VERBOS
-- ============================================================================

-- Cria um artefato já preso ao negócio, em rascunho. Só guarda valores das
-- colunas da tabela (por field_id).
create or replace function public.crm_create_artifact(
  p_table_id       uuid,
  p_opportunity_id uuid,
  p_data           jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_t    public.custom_tables;
  v_data jsonb;
  v_row  public.custom_table_records;
begin
  select * into v_t from public.custom_tables where id = p_table_id and deleted_at is null;
  if not found then
    raise exception 'table_not_found' using errcode = 'P0002';
  end if;
  if v_t.artifact_kind is null then
    raise exception 'not_an_artifact_table' using errcode = '22023';
  end if;
  if not exists (select 1 from public.opportunities o
                  where o.id = p_opportunity_id and o.equipe_id = v_t.equipe_id and o.deleted_at is null) then
    raise exception 'opportunity_not_found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_data
    from jsonb_each(case when jsonb_typeof(p_data) = 'object' then p_data else '{}'::jsonb end) e
   where e.key in (select c->>'field_id' from jsonb_array_elements(v_t.table_schema) c);

  insert into public.custom_table_records (equipe_id, table_id, data, opportunity_id, artifact_status)
  values (v_t.equipe_id, v_t.id, v_data, p_opportunity_id, 'draft')
  returning * into v_row;

  return public._crm_custom_table_row_json(v_row);
end;
$$;

-- O painel do negócio: toda tabela de artefato da equipe (mesmo sem registro,
-- para oferecer "criar"), com os registros presos a este negócio.
create or replace function public.crm_deal_artifacts(p_opportunity_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'table', jsonb_build_object('id', t.id, 'name', t.name, 'slug', t.slug,
                                       'artifact_kind', t.artifact_kind, 'table_schema', t.table_schema),
           'records', coalesce((select jsonb_agg(public._crm_custom_table_row_json(r) order by r.created_at desc, r.id)
                                  from public.custom_table_records r
                                 where r.table_id = t.id
                                   and r.opportunity_id = p_opportunity_id
                                   and r.deleted_at is null), '[]'::jsonb))
         order by case t.artifact_kind when 'proposal' then 0 when 'contract' then 1 else 2 end, t.created_at, t.id),
         '[]'::jsonb)
    from public.custom_tables t
   where t.artifact_kind is not null
     and t.deleted_at is null
     and t.equipe_id = (select o.equipe_id from public.opportunities o where o.id = p_opportunity_id);
$$;

revoke all on function public.crm_create_artifact(uuid, uuid, jsonb) from public, anon;
revoke all on function public.crm_deal_artifacts(uuid) from public, anon;
grant execute on function public.crm_create_artifact(uuid, uuid, jsonb) to authenticated;
grant execute on function public.crm_deal_artifacts(uuid) to authenticated;
