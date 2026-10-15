-- Sprint Suporte 1 · #8 e #11 — Responsável e Atendente, dois papéis, dois verbos.
--
-- ANTES
--
-- O chat tinha um único seletor chamado "Responsável" e ele gravava em
-- conversations.responsible_id — que é quem ATENDE a conversa. O responsável de
-- verdade (dono da conta/negócio) só mudava no Kanban/Tabela, por outro caminho.
-- Resultado: o vendedor trocava "o responsável" no chat e o negócio continuava
-- com o dono antigo (e o placar/comissão, que seguem opportunities.owner_id).
--
-- AGORA
--
--   Responsável = leads.responsible_id + opportunities.owner_id dos negócios ABERTOS
--   Atendente   = conversations.responsible_id (a coluna da conversa; não existe
--                 conversations.assigned_to — esse nome é de leads)
--
--   crm_set_responsible(p_lead, p_user)
--       um UPDATE no lead e um UPDATE nos negócios abertos dele. O histórico de dono
--       (opportunity_owner_history, o "owner_events" da Sprint 11 W2) e o
--       funnel_events.owner_id continuam sendo gravados pelos gatilhos que já
--       existem sobre opportunities.owner_id — nada é duplicado aqui. Negócio
--       ganho/perdido NÃO muda de dono: reatribuir moveria o ganho (e a comissão).
--   crm_set_attendant(p_conversation, p_user)
--       a coluna é da conversa, então é só um UPDATE com escopo de equipe e a
--       checagem de que o atendente é da mesma equipe.
--
-- Isolamento: SECURITY DEFINER, mas só age em registro da equipe de quem chama
-- (profiles.equipe_id de auth.uid()) e só aceita usuário dessa mesma equipe — a
-- mesma regra que a RLS de leads/conversations/opportunities já aplica a um UPDATE
-- normal (política por equipe, sem regra de papel).

begin;

create or replace function public.crm_set_responsible(p_lead uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team  uuid;
  v_opps  int;
begin
  select p.equipe_id into v_team from public.profiles p where p.id = auth.uid();
  if v_team is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.leads l
     where l.id = p_lead and l.equipe_id = v_team and l.deleted_at is null
  ) then
    raise exception 'lead_not_found' using errcode = 'P0002';
  end if;

  if p_user is not null and not exists (
    select 1 from public.profiles p where p.id = p_user and p.equipe_id = v_team
  ) then
    raise exception 'owner_not_in_team: o responsável % não pertence à equipe', p_user
      using errcode = '23514';
  end if;

  update public.leads l
     set responsible_id = p_user
   where l.id = p_lead and l.equipe_id = v_team
     and l.responsible_id is distinct from p_user;

  -- Só negócio aberto: o ganho/perdido é um fato e fica com quem o fechou.
  update public.opportunities o
     set owner_id = p_user
   where o.lead_id = p_lead and o.equipe_id = v_team
     and o.deleted_at is null
     and o.status = 'open'
     and o.owner_id is distinct from p_user;
  get diagnostics v_opps = row_count;

  return jsonb_build_object('lead_id', p_lead, 'responsible_id', p_user, 'opportunities_updated', v_opps);
end;
$$;

create or replace function public.crm_set_attendant(p_conversation uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team uuid;
begin
  select p.equipe_id into v_team from public.profiles p where p.id = auth.uid();
  if v_team is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_user is not null and not exists (
    select 1 from public.profiles p where p.id = p_user and p.equipe_id = v_team
  ) then
    raise exception 'owner_not_in_team: o atendente % não pertence à equipe', p_user
      using errcode = '23514';
  end if;

  update public.conversations c
     set responsible_id = p_user
   where c.id = p_conversation and c.equipe_id = v_team;
  if not found then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.crm_set_responsible(uuid, uuid) from public, anon;
revoke all on function public.crm_set_attendant(uuid, uuid) from public, anon;
grant execute on function public.crm_set_responsible(uuid, uuid) to authenticated;
grant execute on function public.crm_set_attendant(uuid, uuid) to authenticated;

comment on function public.crm_set_responsible(uuid, uuid) is
  'Sprint Suporte 1 · #8: responsável do lead + dono dos negócios ABERTOS, juntos. O histórico de dono é gravado pelos gatilhos de opportunities.owner_id.';
comment on function public.crm_set_attendant(uuid, uuid) is
  'Sprint Suporte 1 · #11: atendente da conversa (conversations.responsible_id), com escopo de equipe.';

commit;
