-- Sprint 11 · Onda 3 · T31 — a receita dos ganhos que já existiam.
--
-- Cada negócio ganho (não apagado) recebe o seu lançamento: pelo valor (ainda
-- ninguém usa itens), na data do ganho, com o responsável daquele momento. É a
-- mesma função que os gatilhos usam (_crm_sync_revenue), marcada 'backfill' —
-- idempotente: rodar de novo não lança nada.
--
-- QUANDO: depois das migrations 0100–0400 e do reparo de status (os 3 negócios
-- em etapa de ganho que estavam "open" já recebem a receita pelo gatilho), com
-- aprovação do founder no T38. Ensaio: supabase/tests/sprint11_w3_backfill_revenue.test.sql.
-- Sem begin/commit — quem aplica abre a transação.

select count(*) as deals, coalesce(sum(n), 0) as entries
  from (
    select public._crm_sync_revenue(o.id, 'backfill') as n
      from public.opportunities o
     where o.status = 'won'
       and o.deleted_at is null
  ) s;
