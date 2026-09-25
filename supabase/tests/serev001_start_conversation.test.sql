-- SE-REV-001 — teste funcional do esquema de abertura de conversa.
--
-- O que importa aqui é UMA coisa: a idempotência não pode depender do código da
-- edge function. Se a trava for só um `if` em TypeScript, duas chamadas
-- simultâneas passam pelo `if` juntas e o lead recebe duas mensagens. Por isso a
-- trava é UNIQUE (equipe_id, event_key) no banco, e é isso que o TEST 1 prova.
--
-- Rodar: bash scripts/sqltest.sh supabase/tests/serev001_start_conversation.test.sql
\set ON_ERROR_STOP on

begin;

-- @include supabase/migrations/20260925000100_serev001_start_conversation.sql

insert into public.equipes (id, nome, crm_link, suporte_link)
values ('5e000000-0000-0000-0000-000000000001', 'Teste SE-REV-001', 'x', 'y');

insert into public.leads (id, equipe_id, name, phone)
values ('5e000000-0000-0000-0000-0000000000a1','5e000000-0000-0000-0000-000000000001',
        'Lead do anúncio', '5511987654321');

-- =========================================================================
-- TEST 1 — o mesmo evento, duas vezes, é UMA conversa.
-- =========================================================================
insert into public.conversation_open_events (equipe_id, lead_id, event_key, status)
values ('5e000000-0000-0000-0000-000000000001','5e000000-0000-0000-0000-0000000000a1',
        'lead:5e000000-0000-0000-0000-0000000000a1','opened');

do $$
declare v_violou boolean := false;
begin
  begin
    insert into public.conversation_open_events (equipe_id, lead_id, event_key, status)
    values ('5e000000-0000-0000-0000-000000000001','5e000000-0000-0000-0000-0000000000a1',
            'lead:5e000000-0000-0000-0000-0000000000a1','pending');
  exception when unique_violation then
    v_violou := true;
  end;
  assert v_violou,
    'REV-T1 FAIL: o reenvio do mesmo evento foi aceito — abriria uma segunda conversa';
  assert (select count(*) from public.conversation_open_events
           where event_key = 'lead:5e000000-0000-0000-0000-0000000000a1') = 1,
    'REV-T1 FAIL: sobrou mais de uma linha para o mesmo evento';
  raise notice 'REV-T1 ok — o banco recusa a segunda abertura do mesmo evento';
end $$;

-- =========================================================================
-- TEST 2 — a trava é por evento, não por lead em geral: uma chave explícita
-- diferente (outro disparo legítimo, mais tarde) continua passando.
-- =========================================================================
do $$
begin
  insert into public.conversation_open_events (equipe_id, lead_id, event_key, status, trigger_source)
  values ('5e000000-0000-0000-0000-000000000001','5e000000-0000-0000-0000-0000000000a1',
          'n8n-exec-7781','opened','http');
  assert (select count(*) from public.conversation_open_events
           where lead_id = '5e000000-0000-0000-0000-0000000000a1') = 2,
    'REV-T2 FAIL: chave de evento distinta deveria conviver com a anterior';
  raise notice 'REV-T2 ok — chave explícita do chamador é independente da chave por lead';
end $$;

-- =========================================================================
-- TEST 3 — a mesma chave em OUTRO tenant não colide. Multi-tenant: o n8n de um
-- cliente nunca pode bloquear a abertura de conversa de outro.
-- =========================================================================
insert into public.equipes (id, nome, crm_link, suporte_link)
values ('5e000000-0000-0000-0000-000000000002', 'Outro tenant', 'x', 'y');
insert into public.leads (id, equipe_id, name, phone)
values ('5e000000-0000-0000-0000-0000000000a2','5e000000-0000-0000-0000-000000000002',
        'Lead do outro tenant', '5511911112222');

do $$
begin
  insert into public.conversation_open_events (equipe_id, lead_id, event_key, status)
  values ('5e000000-0000-0000-0000-000000000002','5e000000-0000-0000-0000-0000000000a2',
          'n8n-exec-7781','opened');
  assert (select count(*) from public.conversation_open_events where event_key = 'n8n-exec-7781') = 2,
    'REV-T3 FAIL: a chave de um tenant vazou para o outro';
  raise notice 'REV-T3 ok — a idempotência é por tenant';
end $$;

-- =========================================================================
-- TEST 4 — estado inválido não entra. 'sent', 'ok', 'erro' são as invenções
-- prováveis de quem escrever o próximo chamador.
-- =========================================================================
do $$
declare v_recusou boolean := false;
begin
  begin
    insert into public.conversation_open_events (equipe_id, lead_id, event_key, status)
    values ('5e000000-0000-0000-0000-000000000001','5e000000-0000-0000-0000-0000000000a1',
            'estado-invalido','sent');
  exception when check_violation then
    v_recusou := true;
  end;
  assert v_recusou, 'REV-T4 FAIL: status fora do domínio foi aceito';
  raise notice 'REV-T4 ok — status é um domínio fechado';
end $$;

-- =========================================================================
-- TEST 5 — a configuração nasce DESLIGADA e sem filtro de source.
-- Ligar significa mandar mensagem para quem acabou de se cadastrar: é decisão
-- do tenant, nunca um default nosso.
-- =========================================================================
insert into public.conversation_opener_settings (equipe_id)
values ('5e000000-0000-0000-0000-000000000001');

do $$
declare v_enabled boolean; v_sources text[]; v_channel text;
begin
  select enabled, trigger_sources, channel_id into v_enabled, v_sources, v_channel
    from public.conversation_opener_settings
   where equipe_id = '5e000000-0000-0000-0000-000000000001';
  assert v_enabled = false, 'REV-T5 FAIL: o recurso nasceu ligado';
  assert v_sources = '{}'::text[], 'REV-T5 FAIL: trigger_sources deveria nascer vazio';
  assert v_channel is null, 'REV-T5 FAIL: não pode haver canal padrão — nada de valor fixo de cliente';
  raise notice 'REV-T5 ok — configuração nasce desligada, sem canal e sem filtro';
end $$;

-- =========================================================================
-- TEST 6 — um tenant, uma configuração. Duas linhas para a mesma equipe
-- deixariam "qual canal abre a conversa?" sem resposta única.
-- =========================================================================
do $$
declare v_violou boolean := false;
begin
  begin
    insert into public.conversation_opener_settings (equipe_id, enabled)
    values ('5e000000-0000-0000-0000-000000000001', true);
  exception when unique_violation then
    v_violou := true;
  end;
  assert v_violou, 'REV-T6 FAIL: o tenant aceitou duas configurações';
  raise notice 'REV-T6 ok — uma configuração por tenant';
end $$;

-- =========================================================================
-- TEST 7 — o rastro guarda o identificador do provider e a conversa sabe que
-- foi aberta por nós. É sobre estas duas colunas que a cadência futura vai ser
-- construída: "aberta às 14h02, lead não respondeu".
-- =========================================================================
insert into public.conversations (id, lead_id, equipe_id, channel, status,
                                  gpt_maker_chat_id, opened_at, opened_via, provider_channel_id)
values ('5e000000-0000-0000-0000-0000000000c1','5e000000-0000-0000-0000-0000000000a1',
        '5e000000-0000-0000-0000-000000000001','whatsapp','active',
        'CHAT-PROVIDER-1', now(), 'start_conversation', 'CANAL-1');

update public.conversation_open_events
   set conversation_id = '5e000000-0000-0000-0000-0000000000c1',
       provider_chat_id = 'CHAT-PROVIDER-1',
       provider_response = '{"chatId":"CHAT-PROVIDER-1"}'::jsonb,
       provider_status = 200,
       channel_id = 'CANAL-1',
       channel_type = 'WHATSAPP',
       opened_at = now()
 where event_key = 'lead:5e000000-0000-0000-0000-0000000000a1';

do $$
declare v_chat text; v_via text; v_resp jsonb;
begin
  select e.provider_chat_id, c.opened_via, e.provider_response
    into v_chat, v_via, v_resp
    from public.conversation_open_events e
    join public.conversations c on c.id = e.conversation_id
   where e.event_key = 'lead:5e000000-0000-0000-0000-0000000000a1';
  assert v_chat = 'CHAT-PROVIDER-1', 'REV-T7 FAIL: o id do provider não ficou consultável';
  assert v_via = 'start_conversation', 'REV-T7 FAIL: a conversa não registrou que nós a abrimos';
  assert v_resp ->> 'chatId' = 'CHAT-PROVIDER-1', 'REV-T7 FAIL: o corpo cru do provider não foi guardado';
  raise notice 'REV-T7 ok — identificador do provider e origem da conversa são consultáveis';
end $$;

-- =========================================================================
-- TEST 8 — uma conversa apagada não deixa o rastro pendurado, e o rastro não
-- impede apagar a conversa (ON DELETE SET NULL). O histórico de "tentamos abrir"
-- é o que a cadência precisa, mesmo sem a conversa.
-- =========================================================================
delete from public.conversations where id = '5e000000-0000-0000-0000-0000000000c1';

do $$
begin
  assert (select count(*) from public.conversation_open_events
           where event_key = 'lead:5e000000-0000-0000-0000-0000000000a1'
             and conversation_id is null) = 1,
    'REV-T8 FAIL: apagar a conversa deveria apenas soltar a referência no rastro';
  raise notice 'REV-T8 ok — o rastro sobrevive à conversa';
end $$;

-- =========================================================================
-- TEST 9 — reassumir uma tentativa falhada é exclusivo.
--
-- Uma abertura que falhou (provider fora do ar) precisa poder ser tentada de
-- novo, senão o lead fica sem conversa para sempre. Mas duas chamadas não podem
-- reassumir a MESMA linha, ou as duas falam com o provider e o lead recebe duas
-- mensagens. A garantia é o UPDATE condicionado ao status atual — quem chega
-- depois afeta zero linhas e desiste. É o que a edge function faz em
-- claimEvent(): .eq('id', …).eq('status', <status lido>).
--
-- `updated_at` não é testado aqui de propósito: dentro de uma transação now()
-- é congelado, então o trigger não teria como mostrar avanço. O que o teste
-- garante é que a coluna existe e é preenchida — a detecção de reserva
-- abandonada (STALE_PENDING_MS) compara instantes de transações diferentes.
-- =========================================================================
insert into public.conversation_open_events (equipe_id, lead_id, event_key, status, error_code)
values ('5e000000-0000-0000-0000-000000000001','5e000000-0000-0000-0000-0000000000a1',
        'retomada','failed','provider_unreachable');

do $$
declare v_primeira int; v_segunda int;
begin
  update public.conversation_open_events
     set status = 'pending', attempts = attempts + 1, error_code = null
   where event_key = 'retomada'
     and equipe_id = '5e000000-0000-0000-0000-000000000001'
     and status = 'failed';
  get diagnostics v_primeira = row_count;

  update public.conversation_open_events
     set status = 'pending', attempts = attempts + 1, error_code = null
   where event_key = 'retomada'
     and equipe_id = '5e000000-0000-0000-0000-000000000001'
     and status = 'failed';
  get diagnostics v_segunda = row_count;

  assert v_primeira = 1, 'REV-T9 FAIL: a primeira retomada de uma tentativa falhada foi bloqueada';
  assert v_segunda = 0, 'REV-T9 FAIL: duas chamadas reassumiram a mesma tentativa';
  assert (select attempts from public.conversation_open_events
           where event_key = 'retomada'
             and equipe_id = '5e000000-0000-0000-0000-000000000001') = 2,
    'REV-T9 FAIL: o contador de tentativas não acompanhou a retomada';
  assert (select updated_at is not null from public.conversation_open_events
           where event_key = 'retomada'
             and equipe_id = '5e000000-0000-0000-0000-000000000001'),
    'REV-T9 FAIL: updated_at ficou nulo — sem ele não há como detectar reserva abandonada';
  raise notice 'REV-T9 ok — retomada de tentativa falhada é exclusiva';
end $$;

-- =========================================================================
-- TEST 10 — RLS ligada nas duas tabelas novas. Sem isso, o rastro de um tenant
-- (telefone e primeira mensagem de cada lead) seria legível pelos outros.
-- =========================================================================
do $$
declare v_off text;
begin
  select string_agg(relname, ', ') into v_off
    from pg_class
   where relname in ('conversation_open_events','conversation_opener_settings')
     and relrowsecurity = false;
  assert v_off is null, 'REV-T10 FAIL: RLS desligada em: ' || coalesce(v_off, '');
  assert (select count(*) from pg_policies
           where tablename in ('conversation_open_events','conversation_opener_settings')) >= 2,
    'REV-T10 FAIL: faltam políticas de leitura por equipe';
  raise notice 'REV-T10 ok — RLS ligada e com política por equipe nas duas tabelas';
end $$;

rollback;

select 'PASS' as result;
