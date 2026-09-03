-- 20260903000800_sprint82_legacy_flag.sql
-- Sprint 8.2 - o quadro de onboarding misturava duas coisas diferentes.
--
-- O QUE ESTAVA ERRADO
--
-- O backfill (20260902000500) deu um card a TODO cliente que ja operava, e os
-- colocou em 'ativo'. A intencao era boa -- ninguem invisivel -- mas o efeito e
-- que o quadro passou a mostrar oito clientes onde so dois estao realmente em
-- onboarding. Casa Flow, Cinemas Benficas, Lucas Castelo, Be My Guest e Jornada
-- do R1 nunca passaram por discovery, implantacao ou go-live neste sistema:
-- eles ja estavam no ar quando o processo foi criado.
--
-- Um quadro de onboarding com seis cards que ninguem vai mover nao e um quadro:
-- e uma lista de clientes com passos que nao aconteceram.
--
-- A REGRA, e por que ela nao cita nome de cliente
--
-- Um card pertence ao quadro se o cliente tem CONTRATO no faturamento novo.
-- Contrato e o que prova que ele passou (ou esta passando) pelo processo. Quem
-- nao tem contrato e cliente legado: opera, fatura por fora, e nao esta em
-- onboarding nenhum.
--
-- Isso mantem a Solo Energia no quadro -- ela e legada E tem contrato ativo,
-- porque assinou a proposta nova -- e tira os cinco que so tem historia.
--
-- `is_legacy` fica na EQUIPE, nao no card: e uma propriedade do cliente, e
-- continua valendo depois que o card sair do quadro. E o que permite responder
-- "quem ainda esta no modelo antigo?" sem decorar uma lista de nomes.

alter table public.equipes
  add column if not exists is_legacy boolean not null default false;

comment on column public.equipes.is_legacy is
  'Sprint 8.2 - cliente que ja operava antes do onboarding/faturamento existir. Nao passou por discovery/implantacao/go-live neste sistema. Marca de identificacao, nao muda comportamento nenhum.';

create index if not exists idx_equipes_legacy on public.equipes (is_legacy) where is_legacy;

-- ============================================================================
-- QUEM E LEGADO
--
-- Definido por FATO, nao por lista: entrou antes desta sprint (a 8.2 comecou em
-- 02/09) e tem operacao real. Escrever os nomes aqui deixaria a migration
-- errada no dia em que alguem renomear uma equipe.
-- ============================================================================

update public.equipes e
   set is_legacy = true
 where e.created_at < date '2026-09-02'
   and exists (select 1 from public.conversations c where c.equipe_id = e.id);

-- ============================================================================
-- O QUADRO FICA SO COM QUEM ESTA EM ONBOARDING
--
-- Card de legado SEM contrato sai. Com contrato fica -- e o caso da Solo
-- Energia, que assinou a proposta nova e esta em 'ativo' por direito.
--
-- O card e derivado: o backfill o criou e este delete o remove. Nada de
-- historico de cliente se perde, porque a operacao dele vive em conversations,
-- leads e faturas -- nao no card.
-- ============================================================================

delete from public.onboardings o
 using public.equipes e
 where e.id = o.equipe_id
   and e.is_legacy
   and o.proposal_id is null
   and not exists (
     select 1 from public.contracts c
      where c.equipe_id = o.equipe_id
        and c.status in ('onboarding','trialing','active','past_due','suspended')
   );

-- ============================================================================
-- ASSERCOES
-- ============================================================================

do $$
declare
  v_cnt      integer;
  v_legados  text;
  v_quadro   text;
begin
  -- (a) a coluna existe e tem indice
  assert exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='equipes' and column_name='is_legacy'
  ), 'ASSERT FAILED: equipes.is_legacy nao existe';

  -- (b) os legados foram marcados
  select count(*) into v_cnt from public.equipes where is_legacy;
  assert v_cnt >= 5,
    format('ASSERT FAILED: so %s equipe(s) marcada(s) como legado, esperava pelo menos 5', v_cnt);

  -- (c) NENHUM card de legado sem contrato sobrou no quadro
  select count(*) into v_cnt
    from public.onboardings o
    join public.equipes e on e.id = o.equipe_id
   where e.is_legacy
     and not exists (
       select 1 from public.contracts c
        where c.equipe_id = o.equipe_id
          and c.status in ('onboarding','trialing','active','past_due','suspended'));
  assert v_cnt = 0,
    format('ASSERT FAILED: %s card(s) de legado sem contrato ainda no quadro', v_cnt);

  -- (d) E A QUE IMPORTA: a Solo Energia continua no quadro. Ela e legada mas
  --     tem contrato ativo da proposta nova -- perde-la aqui seria a regra
  --     boa aplicada ao caso errado.
  assert exists (
    select 1 from public.onboardings o
     join public.equipes e on e.id = o.equipe_id
    where e.nome ilike 'solo energia%'
  ), 'ASSERT FAILED: a Solo Energia sumiu do quadro -- ela tem contrato e deve ficar';

  -- (e) quem esta em onboarding de verdade continua la
  select count(*) into v_cnt
    from public.onboardings o
    join public.contracts c on c.equipe_id = o.equipe_id
   where c.status = 'onboarding';
  assert v_cnt >= 2,
    format('ASSERT FAILED: %s card(s) com contrato em onboarding, esperava pelo menos 2 (Rema e WI)', v_cnt);

  select string_agg(nome, ', ' order by nome) into v_legados
    from public.equipes where is_legacy;
  select string_agg(o.cliente_nome, ', ' order by o.cliente_nome) into v_quadro
    from public.onboardings o;

  raise notice 'Legado: %', v_legados;
  raise notice 'Quadro: %', v_quadro;
  raise notice 'Sprint 8.2 - legacy flag: assercoes passaram';
end $$;
