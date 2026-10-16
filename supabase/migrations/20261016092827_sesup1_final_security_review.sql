-- Funções de gatilho são internas; não são endpoints RPC para clientes.
-- SECURITY DEFINER mantém o uso pelos gatilhos após revogar EXECUTE direto.
revoke all on function public.fn_opportunity_distribution() from public, anon, authenticated;
revoke all on function public.fn_opportunity_owner_history() from public, anon, authenticated;
-- Os objetos novos não dependem das permissões padrão do projeto.
grant select, insert, update, delete on public.crm_automations, public.crm_forms to authenticated;
grant select on public.automation_runs, public.crm_form_submissions to authenticated;
grant all on public.crm_automations, public.automation_runs, public.crm_forms,
  public.crm_form_submissions, public.pipeline_distribution, public.pipeline_distribution_runs to service_role;

-- Duplicatas históricas não podem desativar a proteção contra novas corridas.
-- O índice parcial da Onda 3 só é criado se o legado já estiver limpo.
-- Serializamos os escritores por lead/canal e devolvemos o mesmo 23505 que as
-- funções de ingestão já tratam, preservando todas as conversas e mensagens antigas.
create or replace function public.fn_conversation_active_guard()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.status <> 'active' or new.deleted_at is not null or new.lead_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'active' and old.deleted_at is null
       and old.lead_id = new.lead_id and old.channel is not distinct from new.channel then
      return new;
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.lead_id::text || ':' || coalesce(new.channel, ''), 0));
  if exists (select 1 from public.conversations c
              where c.lead_id = new.lead_id and c.channel is not distinct from new.channel
                and c.status = 'active' and c.deleted_at is null and c.id <> new.id) then
    raise exception 'active_conversation_exists'
      using errcode = '23505', constraint = 'uq_conversations_active_lead_channel';
  end if;
  return new;
end;
$$;
revoke all on function public.fn_conversation_active_guard() from public, anon, authenticated;
drop trigger if exists trg_conversation_active_guard on public.conversations;
create trigger trg_conversation_active_guard
  before insert or update of status, lead_id, channel, deleted_at on public.conversations
  for each row execute function public.fn_conversation_active_guard();
