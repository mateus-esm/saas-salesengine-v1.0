-- SE-REV-004 — salvar sequência de outreach numa única transação.
--
-- Por quê (revisão adversarial da SE-REV-002, §3): o `upsert-sequence` fazia
-- três escritas independentes via PostgREST (sequência, passos, desativação
-- dos passos removidos). Uma falha no meio deixava a sequência — possivelmente
-- ATIVA — com conteúdo misturado, e a tela recebia erro sem saber o que ficou
-- gravado. Aqui as três escritas vivem numa função: ou tudo, ou nada.
--
-- A validação de negócio (porta do time, etapa do time, passos contínuos e
-- crescentes) continua na edge function `outreach`, que já a testa. Esta
-- função só garante escopo do time e atomicidade. Aditiva: nenhuma tabela
-- muda; rollback = `drop function` (a edge function antiga não a usa).

create or replace function public.crm_outreach_save_sequence(
  p_equipe_id uuid,
  p_sequence  jsonb,
  p_steps     jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid := nullif(btrim(coalesce(p_sequence->>'id', '')), '')::uuid;
  v_seq   public.cadence_sequences;
  v_steps jsonb;
begin
  if p_equipe_id is null then
    raise exception 'equipe_id obrigatório' using errcode = '22023';
  end if;
  if jsonb_typeof(p_steps) is distinct from 'array' or jsonb_array_length(p_steps) = 0 then
    raise exception 'A sequência precisa ter pelo menos uma mensagem.' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.cadence_sequences (
      equipe_id, name, active, trigger_event, trigger_entry_ids,
      trigger_stage_id, reenroll, stop_on_reply, stop_on_stage_change
    ) values (
      p_equipe_id,
      p_sequence->>'name',
      coalesce((p_sequence->>'active')::boolean, false),
      p_sequence->>'trigger_event',
      coalesce(array(select jsonb_array_elements_text(p_sequence->'trigger_entry_ids'))::uuid[], '{}'),
      nullif(p_sequence->>'trigger_stage_id', '')::uuid,
      coalesce(p_sequence->>'reenroll', 'once_per_lead'),
      coalesce((p_sequence->>'stop_on_reply')::boolean, true),
      coalesce((p_sequence->>'stop_on_stage_change')::boolean, true)
    )
    returning * into v_seq;
  else
    update public.cadence_sequences set
      name                 = p_sequence->>'name',
      active               = coalesce((p_sequence->>'active')::boolean, false),
      trigger_event        = p_sequence->>'trigger_event',
      trigger_entry_ids    = coalesce(array(select jsonb_array_elements_text(p_sequence->'trigger_entry_ids'))::uuid[], '{}'),
      trigger_stage_id     = nullif(p_sequence->>'trigger_stage_id', '')::uuid,
      reenroll             = coalesce(p_sequence->>'reenroll', 'once_per_lead'),
      stop_on_reply        = coalesce((p_sequence->>'stop_on_reply')::boolean, true),
      stop_on_stage_change = coalesce((p_sequence->>'stop_on_stage_change')::boolean, true)
    where id = v_id and equipe_id = p_equipe_id
    returning * into v_seq;
    if not found then
      raise exception 'Sequência inexistente neste time' using errcode = 'P0002';
    end if;
  end if;

  insert into public.cadence_steps (sequence_id, equipe_id, position, offset_minutes, message_template, active)
  select v_seq.id, p_equipe_id,
         (s->>'position')::smallint, (s->>'offset_minutes')::integer, s->>'message_template', true
    from jsonb_array_elements(p_steps) s
  on conflict (sequence_id, position) do update set
    offset_minutes   = excluded.offset_minutes,
    message_template = excluded.message_template,
    active           = true;

  update public.cadence_steps st set active = false
   where st.sequence_id = v_seq.id
     and st.active
     and st.position not in (select (s->>'position')::smallint from jsonb_array_elements(p_steps) s);

  select coalesce(jsonb_agg(to_jsonb(st) order by st.position), '[]'::jsonb)
    into v_steps
    from public.cadence_steps st
   where st.sequence_id = v_seq.id and st.active;

  return to_jsonb(v_seq) || jsonb_build_object('steps', v_steps);
end;
$$;

revoke all on function public.crm_outreach_save_sequence(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.crm_outreach_save_sequence(uuid, jsonb, jsonb) to service_role;
