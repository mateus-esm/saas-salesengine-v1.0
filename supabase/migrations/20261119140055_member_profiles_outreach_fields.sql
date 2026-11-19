alter table public.profiles add column contact_email text, add column photo text;

create or replace function public.team_access_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_equipe uuid;
begin
  select p.equipe_id into v_equipe from public.profiles p where p.user_id = auth.uid();
  if v_equipe is null then
    raise exception 'no_team' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.user_roles ur
     where ur.user_id = auth.uid() and ur.role::text in ('owner', 'super_admin')
  ) then
    raise exception 'owner_only' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'equipe_id', v_equipe,
    'seats', public.tenant_seat_usage(v_equipe),
    'members', coalesce((
      select jsonb_agg(m order by m->>'nome_completo')
      from (
        select jsonb_build_object(
          'user_id', p.user_id,
          'email', p.email,
          'profile_name', p.nome_completo,
          'contact_email', p.contact_email,
          'telefone', p.telefone,
          'photo', p.photo,
          'nome_completo', coalesce(nullif(trim(p.nome_completo), ''), split_part(p.email, '@', 1)),
          'role', coalesce((
            select ur.role::text from public.user_roles ur
             where ur.user_id = p.user_id
             order by case ur.role::text
               when 'super_admin' then 4 when 'owner' then 3 when 'admin' then 2 else 1 end desc
             limit 1), 'user'),
          'access_status', p.access_status,
          'last_sign_in_at', u.last_sign_in_at,
          'is_me', p.user_id = auth.uid()
        ) as m
        from public.profiles p
        left join auth.users u on u.id = p.user_id
        where p.equipe_id = v_equipe
      ) q
    ), '[]'::jsonb)
  );
end;
$fn$;

create function public.edit_member_profile(member_id uuid, changes jsonb, original jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  caller profiles;
  target profiles;
  k text;
  v text;
begin
  select * into caller from profiles where user_id=auth.uid() and access_status='active';
  if caller.user_id is null or caller.equipe_id is null then raise exception 'Sem acesso' using errcode='42501'; end if;
  if member_id is distinct from caller.user_id and not exists (
    select 1 from user_roles where user_id=caller.user_id and role::text in ('owner','super_admin')
  ) then raise exception 'Sem permissão' using errcode='42501'; end if;
  select * into target from profiles where user_id=member_id and equipe_id=caller.equipe_id for update;
  if not found then raise exception 'Perfil indisponível'; end if;
  for k,v in select * from jsonb_each_text(changes) loop
    if k not in ('nome_completo','telefone','contact_email','photo') then raise exception 'Campo inválido'; end if;
    if not (original ? k) or (to_jsonb(target)->k) is distinct from (original->k) then
      raise exception 'O perfil mudou. Feche e abra novamente para revisar.';
    end if;
    if k='nome_completo' and (coalesce(btrim(v),'')='' or length(v)>160) then raise exception 'Nome inválido'; end if;
    if k='telefone' and v is not null and (v !~ '^[+0-9() .-]+$' or length(regexp_replace(v,'[^0-9]','','g')) not between 10 and 15) then raise exception 'Telefone inválido'; end if;
    if k='contact_email' and v is not null and (length(v)>254 or v !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'E-mail inválido'; end if;
    if k='photo' and v is not null and (length(v)>90000 or v !~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]+=*$') then raise exception 'Foto inválida'; end if;
  end loop;
  update profiles set nome_completo=case when changes?'nome_completo' then btrim(changes->>'nome_completo') else nome_completo end,
    telefone=case when changes?'telefone' then changes->>'telefone' else telefone end,
    contact_email=case when changes?'contact_email' then changes->>'contact_email' else contact_email end,
    photo=case when changes?'photo' then changes->>'photo' else photo end where id=target.id;
end $$;
revoke all on function public.edit_member_profile(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.edit_member_profile(uuid,jsonb,jsonb) to authenticated;

create function public.crm_message_fields(deal uuid, payload jsonb) returns jsonb
language sql stable set search_path=public as $$
  with data as (select payload->'data' as d),
  items as (
    select case when jsonb_typeof(d#>'{onboarding,proposal,campos,itens}')='array'
                  and d#>'{onboarding,proposal,campos,itens}' <> '[]'::jsonb
                then d#>'{onboarding,proposal,campos,itens}' else d->'itens' end as list,
           coalesce(nullif(d#>>'{onboarding,value}',''), d->>'valor_da_oportunidade') as price
    from data
  )
  select jsonb_build_object(
    'canal', coalesce(c.acquisition_channel,'Não informado'),
    'canal_contato', coalesce(c.contact_channel,'Não informado'),
    'email_responsavel', coalesce(p.contact_email,p.email,'Não informado'),
    'telefone_responsavel', coalesce(nullif(p.telefone,''),'Não informado'),
    'produto', coalesce((select string_agg(x->>'name', ', ' order by n) from jsonb_array_elements(list) with ordinality t(x,n) where nullif(btrim(x->>'name'),'') is not null), 'Não informado'),
    'preco', case when price ~ '^-?[0-9]+([.][0-9]+)?$' then 'R$ '||translate(to_char(price::numeric,'FM999,999,999,999,999,990.00'),',.','.,') else 'Não informado' end,
    'sla', case when s.max_idle_hours>0 then s.max_idle_hours::text||' h' else 'Sem SLA' end,
    'touchpoints', (select count(*) from touchpoints t where t.lead_id=o.lead_id),
    'ultimo_touchpoint', coalesce((select to_char(t.contact_date::date,'DD/MM/YYYY') from touchpoints t where t.lead_id=o.lead_id order by t.contact_date desc nulls last limit 1),'Sem registro')
  ) from opportunities o cross join items left join pipeline_stages_v2 s on s.id=o.stage_id
  left join profiles p on p.id=o.owner_id and p.equipe_id=o.equipe_id
  left join v_lead_channel c on c.lead_id=o.lead_id and c.equipe_id=o.equipe_id where o.id=deal;
$$;
revoke all on function public.crm_message_fields(uuid,jsonb) from public,anon,authenticated;

-- Preview the same scalar fields that the editor offers. Never expose the raw contract.
create function public.preview_outreach_win(event_id uuid, message text) returns text
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare team uuid; deal uuid; payload jsonb; d jsonb;
begin
  select p.equipe_id into team from profiles p where p.user_id=auth.uid() and p.access_status='active'
    and exists(select 1 from user_roles r where r.user_id=p.user_id and r.role::text in ('admin','owner','super_admin'));
  if team is null then raise exception 'Prévia de venda disponível para administradores' using errcode='42501'; end if;
  if event_id is not null and not exists(select 1 from webhook_configs c where c.equipe_id=team and c.id=event_id
    and c.trigger_event='outreach_event:'||c.id) then raise exception 'Evento indisponível'; end if;
  select o.id into deal from opportunities o join pipeline_stages_v2 s on s.id=o.stage_id and s.stage_type='won'
    where o.equipe_id=team and o.deleted_at is null
    order by exists(select 1 from crm_workflows w where w.equipe_id=team and w.trigger_id=s.id::text and event_id=any(w.action_ids)) desc,
      o.closed_at desc nulls last,o.created_at desc,o.id limit 1;
  if deal is null then raise exception 'Nenhuma venda ganha para a prévia'; end if;
  payload := _crm_deal_won_payload(deal,auth.uid());
  d := payload->'data';
  select coalesce(jsonb_object_agg(key,value),'{}') into d from jsonb_each(d)
    where key in ('name','telefone','valor_da_oportunidade','estagio','fonte','data_de_fechamento');
  d := d || jsonb_build_object('responsavel',jsonb_build_object('name',payload#>'{data,responsavel,name}'),
    'pipeline',jsonb_build_object('name',payload#>'{data,pipeline,name}'),'mensagem',crm_message_fields(deal,payload));
  return render_webhook_payload(to_jsonb(message),jsonb_build_object('payload',jsonb_build_object('data',d))) #>> '{}';
end $$;
revoke all on function public.preview_outreach_win(uuid,text) from public,anon;
grant execute on function public.preview_outreach_win(uuid,text) to authenticated;

create or replace function public.dispatch_crm_workflows() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  kind text;
  trigger_key text;
  event_key text;
  deal uuid;
  payload jsonb;
  context jsonb;
  outreach_context jsonb;
  workflow crm_workflows;
  action_id uuid;
  hook webhook_configs;
  recipient text;
  run uuid;
  sent integer;
begin
  if tg_table_name='opportunities' then
    kind := 'stage_entered'; trigger_key := new.stage_id::text; deal := new.id;
    event_key := new.stage_id::text||':'||txid_current();
  else
    kind := 'button_clicked'; trigger_key := new.action_id; event_key := new.id::text;
    select opportunity_id into deal from custom_table_records where id=new.record_id and equipe_id=new.equipe_id and deleted_at is null;
  end if;
  if deal is null then return new; end if;
  for workflow in select * from crm_workflows where equipe_id=new.equipe_id and enabled and event=kind and trigger_id=trigger_key loop
    foreach action_id in array workflow.action_ids loop
      insert into automation_runs(equipe_id,opportunity_id,event_key,input)
      values(new.equipe_id,deal,'workflow:'||workflow.id||':'||action_id||':'||event_key,
             jsonb_build_object('workflow',workflow.name,'workflow_id',workflow.id,'action_id',action_id))
      on conflict do nothing returning id into run;
      if run is null then continue; end if;
      begin
        select * into strict hook from webhook_configs c where c.id=action_id and c.equipe_id=new.equipe_id
          and c.inbound_function is null and c.trigger_event in ('stage_entered:'||c.id,'automation:'||c.id,'outreach_event:'||c.id);
        if not hook.active then
          update automation_runs set status='skipped',error='action_disabled' where id=run;
          continue;
        end if;
        if payload is null then
          select public._crm_deal_won_payload(o.id,auth.uid()) into strict payload from opportunities o
            where o.id=deal and o.equipe_id=new.equipe_id and o.deleted_at is null;
          -- Only a won stage gets the legacy deal_won envelope expected by Solo Pro.
          if kind='button_clicked' or not exists(select 1 from pipeline_stages_v2 s where s.id::text=trigger_key and s.stage_type='won') then
            payload := (payload-'button') || jsonb_build_object('event',kind);
          end if;
          context := jsonb_build_object('payload',payload,'event',kind,'created_at',now(),
                                        'opportunity',jsonb_build_object('id',deal));
        end if;
        sent := 0;
        if starts_with(hook.trigger_event,'outreach_event:') then
          if outreach_context is null then
            outreach_context := jsonb_set(context, '{payload,data}', (payload->'data') ||
              jsonb_build_object('mensagem', public.crm_message_fields(deal,payload)));
          end if;
          for recipient in
            with candidates(phone, international) as (
              select jsonb_array_elements_text(hook.outreach_recipients->'phones'), true
              union all select telefone, false from profiles where equipe_id=new.equipe_id and access_status='active' and user_id is not null and (hook.outreach_recipients->>'team')::boolean
              union all select payload#>>'{data,telefone}', false where (hook.outreach_recipients->>'lead')::boolean
            ), digits as (select regexp_replace(phone,'[^0-9]','','g') n, international or ltrim(phone) like '+%' as has_ddi from candidates)
            select distinct case when not has_ddi and length(n) in (10,11) then '55'||n else n end from digits where length(n) between 10 and 15
          loop
            perform enqueue_crm_webhooks(new.equipe_id,hook.trigger_event,outreach_context||jsonb_build_object('recipient',recipient));
            sent := sent+1;
          end loop;
          if sent=0 then raise exception 'Nenhum destinatário com telefone'; end if;
        else
          perform enqueue_crm_webhooks(new.equipe_id,hook.trigger_event,context);
        end if;
        update automation_runs set status='ok' where id=run;
      exception when others then
        update automation_runs set status='error',error=left(sqlerrm,500) where id=run;
      end;
    end loop;
  end loop;
  return new;
end $$;
