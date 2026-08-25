-- 20260825000100_sprint85_template_crud.sql
-- Sprint 8.5 (Fixes 3, item 14) · templates viram CRUD, e o canal passa a ser
-- escolhido junto com o texto.
--
-- O QUE FALTAVA: o Sprint 8.4 deixou editar título e corpo, mas o conjunto de
-- tipos era fechado e os canais só existiam em `default_channels`, que nenhuma
-- tela tocava. Escrever a mensagem e decidir por onde ela sai são a mesma
-- decisão — separá-las obrigava a editar a tabela na mão para mudar de e-mail
-- para WhatsApp.
--
-- A LINHA QUE NÃO DÁ PARA CRUZAR: tipos embutidos não podem ser apagados. Cada
-- um deles é emitido por uma chamada de `notify()` dentro de uma edge function,
-- e `notify()` levanta `unknown_notification_type` quando o tipo some — o que
-- transformaria "apaguei um template" em "a confirmação de pagamento passou a
-- estourar". Editar o texto e os canais de um tipo embutido é livre, inclusive
-- deixá-lo sem canal nenhum, que é a forma correta de silenciá-lo.

-- ============================================================================
-- 1. EMBUTIDO vs CRIADO À MÃO
-- ============================================================================

alter table public.notification_types
  add column if not exists custom boolean not null default false;

comment on column public.notification_types.custom is
  'true = criado no painel e disparado só à mão. false = emitido por código; apagar quebraria quem o emite, então é bloqueado.';

-- Tudo que existia antes desta migration é emitido por código.
update public.notification_types set custom = false where custom is null;

-- ============================================================================
-- 2. CANAIS JUNTO COM O TEXTO
--
-- A assinatura antiga (type, title, body) é substituída por uma com canais.
-- DROP em vez de sobrecarga: duas funções com o mesmo nome e um argumento a
-- mais deixariam o chamador de 3 argumentos silenciosamente sem mexer em canal.
-- ============================================================================

drop function if exists public.admin_set_notification_template(text, text, text);

create or replace function public.admin_set_notification_template(
  p_type     text,
  p_title    text,
  p_body     text,
  p_channels text[] default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare v_row public.notification_types%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  if p_channels is not null then
    -- O dispatcher só sabe entregar estes três. Aceitar um quarto criaria
    -- entregas que ficam 'pending' para sempre.
    if exists (select 1 from unnest(p_channels) c where c not in ('in_app','email','whatsapp')) then
      raise exception 'invalid_channel' using errcode = 'P0001';
    end if;
  end if;

  update public.notification_types set
    -- Vazio limpa o template e devolve o texto ao literal do código, que é a
    -- única forma de desfazer uma personalização.
    template_title   = nullif(btrim(coalesce(p_title, '')), ''),
    template_body    = nullif(btrim(coalesce(p_body, '')), ''),
    -- Array vazio é uma escolha legítima: "grava mas não entrega".
    default_channels = coalesce(p_channels, default_channels)
  where type = p_type
  returning * into v_row;

  if not found then
    raise exception 'unknown_notification_type' using errcode = 'P0001';
  end if;
  return to_jsonb(v_row);
end;
$fn$;

comment on function public.admin_set_notification_template(text, text, text, text[]) is
  'Sprint 8.5 · edita o texto E os canais de um tipo. Canais vazios = a notificação é registrada e nunca entregue, que é como se silencia um tipo embutido sem apagá-lo.';

-- ============================================================================
-- 3. CRIAR
--
-- Um tipo criado aqui não é emitido por nada — ele existe para ser disparado à
-- mão para um cliente específico. É por isso que `custom` também governa quem
-- aparece na lista de "enviar agora" do painel.
-- ============================================================================

create or replace function public.admin_create_notification_template(
  p_type        text,
  p_description text,
  p_purpose     text default 'operacao',
  p_channels    text[] default '{in_app}',
  p_title       text default null,
  p_body        text default null,
  p_severity    text default 'info'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row  public.notification_types%rowtype;
  v_slug text;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_description), '') = '' then
    raise exception 'description_required' using errcode = 'P0001';
  end if;

  -- O tipo é uma chave, não um rótulo: minúsculas, sem espaço, com prefixo que
  -- o separa para sempre dos embutidos.
  --
  -- Transliterar ANTES de trocar o resto por "_" não é detalhe: sem isso
  -- "manutenção" vira "manuten_o", porque ç e ã não são [a-z0-9]. Feito com
  -- translate() em vez de unaccent() porque a extensão não está instalada e não
  -- vale ligá-la para uma linha.
  v_slug := lower(btrim(coalesce(nullif(p_type, ''), p_description)));
  v_slug := translate(v_slug,
                      'áàâãäéèêëíìîïóòôõöúùûüçñ',
                      'aaaaaeeeeiiiiooooouuuucn');
  v_slug := 'custom.' || regexp_replace(v_slug, '[^a-z0-9]+', '_', 'g');
  v_slug := btrim(v_slug, '_');

  if exists (select 1 from public.notification_types where type = v_slug) then
    raise exception 'template_already_exists' using errcode = 'P0001';
  end if;
  if p_purpose not in ('comercial','financeiro','suporte','operacao') then
    raise exception 'unknown_purpose' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(coalesce(p_channels, '{}')) c
              where c not in ('in_app','email','whatsapp')) then
    raise exception 'invalid_channel' using errcode = 'P0001';
  end if;

  insert into public.notification_types
    (type, default_severity, default_channels, audience, description, purpose,
     template_title, template_body, custom, variables)
  values
    (v_slug, coalesce(p_severity, 'info'), coalesce(p_channels, '{in_app}'),
     'tenant', btrim(p_description), p_purpose,
     nullif(btrim(coalesce(p_title, '')), ''),
     nullif(btrim(coalesce(p_body, '')), ''),
     true,
     -- Um template manual interpola o que o painel sabe sobre a equipe.
     '{equipe_nome,saldo_whatsapp,saldo_copilot}')
  returning * into v_row;

  return to_jsonb(v_row);
end;
$fn$;

-- ============================================================================
-- 4. APAGAR — só os criados à mão
-- ============================================================================

create or replace function public.admin_delete_notification_template(p_type text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare v_row public.notification_types%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select * into v_row from public.notification_types where type = p_type;
  if not found then
    raise exception 'unknown_notification_type' using errcode = 'P0001';
  end if;
  if not v_row.custom then
    -- Este é o guard-rail inteiro do item 14.
    raise exception 'builtin_template' using errcode = 'P0001';
  end if;

  -- notification_policies referencia o tipo com ON DELETE CASCADE, então as
  -- regras por cliente desaparecem junto — o que é o certo: elas descreviam um
  -- tipo que deixou de existir.
  delete from public.notification_types where type = p_type;
  return jsonb_build_object('type', p_type, 'deleted', true);
end;
$fn$;

do $$
declare v_sig text;
begin
  foreach v_sig in array array[
    'public.admin_set_notification_template(text, text, text, text[])',
    'public.admin_create_notification_template(text, text, text, text[], text, text, text)',
    'public.admin_delete_notification_template(text)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_sig);
    execute format('grant execute on function %s to authenticated, service_role', v_sig);
  end loop;
end $$;

-- ============================================================================
-- 5. ASSERTIONS
-- ============================================================================

do $$
declare
  v_admin uuid; v_e uuid; v_r jsonb; v_txt text; v_cnt integer; v_arr text[]; v_n uuid;
begin
  select user_id into v_admin from public.profiles where role = 'super_admin' limit 1;

  -- (a) gates primeiro, sem impersonar ninguém
  begin
    perform public.admin_create_notification_template('x', 'X', 'operacao', '{in_app}', null, null, 'info');
    raise exception 'ASSERT FAILED: create rodou sem super admin';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_txt = message_text;
    assert v_txt = 'forbidden', format('ASSERT FAILED: esperado forbidden, veio %s', v_txt);
  end;
  assert not has_function_privilege('anon',
    'public.admin_delete_notification_template(text)', 'execute'),
    'ASSERT FAILED: anon pode apagar template';

  if v_admin is null then
    raise notice 'Sprint 8.5: sem super admin no banco, asserções de comportamento puladas';
    return;
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  insert into public.equipes (nome, crm_link, suporte_link)
  values ('__t85_tpl__','x','x') returning id into v_e;

  -- (b) O GUARD-RAIL: um tipo embutido não pode ser apagado, porque há código
  --     emitindo ele e notify() levantaria unknown_notification_type.
  begin
    perform public.admin_delete_notification_template('invoice.paid');
    raise exception 'ASSERT FAILED: um tipo embutido foi apagado';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_txt = message_text;
    assert v_txt = 'builtin_template',
      format('ASSERT FAILED: esperado builtin_template, veio %s', v_txt);
  end;
  assert exists (select 1 from public.notification_types where type = 'invoice.paid'),
    'ASSERT FAILED: invoice.paid sumiu';

  -- (c) canais agora vêm junto com o texto
  v_r := public.admin_set_notification_template('invoice.paid', 'Pago', 'Corpo', '{email}');
  select default_channels into v_arr from public.notification_types where type = 'invoice.paid';
  assert v_arr = '{email}', format('ASSERT FAILED: canais não gravaram, veio %s', v_arr);

  -- (d) "nada" é uma escolha: registra e não entrega
  perform public.admin_set_notification_template('invoice.paid', 'Pago', 'Corpo', '{}');
  v_n := public.notify(v_e, 'invoice.paid', 'x', 'y', '/z', '{}'::jsonb, 'tpl1');
  assert v_n is not null, 'ASSERT FAILED: sem canal deveria registrar a notificação';
  select count(*) into v_cnt from public.notification_deliveries where notification_id = v_n;
  assert v_cnt = 0, 'ASSERT FAILED: canal vazio ainda enfileirou entrega';

  -- canal inválido é recusado em vez de virar entrega eterna em 'pending'
  begin
    perform public.admin_set_notification_template('invoice.paid', 'x', 'y', '{sms}');
    raise exception 'ASSERT FAILED: canal inválido foi aceito';
  exception when sqlstate 'P0001' then null;
  end;

  -- devolve invoice.paid ao que era
  perform public.admin_set_notification_template('invoice.paid', '', '', '{in_app,email}');

  -- (e) CRIAR: vira um tipo com prefixo próprio e marcado como custom
  v_r := public.admin_create_notification_template(
    null, 'Aviso de manutenção', 'operacao', '{in_app,whatsapp}', 'Manutenção', 'Oi {{equipe_nome}}', 'warn');
  v_txt := v_r->>'type';
  assert v_txt = 'custom.aviso_de_manutencao',
    format('ASSERT FAILED: slug inesperado %s', v_txt);
  assert (v_r->>'custom')::boolean, 'ASSERT FAILED: o tipo criado não é custom';

  -- ...e funciona de verdade como notificação
  v_n := public.notify(v_e, v_txt, 'ignorado', 'ignorado', '/x',
                       jsonb_build_object('equipe_nome','ACME'), 'tpl2');
  assert v_n is not null, 'ASSERT FAILED: o tipo criado não emitiu';
  assert (select body from public.notifications where id = v_n) = 'Oi ACME',
    'ASSERT FAILED: o template do tipo criado não interpolou';

  -- (f) nome duplicado é recusado
  begin
    perform public.admin_create_notification_template(
      null, 'Aviso de manutenção', 'operacao', '{in_app}', null, null, 'info');
    raise exception 'ASSERT FAILED: criou template duplicado';
  exception when sqlstate 'P0001' then null;
  end;

  -- (g) APAGAR: o criado à mão vai embora, e leva as políticas dele junto
  insert into public.notification_policies (equipe_id, type, enabled)
  values (v_e, v_txt, false);
  v_r := public.admin_delete_notification_template(v_txt);
  assert (v_r->>'deleted')::boolean, 'ASSERT FAILED: não apagou o template criado';
  select count(*) into v_cnt from public.notification_policies where type = v_txt;
  assert v_cnt = 0, 'ASSERT FAILED: sobrou política órfã apontando para um tipo que não existe';

  delete from public.equipes where id = v_e;
  raise notice 'Sprint 8.5 template CRUD assertions passed';
end $$;
