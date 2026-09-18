-- Sprint 8.2 · discovery_q&a · T76 — as boas-vindas passam a pedir o discovery.
--
-- A regra de tom desta casa (20260902000300) é "um pedido só por mensagem". O
-- texto antigo pedia a reunião; agora pede o discovery, e o agendamento aparece
-- na tela final do formulário. A ordem invertida existe porque a outra falhava
-- na prática: o link da agenda é o mais fácil de clicar, então o cliente marcava
-- primeiro e chegava na reunião com o formulário em branco — exatamente o que o
-- discovery existe para evitar.

update public.notification_types
   set variables = '{cliente_nome,link_discovery,link_app,golive_previsto}',
       description = 'Boas-vindas após o provisionamento, com o link do discovery. O agendamento vem depois, na tela final do formulário.',
       template_title = 'Bem-vindo à Solo Rev, {{cliente_nome}}!',
       template_body =
'Seu ambiente já está criado e o acesso foi enviado para o seu e-mail.

O próximo passo são 15 minutos de perguntas sobre a sua operação. É com elas que montamos seu agente, seu CRM e seus canais ANTES da nossa reunião — assim a reunião vira decisão, e não questionário.

A maioria das perguntas já vem com uma sugestão marcada: você só corrige o que não bate.

{{link_discovery}}

Ao terminar, você escolhe ali mesmo o horário da nossa reunião.

Previsão de conclusão da implantação: {{golive_previsto}}'
 where type = 'onboarding.welcome';

-- audience='founder': o vocabulário aceito é tenant|founder|both|client
-- (20260824000400). Este aviso é para quem implanta, não para o cliente — ele
-- acabou de preencher, não precisa ser avisado de que preencheu.
insert into public.notification_types
  (type, default_severity, default_channels, audience, description, purpose, variables)
values
  ('onboarding.discovery_done', 'success', '{in_app,email}', 'founder',
   'O cliente enviou o discovery: dá para montar o ambiente antes da reunião.',
   'operacao',
   '{cliente_nome,link_onboarding}')
on conflict (type) do update
  set audience = excluded.audience, purpose = excluded.purpose,
      variables = excluded.variables, description = excluded.description,
      default_severity = excluded.default_severity, default_channels = excluded.default_channels;

update public.notification_types
   set template_title = 'Discovery recebido: {{cliente_nome}}',
       template_body =
'{{cliente_nome}} terminou o discovery. As respostas já estão no card do onboarding — dá para montar o agente e o CRM antes da reunião.

{{link_onboarding}}'
 where type = 'onboarding.discovery_done';
