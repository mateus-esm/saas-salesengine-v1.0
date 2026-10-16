-- 2026-10-16_sesup1_solo_funnel_mapping.sql
-- SE-SUP1-8 (#10) — corrige o mapeamento etapa -> marco do funil da Solo Energia.
--
-- NÃO É MIGRATION E NÃO FOI APLICADO. É dado de UM cliente e muda o que o
-- dashboard e o relatório diário dela dizem sobre o passado. Antes de rodar:
--   1. rodar os blocos 0 e 1 (só leitura) e mostrar o resultado ao gestor da Solo;
--   2. o gestor confirma, etapa por etapa, a coluna `marco_proposto` (e decide os
--      itens marcados CONFIRMAR);
--   3. só então rodar o bloco 2, que termina em ROLLBACK de propósito — trocar
--      por COMMIT depois de conferir as contagens que ele imprime.
--
-- O DIAGNÓSTICO (plano, seção 1, #10; contagens de 15/10): o mapa estava
-- deslocado um passo — Elaboração de Proposta -> qualified, Agendamento de
-- Reunião -> proposal_sent, Reunião de Apresentação e Visita Técnica ->
-- meeting_scheduled, Negociação -> meeting_done. Por isso o painel mostrava
-- 6 meeting_done x 10 meeting_scheduled x 39 proposal_sent.
--
-- O MAPA PROPOSTO (plano, Onda 7, item 1):
--   Qualificação                      -> qualified
--   Envio de Proposta / Negociação    -> proposal_sent
--   Agendamento de Reunião            -> meeting_scheduled
--   Reunião de Apresentação           -> meeting_done   (ao concluir)
--   Visita Técnica                    -> meeting_done   (ao concluir)
--   no_show                           -> NUNCA por etapa: só pelo botão de desfecho
--   Elaboração de Proposta            -> CONFIRMAR (proposto: sem marco — a proposta
--                                        ainda não saiu; quem conta é o envio)
--   Ganho / Perdido                   -> vêm do stage_type, não deste mapa
--
-- "AO CONCLUIR": entrar em Reunião de Apresentação / Visita Técnica grava
-- meeting_done. Isso só é verdade se a equipe move o card para lá DEPOIS da
-- reunião. Se ela move ANTES (o card espera a reunião nessa coluna), o certo é
-- deixar essas duas etapas SEM marco e contar a realizada só pelo botão
-- "Reunião realizada / Visita técnica" (crm_record_meeting_outcome) — CONFIRMAR
-- com o gestor qual dos dois é o hábito do time. Os dois juntos no MESMO dia não
-- contam em dobro (o RPC deduplica por dia); em dias diferentes, contariam.
--
-- O NOME DA ETAPA é comparado ignorando caixa e espaço nas pontas (lower + trim;
-- o acento conta — "Qualificacao" sem acento cai em '(sem regra)'). Etapa
-- com outro nome aparece no bloco 1 com marco_proposto = '(sem regra)' e NÃO é
-- tocada — nada de ILIKE adivinhando (Sprint 9: um palpite errado é invisível).
--
-- Depois do UPDATE, o histórico é refeito por _rebuild_funnel_events(pipeline):
-- apaga e recria só a parte DERIVADA (stage_change, opportunity_created,
-- recompute). Eventos manuais/importados/status_change ficam. Antes, um backup
-- das linhas derivadas da Solo vai para public.funnel_events_backup_sesup1_8 —
-- COM RLS na mesma transação (memória: tabela em public nasce legível pela anon).

-- ============================================================================
-- 0. CONFERÊNCIA (só leitura): a equipe e o mapa de hoje
-- ============================================================================

select e.id as equipe_id, e.nome
  from public.equipes e
 where e.nome ilike 'solo%';
-- Esperado: UMA linha. Se vier mais de uma, fixar o id certo nos blocos abaixo
-- (trocar o `e.nome ilike 'solo%'` por `e.id = '<uuid>'`).

select p.name as pipeline, s.position, s.name as etapa, s.stage_type, s.funnel_event as marco_atual,
       (select count(*) from public.funnel_events fe
         where fe.stage_id = s.id and fe.source in ('stage_change', 'opportunity_created')) as eventos_derivados
  from public.pipeline_stages_v2 s
  join public.pipelines p on p.id = s.pipeline_id
  join public.equipes e on e.id = s.equipe_id
 where e.nome ilike 'solo%'
   and s.deleted_at is null and p.deleted_at is null
 order by p.name, s.position;

-- ============================================================================
-- 1. A PROPOSTA (só leitura): atual x proposto, etapa por etapa
-- ============================================================================

with regra(etapa_norm, marco, observacao) as (
  values
    ('qualificação',            'qualified',         null),
    ('envio de proposta',       'proposal_sent',     null),
    ('negociação de proposta',  'proposal_sent',     null),
    ('negociação',              'proposal_sent',     'CONFIRMAR: "Envio/Negociação de Proposta" — negociação conta como proposta enviada?'),
    ('agendamento de reunião',  'meeting_scheduled', null),
    ('reunião de apresentação', 'meeting_done',      'CONFIRMAR: o card entra aqui depois da reunião? Se antes, deixar sem marco.'),
    ('visita técnica',          'meeting_done',      'CONFIRMAR: o card entra aqui depois da visita? Se antes, deixar sem marco.'),
    ('elaboração de proposta',  null,                'CONFIRMAR: proposto sem marco (proposta ainda não enviada).')
)
select p.name as pipeline, s.position, s.name as etapa, s.stage_type,
       s.funnel_event as marco_atual,
       case when s.stage_type in ('won', 'lost') then '(stage_type: ' || s.stage_type || ')'
            when r.etapa_norm is null then '(sem regra)'
            else coalesce(r.marco, '(sem marco)') end as marco_proposto,
       (s.stage_type = 'open' and r.etapa_norm is not null
        and s.funnel_event is distinct from r.marco) as muda,
       r.observacao
  from public.pipeline_stages_v2 s
  join public.pipelines p on p.id = s.pipeline_id
  join public.equipes e on e.id = s.equipe_id
  left join regra r on r.etapa_norm = lower(btrim(s.name))
 where e.nome ilike 'solo%'
   and s.deleted_at is null and p.deleted_at is null
 order by p.name, s.position;

-- ============================================================================
-- 2. APLICAR (só depois do OK do gestor). Termina em ROLLBACK de propósito.
-- ============================================================================

begin;

-- Backup das linhas derivadas (as que o rebuild apaga), com RLS na mesma transação.
create table if not exists public.funnel_events_backup_sesup1_8 as
  select fe.*
    from public.funnel_events fe
    join public.equipes e on e.id = fe.equipe_id
   where e.nome ilike 'solo%'
     and fe.source in ('stage_change', 'opportunity_created', 'recompute');
alter table public.funnel_events_backup_sesup1_8 enable row level security;
revoke all on public.funnel_events_backup_sesup1_8 from anon, authenticated;

-- Contagem ANTES, por marco.
select fe.event, count(*) as antes
  from public.funnel_events fe
  join public.equipes e on e.id = fe.equipe_id
 where e.nome ilike 'solo%'
 group by fe.event order by fe.event;

-- O mapa. Só etapas abertas, só nomes com regra; o resto fica como está.
with regra(etapa_norm, marco) as (
  values
    ('qualificação',            'qualified'),
    ('envio de proposta',       'proposal_sent'),
    ('negociação de proposta',  'proposal_sent'),
    ('negociação',              'proposal_sent'),
    ('agendamento de reunião',  'meeting_scheduled'),
    ('reunião de apresentação', 'meeting_done'),
    ('visita técnica',          'meeting_done'),
    ('elaboração de proposta',  null::text)
)
update public.pipeline_stages_v2 s
   set funnel_event = r.marco
  from regra r, public.equipes e
 where e.id = s.equipe_id
   and e.nome ilike 'solo%'
   and s.deleted_at is null
   and s.stage_type = 'open'
   and lower(btrim(s.name)) = r.etapa_norm
   and s.funnel_event is distinct from r.marco;

-- Refaz o histórico derivado de cada pipeline da Solo com o mapa novo.
select p.name as pipeline, public._rebuild_funnel_events(p.id::uuid) as variacao_liquida
  from public.pipelines p
  join public.equipes e on e.id = p.equipe_id
 where e.nome ilike 'solo%'
   and p.deleted_at is null;

-- Contagem DEPOIS, por marco — conferir com o gestor antes do COMMIT.
-- Esperado: no_show inalterado (só manual); meeting_done perto de meeting_scheduled.
select fe.event, count(*) as depois
  from public.funnel_events fe
  join public.equipes e on e.id = fe.equipe_id
 where e.nome ilike 'solo%'
 group by fe.event order by fe.event;

-- Verificação final do mapa (deve bater com a coluna marco_proposto do bloco 1).
select p.name as pipeline, s.position, s.name as etapa, s.stage_type, s.funnel_event
  from public.pipeline_stages_v2 s
  join public.pipelines p on p.id = s.pipeline_id
  join public.equipes e on e.id = s.equipe_id
 where e.nome ilike 'solo%'
   and s.deleted_at is null and p.deleted_at is null
 order by p.name, s.position;

rollback;  -- trocar por COMMIT; só depois de conferir as contagens acima com o gestor
