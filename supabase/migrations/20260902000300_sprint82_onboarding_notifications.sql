-- 20260902000300_sprint82_onboarding_notifications.sql
-- Sprint 8.2 · o cliente recebe boas-vindas, não uma cobrança.
--
-- O QUE ACONTECIA: provisionar disparava `tenant.provisioned` com o corpo
-- "Seu ambiente está pronto. A primeira fatura já está disponível em
-- Faturamento." Era a primeira frase que o cliente lia depois de assinar — e
-- falava de fatura, num momento em que ele ainda não tinha tido a reunião de
-- discovery nem visto o agente funcionando.
--
-- O que ele precisa nesse instante é de UM próximo passo: agendar o discovery.
-- É a reunião que destrava todo o resto da implantação, e enquanto ela não
-- acontece o onboarding não anda.
--
-- Dois tipos, dois remetentes, porque são duas conversas diferentes:
--
--   onboarding.welcome  comercial  — "vamos começar, agende aqui"
--   onboarding.golive   financeiro — "está no ar, e é aqui que a cobrança entra"

-- ============================================================================
-- 1. O LINK DA AGENDA MORA NO BANCO
--
-- Um link de agendamento muda mais do que o código: troca de ferramenta, troca
-- de duração, troca de calendário. Deixá-lo num literal dentro de uma edge
-- function significa um deploy para trocar uma URL.
-- ============================================================================

insert into public.system_settings (key, value, description) values
  ('ONBOARDING_CALENDLY_URL', 'https://calendly.com/mateus-soloenergia/30min',
   'Link de agendamento do discovery. Vai no {{link_agenda}} da mensagem de boas-vindas.'),
  ('PLATFORM_NAME', 'Solo Rev',
   'Nome do produto nos e-mails e notificações. A empresa que fatura continua sendo Solo Ventures.')
on conflict (key) do update
  set value       = coalesce(public.system_settings.value, excluded.value),
      description = excluded.description;

-- APP_BASE_URL pode já existir do sprint 8.4; não sobrescreve o que estiver lá.
insert into public.system_settings (key, description) values
  ('APP_BASE_URL', 'Endereço do app, usado para transformar action_url em link absoluto no e-mail.')
on conflict (key) do nothing;

-- ============================================================================
-- 2. OS DOIS TIPOS
-- ============================================================================

insert into public.notification_types
  (type, default_severity, default_channels, audience, description, purpose, variables)
values
  ('onboarding.welcome', 'info', '{in_app,email,whatsapp}', 'tenant',
   'Boas-vindas após o provisionamento, com o link para agendar o discovery.',
   'comercial',
   '{cliente_nome,link_agenda,link_app,golive_previsto}'),
  ('onboarding.golive', 'success', '{in_app,email,whatsapp}', 'tenant',
   'O ambiente entrou no ar: trial começa e a cobrança da implantação é emitida.',
   'financeiro',
   '{cliente_nome,link_app,trial_dias,trial_fim,valor_mensal}')
on conflict (type) do update
  set audience         = excluded.audience,
      purpose          = excluded.purpose,
      variables        = excluded.variables,
      description      = excluded.description,
      default_severity = excluded.default_severity,
      default_channels = excluded.default_channels;

-- ============================================================================
-- 3. OS TEXTOS
--
-- Regra de tom do produto: fato → impacto → ação, e sempre dizer o que já
-- funciona. Aqui isso vira: seu ambiente existe (fato), a implantação começa
-- pela reunião (impacto), agende (ação).
--
-- Um pedido só por mensagem. Boas-vindas com quatro links é uma mensagem sem
-- próximo passo.
-- ============================================================================

update public.notification_types
   set template_title = 'Bem-vindo à Solo Rev, {{cliente_nome}}!',
       template_body =
'Seu ambiente já está criado e o acesso foi enviado para o seu e-mail.

O próximo passo é a nossa reunião de discovery. É nela que entendemos seu processo comercial, sua oferta e seus canais — e é o que destrava o resto da implantação: treinamento do agente, conexão dos canais, montagem do CRM e integração dos anúncios.

Agende no melhor horário para você:
{{link_agenda}}

Previsão de conclusão da implantação: {{golive_previsto}}

Qualquer dúvida, é só responder esta mensagem.'
 where type = 'onboarding.welcome';

update public.notification_types
   set template_title = 'Seu Solo Rev está no ar 🚀',
       template_body =
'{{cliente_nome}}, a implantação foi concluída e seu motor de receita está funcionando.

O agente está treinado e atendendo, os canais estão conectados e seu CRM está montado. A partir de agora você tem {{trial_dias}} dias de uso completo, até {{trial_fim}}.

Depois desse período a assinatura de R$ {{valor_mensal}}/mês entra em vigor, cobrada proporcionalmente ao que restar do mês.

Acesse: {{link_app}}'
 where type = 'onboarding.golive';

-- ============================================================================
-- 4. tenant.provisioned SAI DE CENA
--
-- O tipo continua existindo — apagá-lo quebraria o histórico das notificações
-- já enviadas, que referenciam o tipo. O que muda é que nada mais o dispara, e
-- a descrição registra o porquê para quem abrir a tabela daqui a seis meses.
-- ============================================================================

update public.notification_types
   set description = 'OBSOLETO desde o sprint 8.2. Falava de fatura no primeiro contato pós-assinatura, antes mesmo do discovery. Substituído por onboarding.welcome.'
 where type = 'tenant.provisioned';

-- ============================================================================
-- 5. ASSERÇÕES
-- ============================================================================

do $$
declare
  v_e   uuid;
  v_n   uuid;
  v_txt text;
  v_cnt integer;
begin
  insert into public.equipes (nome, crm_link, suporte_link)
  values ('__t3_notif__', '/crm', '/suporte') returning id into v_e;

  -- (a) o template vence o literal do chamador, e o link da agenda entra
  v_n := public.notify(
    v_e, 'onboarding.welcome', 'TITULO IGNORADO', 'CORPO IGNORADO', '/home',
    jsonb_build_object(
      'cliente_nome',    'Rema Digital',
      'link_agenda',     (select value from public.system_settings where key = 'ONBOARDING_CALENDLY_URL'),
      'golive_previsto', '23/09/2026'
    ),
    'welcome_assert');
  assert v_n is not null, 'ASSERT FAILED: a notificação de boas-vindas não foi criada';

  select title into v_txt from public.notifications where id = v_n;
  assert v_txt = 'Bem-vindo à Solo Rev, Rema Digital!',
    format('ASSERT FAILED: título rendeu "%s"', v_txt);

  select body into v_txt from public.notifications where id = v_n;
  assert v_txt like '%calendly.com/mateus-soloenergia/30min%',
    'ASSERT FAILED: o link de agendamento não entrou no corpo';
  assert v_txt like '%23/09/2026%', 'ASSERT FAILED: a previsão não entrou no corpo';
  assert v_txt not like '%{{%', 'ASSERT FAILED: sobrou {{variável}} no texto enviado ao cliente';

  -- (b) boas-vindas fala com o comercial, go-live com o financeiro
  assert (select purpose from public.notification_types where type = 'onboarding.welcome') = 'comercial',
    'ASSERT FAILED: boas-vindas não saem pelo comercial';
  assert (select purpose from public.notification_types where type = 'onboarding.golive') = 'financeiro',
    'ASSERT FAILED: go-live não sai pelo financeiro';

  -- (c) três canais: in-app, e-mail e WhatsApp
  select count(*) into v_cnt from public.notification_deliveries where notification_id = v_n;
  assert v_cnt = 3, format('ASSERT FAILED: %s entregas para boas-vindas, esperava 3', v_cnt);

  -- (d) uma variável não fornecida some em vez de vazar chaves
  v_n := public.notify(v_e, 'onboarding.golive', 'x', 'y', '/home',
                       jsonb_build_object('cliente_nome', 'Rema'), 'golive_assert');
  select body into v_txt from public.notifications where id = v_n;
  assert v_txt not like '%{{%',
    'ASSERT FAILED: o cliente veria {{trial_fim}} na mensagem';

  delete from public.equipes where id = v_e;
  raise notice 'Sprint 8.2 · notificações de onboarding: asserções passaram';
end $$;
