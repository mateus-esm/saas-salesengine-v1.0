-- Sprint Suporte 1 · #12 — motor único de movimentação de etapa (banco).
--
-- ANTES
--
-- Cada tela movia o negócio por conta própria (UPDATE direto em opportunities,
-- ou crm_update_opportunities na Tabela) e só o arrastar do Kanban perguntava o
-- motivo da perda — e deixava pular. Resultado na Solo Energia: 528 dos 533
-- negócios perdidos sem lost_reason.
--
-- AGORA
--
--   1. crm_move_opportunity(p_opportunity, p_stage, p_lost_reason): o único verbo
--      de "mover para etapa" da interface. Grava etapa + motivo no MESMO UPDATE e
--      RECUSA destino de perda sem motivo quando o pipeline tem loss_reasons.
--      Efeitos colaterais = os de hoje, porque é o mesmo UPDATE de stage_id:
--      trg_opportunity_outcome (status/closed_at), trg_opportunity_stage_change
--      (histórico de etapa → funnel_events 'won'/'lost' pelo
--      fn_record_stage_funnel_event), owner/arquivado. Nada é duplicado aqui.
--   2. Rede de segurança para quem NÃO passa pela RPC (crm-webhook, Copilot, regra
--      do Agente CRM, API): trg_opportunity_z_lost_reason preenche
--      'Não informado' quando um negócio fica perdido sem motivo. Nunca vazio; o
--      vendedor qualifica depois. (O 'z' no nome a faz rodar DEPOIS dos outros
--      gatilhos BEFORE, que decidem o status.)
--
-- Isolamento: SECURITY DEFINER, mas só mexe em negócio da equipe de quem chama
-- (profiles.equipe_id de auth.uid()); etapa de outro pipeline/equipe é recusada.
--
-- Autorização: as políticas de RLS de opportunities (20260419110000_epic2_pipelines)
-- são só por equipe — "Users can manage their team opportunities" FOR ALL,
-- equipe_id in (select equipe_id from profiles where id = auth.uid()) — sem regra
-- de papel nem de dono; crm_update_opportunities também é SECURITY INVOKER sob essa
-- mesma RLS. Verificar equipe_id (com profiles.id = auth.uid(), o mesmo padrão)
-- é, portanto, exatamente o que um UPDATE normal permite; o dono do negócio é
-- tratado à parte pelos gatilhos de owner, que continuam disparando.
--
-- O backfill dos 528 perdidos antigos NÃO está aqui: é o arquivo seguinte
-- (supabase/scripts/2026-10-15_sesup1_backfill_lost_reason.sql), aplicado manualmente.

begin;

create or replace function public.crm_move_opportunity(
  p_opportunity uuid,
  p_stage uuid,
  p_lost_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_equipe  uuid;
  v_opp     record;
  v_type    text;
  v_reasons jsonb;
  v_reason  text := nullif(btrim(coalesce(p_lost_reason, '')), '');
begin
  select p.equipe_id into v_equipe from public.profiles p where p.id = auth.uid();
  if v_equipe is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- Trava a linha: dois movimentos simultâneos do mesmo negócio não se atropelam.
  select o.id, o.stage_id, o.pipeline_id, o.status, o.lost_reason
    into v_opp
    from public.opportunities o
   where o.id = p_opportunity
     and o.equipe_id = v_equipe
     and o.deleted_at is null
   for update;
  if not found then
    raise exception 'opportunity_not_found' using errcode = 'P0002';
  end if;

  -- A etapa precisa ser da linha do negócio (e, por consequência, da equipe).
  select s.stage_type into v_type
    from public.pipeline_stages_v2 s
   where s.id = p_stage
     and s.pipeline_id = v_opp.pipeline_id
     and s.equipe_id = v_equipe
     and s.deleted_at is null;
  if not found then
    raise exception 'invalid_stage' using errcode = '22023';
  end if;

  -- Já está lá: nada a fazer (não regrava histórico nem evento).
  if v_opp.stage_id = p_stage then
    return false;
  end if;

  if v_type = 'lost' then
    select pl.loss_reasons into v_reasons from public.pipelines pl where pl.id = v_opp.pipeline_id;
    if jsonb_typeof(v_reasons) = 'array' and jsonb_array_length(v_reasons) > 0
       and v_reason is null
       -- Perdido → outra etapa de perda mantém o motivo que já tinha.
       and not (v_opp.status = 'lost' and nullif(btrim(coalesce(v_opp.lost_reason, '')), '') is not null) then
      raise exception 'loss_reason_required' using errcode = '22023';
    end if;
  end if;

  update public.opportunities o
     set stage_id = p_stage,
         lost_reason = case when v_type = 'lost' then coalesce(v_reason, o.lost_reason) else o.lost_reason end
   where o.id = v_opp.id;

  return true;
end;
$$;

comment on function public.crm_move_opportunity(uuid, uuid, text) is
  'Sprint Suporte 1 · #12: the single stage-move verb of the UI. Writes stage and loss reason in one UPDATE (all stage triggers fire as before) and refuses a lost target without a reason when the pipeline has loss_reasons. Tenant-scoped by the caller''s equipe_id. Returns false when the deal was already in that stage.';

revoke all on function public.crm_move_opportunity(uuid, uuid, text) from public, anon;
grant execute on function public.crm_move_opportunity(uuid, uuid, text) to authenticated;

-- ============================================================================
-- Rede de segurança: perdido nunca fica sem motivo
-- ============================================================================

create or replace function public.fn_opportunity_default_lost_reason()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Só age quando o negócio ENTRA em perda (insert já perdido, ou update que
  -- troca etapa/status para perdido) sem motivo. Uma escrita qualquer num negócio
  -- que já está perdido e sem motivo (o legado) não é tocada: isso é do backfill.
  -- Idempotente: com motivo preenchido não faz nada.
  if new.status = 'lost' and nullif(btrim(coalesce(new.lost_reason, '')), '') is null
     and (tg_op = 'INSERT'
          or old.status is distinct from 'lost'
          or new.stage_id is distinct from old.stage_id) then
    new.lost_reason := 'Não informado';
  end if;
  return new;
end;
$$;

comment on function public.fn_opportunity_default_lost_reason() is
  'Sprint Suporte 1 · #12: a deal that ENTERS lost never stays without a reason. Writers that do not go through crm_move_opportunity (webhook, Copilot, agent rule engine, API) get "Não informado", to be qualified later.';

-- Sem lista de colunas em "update of": o status pode virar perdido por qualquer
-- caminho; o guarda acima filtra por transição. Roda por último ('z').
drop trigger if exists trg_opportunity_z_lost_reason on public.opportunities;
create trigger trg_opportunity_z_lost_reason
  before insert or update of status, stage_id on public.opportunities
  for each row execute function public.fn_opportunity_default_lost_reason();

commit;
