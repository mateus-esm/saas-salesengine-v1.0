-- 20260903000100_sprint82_restaura_super_admin.sql
-- Sprint 8.2 · conserta o que a 000600 quebrou.
--
-- O QUE EU FIZ DE ERRADO: a 000600 demoveu TODO `profiles.role = 'super_admin'`
-- com `equipe_id` preenchido, escrevendo isso como se fosse um invariante:
-- "quem pertence à equipe de um cliente não é super admin da plataforma".
--
-- A regra é boa em teoria e falsa nesta base. As contas do fundador TAMBÉM têm
-- `equipe_id` — ele é dono da Solo Energia, tem uma conta na equipe de outro
-- cliente para dar suporte, e é assim que ele trabalha. A demoção tirou o
-- acesso dele junto com o do cliente.
--
-- O efeito foi imediato e total: `is_super_admin()` lê exatamente essa coluna, e
-- ela passou a não ter nenhuma linha. O RLS de `proposals`, `proposal_items`,
-- `proposal_acceptances`, `onboardings`, `onboarding_stages`, `system_settings`
-- e `notification_senders` passou a negar para todo mundo. Do painel, as
-- propostas e o quadro simplesmente sumiram — como se os dados tivessem sido
-- apagados. Não foram: 12 equipes, 7 propostas e 1.723 leads seguem intactos.
--
-- A LIÇÃO: super admin é uma propriedade de QUEM a pessoa é, não da forma da
-- linha. Derivar autoridade da estrutura (`equipe_id is not null`) parecia mais
-- limpo que uma lista de identidades, e estava errado.
--
-- O problema real que a 000600 tentava resolver — um cliente
-- (wi@walteringlezadv.com.br) lendo a proposta de todos — continua resolvido:
-- ele NÃO volta aqui.

-- ============================================================================
-- 1. DEVOLVE O ACESSO AO FUNDADOR
--
-- As três contas dele, nominalmente. Uma lista de identidades é exatamente o
-- que isto tem que ser.
-- ============================================================================

update public.profiles
   set role = 'super_admin'
 where email in (
   'mateussmaia95@hotmail.com',   -- a que tinha o papel antes da 000600
   'mateussmaia95@gmail.com',
   'mateus@soloenergia.com.br'    -- a que já é super_admin em user_roles
 );

-- `user_roles` é a outra fonte de verdade (a que o frontend lê). Ela e
-- `profiles.role` discordavam antes desta sprint, e é esse descasamento que faz
-- a tela dizer uma coisa e o RLS obedecer outra. Aqui elas passam a concordar
-- para as contas do fundador — a unificação de verdade está no todo.md.
insert into public.user_roles (user_id, role)
select p.user_id, 'super_admin'
  from public.profiles p
 where p.email in ('mateussmaia95@hotmail.com', 'mateussmaia95@gmail.com', 'mateus@soloenergia.com.br')
   and not exists (
     select 1 from public.user_roles ur
      where ur.user_id = p.user_id and ur.role = 'super_admin'
   );

-- ============================================================================
-- 2. ASSERÇÕES
-- ============================================================================

do $$
declare
  v_cnt integer;
begin
  -- (a) o fundador consegue enxergar o próprio painel de novo
  select count(*) into v_cnt from public.profiles
   where role = 'super_admin'
     and email in ('mateussmaia95@hotmail.com','mateussmaia95@gmail.com','mateus@soloenergia.com.br');
  assert v_cnt = 3,
    format('ASSERT FAILED: só %s das 3 contas do fundador voltaram a ser super admin', v_cnt);

  -- (b) o cliente continua FORA — que era o ponto da 000600
  assert not exists (
    select 1 from public.profiles
     where email = 'wi@walteringlezadv.com.br' and role = 'super_admin'
  ), 'ASSERT FAILED: o cliente voltou a ler a proposta de todo mundo';

  -- (c) nenhum outro cliente ganhou o papel de volta
  select count(*) into v_cnt from public.profiles
   where role = 'super_admin'
     and email not in ('mateussmaia95@hotmail.com','mateussmaia95@gmail.com','mateus@soloenergia.com.br');
  assert v_cnt = 0,
    format('ASSERT FAILED: %s conta(s) inesperada(s) com super admin', v_cnt);

  -- (d) e os dados que "sumiram" nunca saíram do lugar
  select count(*) into v_cnt from public.equipes;
  assert v_cnt = 12, format('ASSERT FAILED: %s equipes, esperava 12', v_cnt);
  select count(*) into v_cnt from public.proposals;
  assert v_cnt = 7, format('ASSERT FAILED: %s propostas, esperava 7', v_cnt);

  raise notice 'Sprint 8.2 · acesso do fundador restaurado';
end $$;
