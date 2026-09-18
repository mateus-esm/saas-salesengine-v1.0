-- Sprint 8.2 · discovery_q&a · T72 — os quatro verbos do discovery.
--
-- Toda validação acontece aqui, contra o banco de perguntas: qual pergunta
-- existe, qual opção é válida, qual é obrigatória. O navegador manda o que
-- quiser; quem decide é esta camada. É a mesma escolha de
-- _crm_public_form_submit (sprint 11 · T45).

-- O nicho do cliente deste onboarding — molda quais perguntas ele vê.
create or replace function public._discovery_niche(p_onboarding_id uuid)
returns text language sql stable as $$
  select coalesce(p.niche_id, e.niche)
    from public.onboardings o
    left join public.proposals p on p.id = o.proposal_id
    left join public.equipes   e on e.id = o.equipe_id
   where o.id = p_onboarding_id;
$$;

-- Gera (ou regenera) o link. Devolve o token em claro UMA vez — depois dela só
-- existe o hash. Cria a linha se ainda não existir, preservando respostas.
create or replace function public._discovery_ensure_link(p_onboarding_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.onboarding_discovery (onboarding_id, token_hash, expires_at)
  values (p_onboarding_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '30 days')
  on conflict (onboarding_id) do update
    set token_hash = excluded.token_hash,
        expires_at = excluded.expires_at;

  return v_token;
end;
$$;

-- A linha viva por trás de um token, com as recusas nomeadas.
create or replace function public._discovery_row(p_token text)
returns public.onboarding_discovery language plpgsql stable as $$
declare r public.onboarding_discovery;
begin
  select * into r from public.onboarding_discovery
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');

  if r.id is null then raise exception 'discovery_not_found'; end if;
  if r.expires_at is not null and r.expires_at < now() then raise exception 'discovery_expired'; end if;
  return r;
end;
$$;

-- O que a página mostra: perguntas do nicho, respostas de hoje, e o estado.
create or replace function public._discovery_get(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.onboarding_discovery; v_niche text; v_nome text; v_agenda text;
begin
  r := public._discovery_row(p_token);
  v_niche := public._discovery_niche(r.onboarding_id);

  select o.cliente_nome into v_nome from public.onboardings o where o.id = r.onboarding_id;
  select s.value into v_agenda from public.system_settings s where s.key = 'ONBOARDING_CALENDLY_URL';

  update public.onboarding_discovery set last_seen_at = now() where id = r.id;

  return jsonb_build_object(
    'cliente_nome', coalesce(v_nome, ''),
    'status',       r.status,
    'progress',     r.progress,
    'answers',      r.answers,
    'link_agenda',  coalesce(v_agenda, ''),
    'questions', coalesce((
      select jsonb_agg(to_jsonb(q) order by q.sort_order)
        from public.discovery_questions q
       where q.active and (q.niche_id is null or q.niche_id = v_niche)
    ), '[]'::jsonb)
  );
end;
$$;

-- Autosave parcial: mescla o que chegou sobre o que já havia.
--
-- Mesclar, e não substituir, é o que permite salvar campo a campo sem que uma
-- resposta em voo apague as outras. Chave que não existe no banco de perguntas
-- é DESCARTADA em silêncio — quem cola JSON de outra versão não corrompe a linha.
create or replace function public._discovery_save(p_token text, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.onboarding_discovery;
  v_niche text;
  v_clean jsonb := '{}'::jsonb;
  v_key text;
  v_q public.discovery_questions;
  v_out jsonb;
begin
  r := public._discovery_row(p_token);
  if r.status = 'submitted' then raise exception 'discovery_submitted'; end if;
  v_niche := public._discovery_niche(r.onboarding_id);

  for v_key in select jsonb_object_keys(p_answers) loop
    select * into v_q from public.discovery_questions q
     where q.code = v_key and q.active and (q.niche_id is null or q.niche_id = v_niche);
    if v_q.code is null then continue; end if;

    -- Opção inventada não entra. 'select_other' aceita texto livre de propósito:
    -- é o campo onde o cliente descreve o funil que não é nenhum dos nossos.
    if v_q.type = 'select'
       and jsonb_array_length(v_q.options) > 0
       and public._discovery_has_answer('select', p_answers -> v_key)
       and not exists (select 1 from jsonb_array_elements(v_q.options) o
                        where o ->> 'value' = p_answers ->> v_key) then
      raise exception 'invalid_option:%', v_key;
    end if;

    if v_q.type = 'multi'
       and jsonb_array_length(v_q.options) > 0
       and jsonb_typeof(p_answers -> v_key) = 'array'
       and exists (select 1 from jsonb_array_elements_text(p_answers -> v_key) sel
                    where not exists (select 1 from jsonb_array_elements(v_q.options) o
                                       where o ->> 'value' = sel)) then
      raise exception 'invalid_option:%', v_key;
    end if;

    v_clean := v_clean || jsonb_build_object(v_key, p_answers -> v_key);
  end loop;

  update public.onboarding_discovery
     set answers  = answers || v_clean,
         progress = public._discovery_progress(answers || v_clean, v_niche)
   where id = r.id
   returning jsonb_build_object('progress', progress, 'answers', answers) into v_out;

  return v_out;
end;
$$;

-- Enviar: exige as obrigatórias do nicho e carimba a hora.
create or replace function public._discovery_submit(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.onboarding_discovery; v_niche text; v_missing text; v_agenda text;
begin
  r := public._discovery_row(p_token);
  if r.status = 'submitted' then raise exception 'discovery_submitted'; end if;
  v_niche := public._discovery_niche(r.onboarding_id);

  select q.code into v_missing
    from public.discovery_questions q
   where q.active and q.required and (q.niche_id is null or q.niche_id = v_niche)
     and not public._discovery_has_answer(q.type, r.answers -> q.code)
   order by q.sort_order limit 1;

  if v_missing is not null then raise exception 'required:%', v_missing; end if;

  select s.value into v_agenda from public.system_settings s where s.key = 'ONBOARDING_CALENDLY_URL';

  update public.onboarding_discovery
     set status = 'submitted', submitted_at = now(),
         progress = public._discovery_progress(r.answers, v_niche)
   where id = r.id;

  return jsonb_build_object('status','submitted','link_agenda',coalesce(v_agenda,''),
                            'onboarding_id', r.onboarding_id);
end;
$$;

revoke all on function public._discovery_ensure_link(uuid) from public, anon, authenticated;
revoke all on function public._discovery_get(text)         from public, anon, authenticated;
revoke all on function public._discovery_save(text, jsonb) from public, anon, authenticated;
revoke all on function public._discovery_submit(text)      from public, anon, authenticated;
grant execute on function public._discovery_ensure_link(uuid) to service_role;
grant execute on function public._discovery_get(text)         to service_role;
grant execute on function public._discovery_save(text, jsonb) to service_role;
grant execute on function public._discovery_submit(text)      to service_role;
