-- 20260903000700_sprint82_equipe_delete_cascade.sql
-- Sprint 8.2 - tres tabelas impediam apagar qualquer equipe que tivesse sido
-- usada, e o botao novo do painel morria nelas.
--
-- COMO ISTO APARECEU
--
-- A 20260903000300 deu ao painel um `admin_delete_equipe()` que finalmente
-- apaga de verdade (antes o DELETE batia num RLS sem politica, afetava zero
-- linhas e devolvia sucesso). Ao ensaiar a limpeza de producao, o delete
-- falhou assim:
--
--   ERROR 23503: update or delete on table "equipes" violates foreign key
--   constraint "consumo_creditos_equipe_id_fkey" on table "consumo_creditos"
--
-- Quarenta e tres tabelas apontam para `equipes` com ON DELETE CASCADE. Estas
-- tres ficaram com NO ACTION:
--
--   ai_decisions      - o log de decisao do agente
--   consumo_creditos  - o consumo por equipe, pre-billing
--   kpis_dashboard    - os numeros ja agregados do painel
--
-- Nao ha nada de especial nelas: sao as tres mais antigas do projeto, criadas
-- antes de o padrao existir. O efeito pratico e que a equipe apagavel era so a
-- que nunca tinha sido usada -- e essa e justamente a que ninguem precisa
-- apagar. "Solo Teste", o caso concreto que motivou o botao, tem consumo.
--
-- POR QUE CASCADE E NAO "limpar antes no codigo"
--
-- Limpar as tres dentro da funcao resolveria hoje e quebraria de novo na
-- proxima tabela que alguem criar com NO ACTION -- e quebraria em producao, no
-- clique do fundador, nao aqui. O schema e o lugar certo para dizer "isto nao
-- existe sem a equipe", e as outras quarenta e tres ja dizem.
--
-- As tres sao dados DERIVADOS da operacao da equipe: decisao de agente,
-- consumo, KPI agregado. Nenhuma sobrevive de forma util a equipe que a
-- produziu.

do $$
declare
  r record;
begin
  for r in
    select c.conname,
           c.conrelid::regclass::text as tabela,
           a.attname                  as coluna
      from pg_constraint c
      join unnest(c.conkey) with ordinality as k(attnum, ord) on true
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
     where c.contype = 'f'
       and c.confrelid = 'public.equipes'::regclass
       and c.confdeltype in ('a', 'r')   -- NO ACTION / RESTRICT
  loop
    execute format('alter table %s drop constraint %I', r.tabela, r.conname);
    execute format(
      'alter table %s add constraint %I foreign key (%I) references public.equipes(id) on delete cascade',
      r.tabela, r.conname, r.coluna
    );
    raise notice 'FK % em % agora e ON DELETE CASCADE', r.conname, r.tabela;
  end loop;
end $$;

-- ============================================================================
-- O SEGUNDO BLOQUEIO, de outra natureza
--
-- Com as FKs acima em cascade, o delete avanca mais e morre aqui:
--
--   ERROR 23502: null value in column "to_stage_id" of relation
--   "opportunity_stage_history" violates not-null constraint
--   CONTEXT: UPDATE ... SET "to_stage_id" = NULL
--
-- `opportunity_stage_history.to_stage_id` e NOT NULL, e a FK dela para
-- `pipeline_stages_v2` e ON DELETE SET NULL. As duas coisas nao podem ser
-- verdade ao mesmo tempo: no instante em que o cascade tenta anular a coluna,
-- o NOT NULL recusa. E a UNICA constraint do banco com esse defeito (conferido
-- varrendo pg_constraint por confdeltype='n' sobre coluna attnotnull).
--
-- NAO estou trocando essa FK para cascade. Isso mudaria o comportamento de
-- apagar UMA etapa de pipeline no CRM -- hoje isso falha, com cascade passaria
-- a apagar o historico de funil daquela etapa em silencio. E outra feature e
-- outra decisao; fica registrada para o fundador decidir.
--
-- O que muda e so o caminho de apagar a EQUIPE INTEIRA, onde perder o
-- historico dela e o esperado: a funcao limpa o historico da equipe antes de
-- deixar o cascade seguir.
-- ============================================================================

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

  -- Ver o bloco acima: sem isto o cascade bate no NOT NULL de to_stage_id e o
  -- delete falha com 23502 em qualquer equipe que ja tenha movido um negocio
  -- de etapa.
  delete from public.opportunity_stage_history where equipe_id = p_equipe_id;

  delete from public.equipes where id = p_equipe_id;

  return jsonb_build_object('id', p_equipe_id, 'deleted', true, 'nome', v_e.nome, 'conversas', v_conversas);
end;
$fn$;

comment on function public.admin_delete_equipe(uuid) is
  'Sprint 8.2 - super-admin apaga uma equipe-casca (sem conversas, sem contrato vivo). Limpa o historico de etapas antes, porque a FK dele e SET NULL sobre uma coluna NOT NULL e o cascade morreria ali.';

revoke all on function public.admin_delete_equipe(uuid) from public, anon;
grant execute on function public.admin_delete_equipe(uuid) to authenticated;

-- ============================================================================
-- ASSERCOES
-- ============================================================================

do $$
declare
  v_cnt      integer;
  v_eq       uuid;
  v_bloqueia text;
begin
  -- (a) nenhuma FK para equipes bloqueia mais o delete
  select count(*), string_agg(c.conrelid::regclass::text, ', ')
    into v_cnt, v_bloqueia
    from pg_constraint c
   where c.contype = 'f'
     and c.confrelid = 'public.equipes'::regclass
     and c.confdeltype in ('a', 'r');
  assert v_cnt = 0,
    format('ASSERT FAILED: %s FK(s) ainda bloqueiam apagar uma equipe: %s', v_cnt, v_bloqueia);

  -- (b) o teste que traduz o bug: uma equipe COM consumo agora e apagavel.
  --     Antes desta migration este bloco levantava 23503.
  insert into public.equipes (nome, crm_link, suporte_link)
  values ('__t827_com_consumo__', '/crm', '/suporte') returning id into v_eq;

  insert into public.consumo_creditos (equipe_id, creditos_utilizados, periodo)
  values (v_eq, 1, to_char(current_date, 'YYYY-MM'));

  delete from public.equipes where id = v_eq;

  select count(*) into v_cnt from public.consumo_creditos where equipe_id = v_eq;
  assert v_cnt = 0,
    format('ASSERT FAILED: sobraram %s linhas de consumo apos apagar a equipe', v_cnt);

  raise notice 'Sprint 8.2 - cascade em equipes: assercoes passaram';
end $$;
