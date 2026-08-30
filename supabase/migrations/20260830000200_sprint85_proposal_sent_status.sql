-- ============================================================================
-- Sprint 8.5 · Fixes 4 — "consertei o texto e mesmo assim não enviou"
--
-- Não era o texto. Era isto: enviar uma proposta nunca a tirava de 'rascunho'.
--
-- O botão do painel decide se é envio ou reenvio olhando o status:
--
--     sendProposal(p, p.status !== "rascunho")
--
-- e a chave de dedup vem daí — 'sent' fixa no primeiro envio, 'sent_<agora>'
-- no reenvio. Como o status ficava em 'rascunho' para sempre, TODO clique era
-- tratado como primeiro envio, com a mesma chave 'sent'. O índice único
-- (proposal_id, type, dedup_key) barrava o segundo, notify_prospect devolvia
-- null, e o painel dizia "Esta proposta já foi enviada. Use reenviar" — sendo
-- que reenviar era exatamente o que o botão achava que NÃO estava fazendo.
--
-- Resultado: cada proposta podia ser enviada uma única vez na vida, e as seis
-- que saíram hoje 11:33 com o texto quebrado ficaram trancadas. Consertar o
-- template não adiantou nada porque nenhuma mensagem nova chegou a ser criada.
--
-- A correção mora dentro de notify_prospect(), na mesma transação que insere a
-- notificação, e não no chamador: "a mensagem saiu" e "a proposta não é mais
-- rascunho" são o mesmo fato, e o jeito de eles divergirem de novo é alguém
-- lembrar de fazer os dois.
-- ============================================================================

create or replace function public.notify_prospect(
  p_proposal_id uuid,
  p_type        text,
  p_data        jsonb default '{}'::jsonb,
  p_dedup_key   text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_type public.notification_types%rowtype;
  v_p    public.proposals%rowtype;
  v_id   uuid;
  v_ch   text;
  v_data jsonb;
  v_link text;
begin
  select * into v_type from public.notification_types where type = p_type;
  if not found then
    raise exception 'unknown_notification_type: %', p_type using errcode = 'P0001';
  end if;

  select * into v_p from public.proposals where id = p_proposal_id;
  if not found then
    raise exception 'proposal_not_found' using errcode = 'P0001';
  end if;

  -- Quem chama sabe em que domínio o app está publicado; o banco não. Sem isso
  -- a mensagem sai com um "toque aqui para ver" que não leva a lugar nenhum, e
  -- é melhor recusar o envio do que gastar a única chance de causar boa
  -- impressão.
  v_link := nullif(trim(coalesce(p_data->>'link', '')), '');
  if v_link is null and p_type = 'proposal.sent' then
    raise exception 'proposal_link_missing' using errcode = 'P0001';
  end if;

  -- Tudo que um template pode interpolar, sob o que veio de fora: valor
  -- explícito do chamador sempre vence.
  v_data := jsonb_build_object(
    'cliente_nome', v_p.cliente_nome,
    'codigo', v_p.codigo,
    'valor_mensal', trim(to_char(v_p.monthly_price, '999G999D99')),
    'valor_setup', case when coalesce(v_p.setup_price, 0) > 0 and not v_p.setup_waived
                        then format(' + setup de R$ %s', trim(to_char(v_p.setup_price, '999G999D99')))
                        else '' end,
    'validade', coalesce(to_char(v_p.valid_until, 'DD/MM/YYYY'), 'a combinar')
  ) || coalesce(p_data, '{}'::jsonb);

  insert into public.notifications (
    equipe_id, proposal_id, type, severity, title, body, action_url, data, dedup_key,
    recipient_phone, recipient_email
  )
  values (
    null, p_proposal_id, p_type, v_type.default_severity,
    public.render_template(coalesce(v_type.template_title, 'Sua proposta'), v_data),
    public.render_template(coalesce(v_type.template_body, ''), v_data),
    coalesce(v_link, '/proposta/' || v_p.codigo),
    v_data, p_dedup_key,
    v_p.cliente_whatsapp, v_p.cliente_email
  )
  on conflict (proposal_id, type, dedup_key) where dedup_key is not null and proposal_id is not null
  do nothing
  returning id into v_id;

  if v_id is null then
    return null;
  end if;

  -- A proposta deixou de ser rascunho no instante em que a mensagem existiu.
  -- Só sobe de 'rascunho': 'vista', 'aceita' e 'recusada' são fatos posteriores
  -- e um reenvio não pode apagá-los.
  if p_type = 'proposal.sent' and v_p.status = 'rascunho' then
    update public.proposals
       set status = 'enviada',
           sent_at = coalesce(sent_at, now()),
           updated_at = now()
     where id = p_proposal_id and status = 'rascunho';
  end if;

  -- Sem in-app: não há ninguém logado para ler.
  foreach v_ch in array v_type.default_channels loop
    if v_ch = 'in_app' then continue; end if;
    -- ...e nem adianta enfileirar um canal para o qual não temos endereço.
    if v_ch = 'whatsapp' and coalesce(v_p.cliente_whatsapp, '') = '' then continue; end if;
    if v_ch = 'email'    and coalesce(v_p.cliente_email, '')    = '' then continue; end if;
    insert into public.notification_deliveries (notification_id, channel)
    values (v_id, v_ch)
    on conflict (notification_id, channel) do nothing;
  end loop;

  return v_id;
end;
$fn$;

comment on function public.notify_prospect(uuid, text, jsonb, text) is
  'Sprint 8.4/8.5 · notifica quem ainda não é tenant. proposal.sent exige p_data->>link (o banco não conhece o domínio público) e promove a proposta de rascunho para enviada na mesma transação — status e mensagem são o mesmo fato.';

revoke all on function public.notify_prospect(uuid, text, jsonb, text) from public, anon;
grant execute on function public.notify_prospect(uuid, text, jsonb, text) to authenticated, service_role;

-- ============================================================================
-- Reparo: destrancar as propostas que já foram enviadas
--
-- Elas têm notificação com entrega 'sent' — a mensagem chegou no celular do
-- cliente, torta, mas chegou. Ficaram em 'rascunho' só por causa do bug acima,
-- e enquanto estiverem assim o botão continua mandando a chave 'sent' e o
-- reenvio continua sendo engolido. Marcá-las como enviadas registra o que de
-- fato aconteceu e devolve o botão de reenviar.
-- ============================================================================

update public.proposals p
   set status = 'enviada',
       sent_at = coalesce(p.sent_at, n.created_at),
       updated_at = now()
  from (
    select proposal_id, min(created_at) as created_at
      from public.notifications
     where type = 'proposal.sent' and proposal_id is not null
     group by proposal_id
  ) n
 where n.proposal_id = p.id
   and p.status = 'rascunho';

-- ============================================================================
-- Provas
-- ============================================================================
do $t$
declare
  v_p uuid; v_n1 uuid; v_n2 uuid; v_st text; v_sent timestamptz; v_cnt integer;
begin
  insert into public.proposals (cliente_nome, cliente_whatsapp, monthly_price, valid_until)
  values ('__t_status__', '5511999990000', 0, date '2026-08-31')
  returning id into v_p;

  -- 1. o primeiro envio promove o rascunho
  v_n1 := public.notify_prospect(v_p, 'proposal.sent',
            jsonb_build_object('link', 'https://x.test/proposta/A'), 'sent');
  assert v_n1 is not null, 'FALHOU: primeiro envio não criou notificação';
  select status, sent_at into v_st, v_sent from public.proposals where id = v_p;
  assert v_st = 'enviada', 'FALHOU: a proposta continuou rascunho depois do envio — ' || v_st;
  assert v_sent is not null, 'FALHOU: sent_at ficou nulo';

  -- 2. ...e por isso o reenvio (chave nova) passa, que era o que estava travado
  v_n2 := public.notify_prospect(v_p, 'proposal.sent',
            jsonb_build_object('link', 'https://x.test/proposta/A'), 'sent_2');
  assert v_n2 is not null, 'FALHOU: o reenvio foi engolido';
  assert v_n2 <> v_n1, 'FALHOU: o reenvio devolveu a notificação antiga';

  -- 3. a mesma chave continua barrada — o dedup não foi desligado
  assert public.notify_prospect(v_p, 'proposal.sent',
           jsonb_build_object('link', 'https://x.test/proposta/A'), 'sent') is null,
    'FALHOU: a mesma chave de dedup passou duas vezes';

  -- 4. um reenvio não rebaixa um status posterior
  update public.proposals set status = 'aceita' where id = v_p;
  perform public.notify_prospect(v_p, 'proposal.sent',
            jsonb_build_object('link', 'https://x.test/proposta/A'), 'sent_3');
  select status into v_st from public.proposals where id = v_p;
  assert v_st = 'aceita', 'FALHOU: o reenvio rebaixou uma proposta aceita para enviada';

  delete from public.proposals where id = v_p;

  -- 5. o reparo não deixou nenhuma proposta já enviada presa em rascunho
  select count(*) into v_cnt
    from public.proposals p
   where p.status = 'rascunho'
     and exists (select 1 from public.notifications n
                  where n.proposal_id = p.id and n.type = 'proposal.sent');
  assert v_cnt = 0, format('FALHOU: %s proposta(s) enviada(s) ainda em rascunho', v_cnt);

  raise notice 'proposal sent status: OK';
end $t$;
