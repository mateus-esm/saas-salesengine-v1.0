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
--   Reunião de Apresentação           -> SEM MARCO (padrão) — realizada/no-show só pelo botão
--   Visita Técnica                    -> SEM MARCO (padrão) — idem
--   no_show                           -> NUNCA por etapa: só pelo botão de desfecho
--   Elaboração de Proposta            -> CONFIRMAR (proposto: sem marco — a proposta
--                                        ainda não saiu; quem conta é o envio)
--   Ganho / Perdido                   -> vêm do stage_type, não deste mapa
--
-- POR QUE AS ETAPAS DE REUNIÃO FICAM SEM MARCO. O plano diz "meeting_done AO
-- CONCLUIR", e um marco de etapa dispara AO ENTRAR. Se o time põe o card em
-- "Reunião de Apresentação" esperando a reunião (o hábito mais comum), entrar ali
-- gravaria uma realizada que pode virar no-show — e o botão gravaria a outra. Sem
-- marco nessas etapas, a realizada e o no-show vêm só do botão de desfecho
-- (crm_record_meeting_outcome), que é mutuamente exclusivo por negócio e dia.
-- ALTERNATIVA (só com o gestor confirmando que o card entra ali DEPOIS da reunião):
-- descomentar as duas linhas marcadas "ALTERNATIVA" nos blocos 1 e 2 e comentar as
-- linhas "PADRÃO" correspondentes. Mesmo assim, o botão "Realizada" num dia
-- diferente da entrada na etapa contaria a mesma reunião duas vezes.
--
-- O NOME DA ETAPA é comparado ignorando caixa e espaço nas pontas (lower + trim;
-- o acento conta — "Qualificacao" sem acento cai em '(sem regra)'). Etapa
-- com outro nome aparece no bloco 1 com marco_proposto = '(sem regra)' e NÃO é
-- tocada — nada de ILIKE adivinhando (Sprint 9: um palpite errado é invisível).
--
-- O REPLAY É PARCIAL DE PROPÓSITO. _rebuild_funnel_events (Sprint 9) refaz também
-- o won/lost de negócio nascido fechado, datando-o em created_at — mas o gatilho
-- vivo desde a Sprint 11 W3 data esse nascimento em coalesce(closed_at,
-- created_at). Rodá-lo moveria a data de ganhos/perdas importados já fechados, e
-- as contagens antes/depois não mostrariam (o total é o mesmo, a data não). Então
-- este script NÃO chama o rebuild: apaga e refaz só as linhas DERIVADAS
-- (stage_change, opportunity_created) dos marcos ABERTOS (qualified,
-- proposal_sent, meeting_scheduled, meeting_done, no_show, contract_*) — com a
-- mesma lógica das seções 1 e 2 do rebuild, filtrada. won/lost/reopened/recycled,
-- recompute, manual, import e status_change não são tocados, e o bloco 2 prova
-- isso (impressão digital antes = depois, senão aborta).
--
-- Backup das linhas apagadas em public.funnel_events_backup_sesup1_8 — COM RLS na
-- mesma transação (memória: tabela em public nasce legível pela anon).

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

-- Só leitura: nascimentos ganho/perdido cuja data difere do fechamento. São
-- exatamente as linhas que o _rebuild_funnel_events re-dataria — este script não
-- as toca; a lista é para o registro.
select fe.id, fe.opportunity_id, fe.event, fe.occurred_at, o.closed_at, o.created_at
  from public.funnel_events fe
  join public.opportunities o on o.id = fe.opportunity_id
  join public.equipes e on e.id = fe.equipe_id
 where e.nome ilike 'solo%'
   and fe.source = 'opportunity_created'
   and fe.event in ('won', 'lost')
   and fe.occurred_at is distinct from coalesce(o.closed_at, o.created_at)
 order by fe.occurred_at;

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
    -- PADRÃO: sem marco; realizada/no-show pelo botão de desfecho.
    ('reunião de apresentação', null::text,          'Sem marco: realizada/no-show pelo botão. ALTERNATIVA (card entra DEPOIS da reunião): meeting_done.'),
    ('visita técnica',          null::text,          'Sem marco: realizada/no-show pelo botão. ALTERNATIVA (card entra DEPOIS da visita): meeting_done.'),
    -- ALTERNATIVA: ('reunião de apresentação', 'meeting_done', 'CONFIRMADO: card entra depois da reunião'),
    -- ALTERNATIVA: ('visita técnica',          'meeting_done', 'CONFIRMADO: card entra depois da visita'),
    ('elaboração de proposta',  null::text,          'CONFIRMAR: proposto sem marco (proposta ainda não enviada).')
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

-- Os pipelines da Solo e os marcos que este replay pode tocar.
create temp table _solo_pipes on commit drop as
  select p.id from public.pipelines p join public.equipes e on e.id = p.equipe_id
   where e.nome ilike 'solo%' and p.deleted_at is null;
create temp table _open_marcos (event text primary key) on commit drop;
insert into _open_marcos values
  ('qualified'), ('proposal_sent'), ('meeting_scheduled'), ('meeting_done'),
  ('no_show'), ('contract_sent'), ('contract_signed');

-- Impressão digital do que NÃO pode mudar: tudo fora (derivado x marco aberto).
create temp table _intocado_antes on commit drop as
  select fe.id, fe.event, fe.occurred_at, fe.source
    from public.funnel_events fe
   where fe.pipeline_id in (select id from _solo_pipes)
     and not (fe.source in ('stage_change', 'opportunity_created')
              and fe.event in (select event from _open_marcos));

-- Backup das linhas que serão apagadas, com RLS na mesma transação.
create table if not exists public.funnel_events_backup_sesup1_8 as
  select fe.*
    from public.funnel_events fe
   where fe.pipeline_id in (select id from _solo_pipes)
     and fe.source in ('stage_change', 'opportunity_created')
     and fe.event in (select event from _open_marcos);
alter table public.funnel_events_backup_sesup1_8 enable row level security;
revoke all on public.funnel_events_backup_sesup1_8 from anon, authenticated;

-- Contagem ANTES, por marco.
select fe.event, count(*) as antes
  from public.funnel_events fe
 where fe.pipeline_id in (select id from _solo_pipes)
 group by fe.event order by fe.event;

-- O mapa. Só etapas abertas, só nomes com regra; o resto fica como está.
with regra(etapa_norm, marco) as (
  values
    ('qualificação',            'qualified'),
    ('envio de proposta',       'proposal_sent'),
    ('negociação de proposta',  'proposal_sent'),
    ('negociação',              'proposal_sent'),
    ('agendamento de reunião',  'meeting_scheduled'),
    -- PADRÃO: sem marco (realizada/no-show pelo botão de desfecho)
    ('reunião de apresentação', null::text),
    ('visita técnica',          null::text),
    -- ALTERNATIVA (só se o gestor confirmar que o card entra DEPOIS da reunião):
    -- ('reunião de apresentação', 'meeting_done'),
    -- ('visita técnica',          'meeting_done'),
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

-- Replay PARCIAL: apaga só o derivado dos marcos abertos...
delete from public.funnel_events fe
 where fe.pipeline_id in (select id from _solo_pipes)
   and fe.source in ('stage_change', 'opportunity_created')
   and fe.event in (select event from _open_marcos);

-- ...refaz as transições (seção 1 do _rebuild_funnel_events, só marcos abertos)...
insert into public.funnel_events
  (equipe_id, opportunity_id, lead_id, pipeline_id, stage_id, event,
   occurred_at, source, actor, actor_type, source_row_id)
select h.equipe_id, h.opportunity_id, o.lead_id, o.pipeline_id, h.to_stage_id,
       e.funnel_event, h.changed_at, 'stage_change', h.changed_by,
       coalesce(nullif(h.changed_by_type, ''), 'team'), h.id
  from public.opportunity_stage_history h
  join public.opportunities o        on o.id = h.opportunity_id
  join public.v_stage_funnel_event e on e.stage_id = h.to_stage_id
 where o.pipeline_id in (select id from _solo_pipes)
   and o.deleted_at is null
   and e.funnel_event in (select event from _open_marcos)
on conflict do nothing;

-- ...e os nascimentos em etapa aberta com marco (seção 2, só marcos abertos; a data
-- é created_at — igual ao gatilho vivo para marcos abertos).
insert into public.funnel_events
  (equipe_id, opportunity_id, lead_id, pipeline_id, stage_id, event,
   occurred_at, source, actor, actor_type)
select o.equipe_id, o.id, o.lead_id, o.pipeline_id, b.birth_stage_id,
       e.funnel_event, o.created_at, 'opportunity_created', null, 'system'
  from public.opportunities o
  cross join lateral (
    select case
             when exists (select 1 from public.opportunity_stage_history h where h.opportunity_id = o.id)
             then (select h2.from_stage_id from public.opportunity_stage_history h2
                    where h2.opportunity_id = o.id
                    order by h2.changed_at asc, h2.id asc limit 1)
             else o.stage_id
           end as birth_stage_id
  ) b
  join public.v_stage_funnel_event e on e.stage_id = b.birth_stage_id
 where o.pipeline_id in (select id from _solo_pipes)
   and o.deleted_at is null
   and e.funnel_event in (select event from _open_marcos)
on conflict do nothing;

-- Guarda: nada fora do recorte mudou (won/lost/recompute/manual/import/status_change).
do $$
declare v_diff int;
begin
  select count(*) into v_diff from (
    (select id, event, occurred_at, source from _intocado_antes
     except
     select fe.id, fe.event, fe.occurred_at, fe.source from public.funnel_events fe
      where fe.pipeline_id in (select id from _solo_pipes)
        and not (fe.source in ('stage_change', 'opportunity_created')
                 and fe.event in (select event from _open_marcos)))
    union all
    (select fe.id, fe.event, fe.occurred_at, fe.source from public.funnel_events fe
      where fe.pipeline_id in (select id from _solo_pipes)
        and not (fe.source in ('stage_change', 'opportunity_created')
                 and fe.event in (select event from _open_marcos))
     except
     select id, event, occurred_at, source from _intocado_antes)
  ) d;
  if v_diff > 0 then
    raise exception 'ABORTADO: % linha(s) fora do recorte mudaram — nada aplicado', v_diff;
  end if;
end $$;

-- Contagem DEPOIS, por marco — conferir com o gestor antes do COMMIT.
-- Esperado: won/lost/no_show idênticos ao ANTES (não são refeitos aqui);
-- meeting_done só de botão (as etapas de reunião ficaram sem marco).
select fe.event, count(*) as depois
  from public.funnel_events fe
 where fe.pipeline_id in (select id from _solo_pipes)
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
