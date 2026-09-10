-- 20260910000300_sprint11_find_lead_by_phone.sql
-- Sprint 11 · T7 — achar o lead pelo telefone do jeito que o banco guarda.
--
-- O crm-webhook procurava lead existente com `phone = <só dígitos>`. Mas `phone`
-- guarda o que foi digitado: 897 dos 1.175 telefones da Solo Energia têm máscara
-- ("(85) 99262-5840", "+5585…"). A busca não achava, o webhook tentava inserir,
-- batia no UNIQUE (equipe_id, phone_normalized) e respondia 500. O lead que
-- voltava pelo Formulário Meta ou pela Landing Page sumia — e os 514 do Reciclo
-- são exatamente quem volta.
--
-- A comparação agora é por phone_normalized, com a mesma normalize_phone_br que
-- o trigger usa para preencher a coluna. O que o UNIQUE considera o mesmo número,
-- esta busca também considera.
--
-- Só o service_role executa. A equipe vem por parâmetro, então liberar para
-- `authenticated` deixaria um usuário sondar telefones de outros clientes.

create or replace function public.crm_find_lead_by_phone(p_equipe_id uuid, p_phone text)
returns uuid
language sql
stable
set search_path = public
as $$
  select l.id
    from public.leads l
   where l.equipe_id = p_equipe_id
     and l.deleted_at is null
     and l.phone_normalized is not null
     and l.phone_normalized = public.normalize_phone_br(p_phone)
   order by l.created_at
   limit 1;
$$;

comment on function public.crm_find_lead_by_phone(uuid, text) is
  'Sprint 11: id do lead vivo da equipe com este telefone, comparado por phone_normalized (a mesma regra do UNIQUE). Só service_role.';

revoke all on function public.crm_find_lead_by_phone(uuid, text) from public, anon, authenticated;
grant execute on function public.crm_find_lead_by_phone(uuid, text) to service_role;
