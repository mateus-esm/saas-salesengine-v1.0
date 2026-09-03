-- 20260903000600_sprint82_welcome_password_link.sql
-- Sprint 8.2 - as boas-vindas mandavam o cliente esperar um e-mail, e o aviso
-- de go-live prometia "0 dias de uso completo".
--
-- PROBLEMA 1 - o acesso ficava dependendo de um e-mail que pode nao chegar
--
-- O texto dizia "o acesso foi enviado para o seu e-mail". A mensagem chega no
-- WhatsApp, e a partir dali a pessoa nao tem o que fazer a nao ser procurar um
-- e-mail que pode ter caido em spam, ou que nunca saiu (o dominio do Resend
-- ainda nao esta verificado -- ver o toast do sprint 8.5). Um cliente que
-- acabou de assinar fica sem entrar no produto por causa disso.
--
-- Agora a propria mensagem leva {{link_senha}}: uma pagina onde ele define a
-- senha e entra. Dois passos numerados, na ordem em que devem acontecer --
-- entrar no sistema, depois agendar o discovery.
--
-- PROBLEMA 2 - o texto do go-live assumia que todo contrato tem trial
--
-- 'A partir de agora voce tem {{trial_dias}} dias de uso completo, ate
-- {{trial_fim}}' vira "voce tem 0 dias de uso completo, ate " para quem
-- contratou sem trial -- que e justamente quem paga desde o primeiro dia. E o
-- caso da Solo Energia (trial_days = 0).
--
-- render_template e substituicao pura, sem condicional, de proposito: esses
-- textos sao editados a mao no painel e uma linguagem de template com `if`
-- viraria codigo que ninguem revisa. Entao quem escolhe a frase e a edge
-- function, e o template recebe {{condicao_cobranca}} ja pronta.

-- ============================================================================
-- 1. VARIAVEIS NOVAS
-- ============================================================================

update public.notification_types
   set variables = '{cliente_nome,link_agenda,link_app,link_senha,golive_previsto}'
 where type = 'onboarding.welcome';

update public.notification_types
   set variables = '{cliente_nome,link_app,trial_dias,trial_fim,valor_mensal,condicao_cobranca}'
 where type = 'onboarding.golive';

-- ============================================================================
-- 2. OS TEXTOS
--
-- Regra de tom do produto: fato -> impacto -> acao, e sempre dizer o que ja
-- funciona.
-- ============================================================================

update public.notification_types
   set template_title = 'Bem-vindo a Solo Rev, {{cliente_nome}}!',
       template_body =
'Seu ambiente ja esta criado e o acesso e seu.

1) Defina sua senha e entre no sistema:
{{link_senha}}

2) Agende nossa reuniao de discovery. E nela que entendemos seu processo comercial, sua oferta e seus canais -- e e o que destrava o resto da implantacao: treinamento do agente, conexao dos canais, montagem do CRM e integracao dos anuncios.
{{link_agenda}}

Previsao de conclusao da implantacao: {{golive_previsto}}

Qualquer duvida, e so responder esta mensagem.'
 where type = 'onboarding.welcome';

update public.notification_types
   set template_body =
'{{cliente_nome}}, a implantacao foi concluida e seu motor de receita esta funcionando.

O agente esta treinado e atendendo, os canais estao conectados e seu CRM esta montado.

{{condicao_cobranca}}

Acesse: {{link_app}}'
 where type = 'onboarding.golive';

-- ============================================================================
-- ASSERCOES
-- ============================================================================

do $$
declare
  v_body text;
  v_vars text[];
begin
  -- (a) as boas-vindas carregam o link de senha E o da agenda
  select template_body into v_body from public.notification_types where type = 'onboarding.welcome';
  assert v_body like '%{{link_senha}}%',
    'ASSERT FAILED: as boas-vindas nao tem o link para definir a senha';
  assert v_body like '%{{link_agenda}}%',
    'ASSERT FAILED: as boas-vindas perderam o link do discovery';

  select variables into v_vars from public.notification_types where type = 'onboarding.welcome';
  assert 'link_senha' = any(v_vars),
    'ASSERT FAILED: link_senha nao foi declarada nas variaveis do tipo';

  -- (b) o go-live nao promete mais dias de trial que nao existem
  select template_body into v_body from public.notification_types where type = 'onboarding.golive';
  assert v_body not like '%{{trial_dias}} dias%',
    'ASSERT FAILED: o texto do go-live ainda afirma dias de trial fixos';
  assert v_body like '%{{condicao_cobranca}}%',
    'ASSERT FAILED: o go-live nao recebeu a frase de cobranca montada no servidor';

  -- (c) render_template continua limpando o que nao foi fornecido, para que um
  --     link ausente nao vire "{{link_senha}}" literal na tela do cliente
  assert public.render_template('a {{link_senha}} b', '{}'::jsonb) = 'a  b',
    'ASSERT FAILED: variavel nao fornecida deixou de ser removida';

  raise notice 'Sprint 8.2 - boas-vindas com senha e go-live sem trial: assercoes passaram';
end $$;
