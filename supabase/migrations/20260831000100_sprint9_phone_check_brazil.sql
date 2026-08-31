-- 20260831000100_sprint9_phone_check_brazil.sql
-- Sprint 9 · correção — o CHECK do telefone contava dígitos em vez de validar.
--
-- O QUE ACONTECEU
--
-- report_recipients.phone tinha `check (phone ~ '^[0-9]{12,15}$')`. A intenção
-- era "com DDI"; o que ele realmente exige é "doze a quinze dígitos". Um número
-- brasileiro digitado sem o 55 — 859999939862, DDD 85 grudado no celular —
-- tem exatamente 12 dígitos e passa.
--
-- E aí não dá erro. A API da Solo aceita, a entrega marca `sent`, e a mensagem
-- não chega em lugar nenhum, porque 85 não é código de país. É o mesmo modo de
-- falha silenciosa que custou a Sprint 8.5, num CHECK escrito justamente para
-- impedi-lo. Um teste com número real encontrou em minutos o que a constraint
-- deixou passar.
--
-- A REGRA CERTA
--
--   55 + DDD (2 dígitos, 11–99) + assinante (8 ou 9 dígitos)
--   = 12 dígitos (fixo) ou 13 (celular, sempre começando com 9)
--
-- Este produto é brasileiro de ponta a ponta — preço em BRL, interface pt-BR,
-- WhatsApp pela Solo. Validar a forma brasileira e recusar o resto é honesto;
-- aceitar "qualquer coisa entre 12 e 15 dígitos" só adia a descoberta do erro
-- para o momento em que o cliente pergunta por que não recebeu.
--
-- NOT VALID, DE PROPÓSITO
--
-- Já existe uma linha com número inválido (a do teste). NOT VALID aplica a
-- regra a toda inserção e atualização daqui pra frente, sem apagar o que já
-- está lá: o número errado continua visível na tela para ser corrigido por quem
-- o digitou. Apagar seria eu decidir sozinho descartar um cadastro que talvez
-- só precise de dois dígitos.

begin;

alter table public.report_recipients
  drop constraint if exists report_recipients_phone_check;

-- A DESATIVAÇÃO VEM ANTES DA CONSTRAINT, e a ordem não é estética.
--
-- NOT VALID dispensa a checagem das linhas que já existem no momento em que a
-- regra é criada — mas qualquer UPDATE posterior numa linha, inclusive um que
-- só mexe em `active`, é validado normalmente. Desativar depois de criar a
-- regra é pedir para o banco recusar exatamente a linha que a regra existe para
-- sinalizar. A primeira versão deste arquivo fazia isso e falhou no deploy.
update public.report_recipients
   set active = false
 where phone !~ '^55[1-9][0-9](9[0-9]{8}|[2-5][0-9]{7})$'
   and active;

alter table public.report_recipients
  add constraint report_recipients_phone_br
  check (phone ~ '^55[1-9][0-9](9[0-9]{8}|[2-5][0-9]{7})$')
  not valid;

comment on constraint report_recipients_phone_br on public.report_recipients is
  'Sprint 9: número brasileiro completo — 55 + DDD + 9 dígitos (celular) ou 8 (fixo). NOT VALID: linhas antigas com número inválido continuam visíveis para correção manual em vez de serem apagadas.';

commit;
