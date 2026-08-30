-- ============================================================================
-- Sprint 8.5 · Fixes 4 — a proposta chegou sem link, e com "R$ .00/mês"
--
-- A mensagem que o cliente recebeu foi esta:
--
--     Investimento: R$ .00/mês
--     Válida até 31/08/2026
--     Acesse por aqui:
--
-- Duas falhas, e a mesma raiz nas duas: render_template() apaga a variável que
-- não veio. Um {{x}} sem valor não é um erro — é um buraco silencioso no texto.
--
--   1. LINK. notify_prospect() montava cliente_nome, codigo, valor_mensal,
--      valor_setup e validade — nunca 'link'. O banco não sabe em que domínio
--      o app está publicado, então nunca teve como montar, e nenhum chamador
--      passava. O {{link}} sumia e a mensagem convidava o cliente a acessar
--      o nada.
--
--   2. VALOR. to_char(0, '999G999D99') é '.00', não vazio: uma proposta com
--      preço ainda não definido virava "R$ .00/mês". O template deixa de citar
--      preço — número é assunto da proposta aberta, não do WhatsApp que a abre.
--
-- A correção do link não é só passar a variável: é fazer o envio FALHAR quando
-- ela não vier. Uma proposta sem link é uma mensagem inútil já entregue, e o
-- custo de reenviar é sempre maior que o de recusar na hora.
-- ============================================================================

update public.notification_types
   set variables = '{cliente_nome,codigo,link,validade}'
 where type = 'proposal.sent';

-- Nova mensagem: sem preço, com prazo, e com o link em linha própria — o
-- WhatsApp só transforma em link clicável o que está separado do texto ao redor.
update public.notification_types
   set template_title = 'Sua proposta está pronta',
       template_body  =
'Olá, {{cliente_nome}}! 👋

Preparei sua proposta da Solo Ventures — feita sob medida a partir do que a gente conversou.

Toque aqui para ver:
{{link}}

⏳ Ela vale até {{validade}}.

Ficou com alguma dúvida? É só responder esta mensagem que eu te explico. 🚀'
 where type = 'proposal.sent';

-- ============================================================================
-- notify_prospect() — agora exige o link
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
  'Sprint 8.4/8.5 · notifica quem ainda não é tenant — a pessoa que recebeu uma proposta. Contato vem da proposta; sem cópia in-app. proposal.sent exige p_data->>link: o banco não conhece o domínio público, e uma proposta sem link é uma mensagem perdida.';

revoke all on function public.notify_prospect(uuid, text, jsonb, text) from public, anon;
grant execute on function public.notify_prospect(uuid, text, jsonb, text) to authenticated, service_role;

-- ============================================================================
-- Provas
-- ============================================================================
do $t$
declare
  v_p uuid; v_n uuid; v_body text; v_url text;
begin
  insert into public.proposals (cliente_nome, cliente_whatsapp, monthly_price, valid_until)
  values ('__t_link__', '5511999990000', 0, date '2026-08-31')
  returning id into v_p;

  -- 1. sem link, o envio é recusado em vez de sair torto
  begin
    perform public.notify_prospect(v_p, 'proposal.sent', '{}'::jsonb, 'nolink');
    raise exception 'FALHOU: proposta sem link deveria ter sido recusada';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%proposal_link_missing%' then raise; end if;
  end;

  -- 2. com link, ele aparece no corpo — e o preço não
  v_n := public.notify_prospect(
    v_p, 'proposal.sent',
    jsonb_build_object('link', 'https://app.exemplo.com/proposta/ABC123'),
    'comlink');
  select body, action_url into v_body, v_url from public.notifications where id = v_n;

  assert v_body like '%https://app.exemplo.com/proposta/ABC123%',
    'FALHOU: link não interpolado — ' || v_body;
  assert v_body like '%31/08/2026%',
    'FALHOU: validade sumiu — ' || v_body;
  assert v_body not like '%R$%',
    'FALHOU: o valor voltou pro texto — ' || v_body;
  assert v_body not like '%{{%',
    'FALHOU: sobrou variável crua — ' || v_body;
  assert v_url = 'https://app.exemplo.com/proposta/ABC123',
    'FALHOU: action_url ficou relativa — ' || v_url;

  delete from public.proposals where id = v_p;
  raise notice 'proposal link: OK';
end $t$;
