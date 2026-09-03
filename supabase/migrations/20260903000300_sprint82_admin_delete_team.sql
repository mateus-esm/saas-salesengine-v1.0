-- 20260903000300_sprint82_admin_delete_team.sql
-- Sprint 8.2 · o botao "Excluir equipe" do painel nao fazia nada.
--
-- O QUE ESTAVA ERRADO
--
-- `public.equipes` tem RLS ligado e so duas politicas: super admin pode LER
-- (cmd 'r') e ATUALIZAR (cmd 'w') todas as equipes. Nao existe politica de
-- DELETE nenhuma. O painel chamava `supabase.from("equipes").delete()` direto
-- do navegador -- o mesmo formato usado (com sucesso) para editar.
--
-- Um UPDATE ou DELETE sem politica casavel nao e um erro no Postgres: a
-- clausula USING simplesmente nao bate com nenhuma linha, o comando afeta
-- zero linhas, e o PostgREST devolve 200 com sucesso. Sem `error`, o toast
-- dizia "Equipe removida", a linha continuava na tabela, e o clique parecia
-- nao ter feito nada -- exatamente o sintoma relatado. E a mesma classe de bug
-- que a 36244e1 corrigiu ontem para `billing_accounts`.
--
-- POR QUE NAO E SO ADICIONAR UMA POLITICA DE DELETE
--
-- Apagar uma equipe e irreversivel e cascateia por dezenas de tabelas --
-- `profiles` entre elas, entao apagar a equipe errada apaga o LOGIN de quem
-- opera nela. Uma politica de RLS nao sabe distinguir "Solo Teste, uma casca
-- vazia" de "Solo Energia, 456 leads e um contrato ativo". Essa distincao
-- pertence a uma funcao, nao a uma clausula USING -- o mesmo raciocinio que ja
-- vale para `admin_delete_proposal`.
--
-- A REGRA: recusa quando a equipe tem conversas reais (dado de atendimento nao
-- se recria) ou um contrato vivo alem de onboarding/trialing (relacao de
-- cobranca real). 'onboarding' e 'trialing' passam -- e exatamente o estado da
-- Solo Teste, que a D8 do sprint mandou apagar.

create or replace function public.admin_delete_equipe(p_equipe_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_e         public.equipes%rowtype;
  v_conversas integer;
  v_status    text;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select * into v_e from public.equipes where id = p_equipe_id;
  if not found then
    raise exception 'equipe_not_found' using errcode = 'P0001';
  end if;

  select count(*) into v_conversas
    from public.conversations where equipe_id = p_equipe_id;
  if v_conversas > 0 then
    raise exception 'equipe_has_conversations' using errcode = 'P0001';
  end if;

  select status into v_status from public.contracts
   where equipe_id = p_equipe_id and status in ('active', 'past_due', 'suspended')
   limit 1;
  if v_status is not null then
    raise exception 'equipe_has_live_contract' using errcode = 'P0001';
  end if;

  delete from public.equipes where id = p_equipe_id;

  return jsonb_build_object('id', p_equipe_id, 'deleted', true, 'nome', v_e.nome, 'conversas', v_conversas);
end;
$fn$;

comment on function public.admin_delete_equipe(uuid) is
  'Sprint 8.2 - super-admin apaga uma equipe-casca (sem conversas, sem contrato vivo). O DELETE em si vem do cascade que ja existe no schema; esta funcao so decide se e seguro chama-lo.';

revoke all on function public.admin_delete_equipe(uuid) from public, anon;
grant execute on function public.admin_delete_equipe(uuid) to authenticated;

-- ============================================================================
-- ASSERCOES
-- ============================================================================

do $$
declare
  v_result jsonb;
  v_test_equipe uuid;
begin
  -- (a) a funcao existe e e security definer
  assert exists (
    select 1 from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_delete_equipe' and p.prosecdef
  ), 'ASSERT FAILED: admin_delete_equipe nao existe ou nao e security definer';

  -- (b) sem sessao autenticada (nenhum auth.uid()), a funcao recusa por
  --     autorizacao ANTES de checar qualquer dado -- e essa ordem que garante
  --     que a checagem de dados nunca roda para quem nao pode chamar a funcao.
  begin
    perform public.admin_delete_equipe('00000000-0000-0000-0000-000000000000'::uuid);
    raise exception 'ASSERT FAILED: deveria ter recusado sem sessao de super-admin';
  exception
    when others then
      assert sqlerrm = 'forbidden',
        format('ASSERT FAILED: esperava forbidden, veio %', sqlerrm);
  end;

  -- (c) mesma checagem de autorizacao primeiro, agora com uma equipe real --
  --     prova que 'forbidden' nao e so porque o id nao existe.
  insert into public.equipes (nome, crm_link, suporte_link)
  values ('__assert_delete_test__', '/crm', '/suporte')
  returning id into v_test_equipe;

  begin
    perform public.admin_delete_equipe(v_test_equipe);
    raise exception 'ASSERT FAILED: deveria exigir super_admin antes de checar dados';
  exception
    when others then
      assert sqlerrm = 'forbidden',
        format('ASSERT FAILED: esperava forbidden (sem sessao), veio %', sqlerrm);
  end;

  delete from public.equipes where id = v_test_equipe;

  raise notice 'Sprint 8.2 - admin_delete_equipe: assercoes passaram';
end $$;
