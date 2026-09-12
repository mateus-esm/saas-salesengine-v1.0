-- Sprint 11 · Onda 3 · T32 — o ciclo de vida dos contatos que já têm negócio.
--
-- Os 2.221 contatos estão em `raw` desde sempre. Quem tem negócio passa a
-- refletir os negócios: client (ganho vivo) > opportunity (aberto) > lost (só
-- perdidos) — a mesma regra do gatilho da migration 20260912000500. Quem não tem
-- negócio fica como está (raw/mql/sql).
--
-- QUANDO: depois das migrations e do reparo de status (os 200 negócios passam a
-- ter o status certo antes), com aprovação do founder no T38.
-- Ensaio: supabase/tests/sprint11_w3_backfill_lifecycle.test.sql.
-- Efeito colateral aceito: `leads.updated_at` dos contatos alterados muda (o
-- ciclo de vida deles mudou mesmo). Sem begin/commit — quem aplica abre a transação.

update public.leads l
   set lifecycle_stage = s.stage
  from (
    select o.lead_id,
           case
             when bool_or(o.status = 'won')  then 'client'
             when bool_or(o.status = 'open') then 'opportunity'
             when bool_or(o.status = 'lost') then 'lost'
           end as stage
      from public.opportunities o
     where o.deleted_at is null
     group by o.lead_id
  ) s
 where s.lead_id = l.id
   and s.stage is not null
   and l.lifecycle_stage is distinct from s.stage;
