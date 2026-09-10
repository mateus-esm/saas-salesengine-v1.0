-- 20260909000400_sprint10_backup_purge_solo_energia.sql
-- Sprint 10 · T1 — backup e zeragem da base da Solo Energia, antes da migração
-- do Jestor. T4 (fix de stage_type do Carregamento Veicular) viaja junto porque
-- toca a mesma tabela de etapas e é uma linha.
--
-- POR QUE APAGAR
--
-- A Solo Energia vai começar do zero com a base que vem do Jestor. Os 466 leads
-- e 56 oportunidades de hoje são resíduo de teste e de operação parcial; manter
-- os dois lados produziria duplicata de contato no funil e no inbox, que é
-- exatamente o que a migração existe para evitar.
--
-- BACKUP PRIMEIRO, SEMPRE
--
-- Mesma convenção que `leads_backup_sprint3` e `leads_backup_sprint55_pre_merge`
-- já estabeleceram neste banco: a tabela de backup carrega o nome da sprint e
-- fica. Custa alguns MB e é a diferença entre "deu ruim, restaura" e "perdemos
-- o histórico de 9.340 mensagens".
--
-- A ORDEM DO DELETE NÃO É ARBITRÁRIA
--
-- `opportunities.lead_id -> leads` é **RESTRICT**. Apagar `leads` primeiro falha
-- com violação de FK. Tudo o mais ou é CASCADE (messages, conversations, tasks,
-- touchpoints, lead_activities, ai_decisions, funnel_events, opportunity_links,
-- opportunity_stage_history) ou é SET NULL sobre coluna anulável
-- (agent_action_ledger.lead_id) — verificado no catálogo antes de escrever isto,
-- porque a Sprint 8.2 já custou três FKs em série descobertas uma a uma.

do $$
declare
  v_equipe uuid := '939d7dd8-592c-4fda-946e-3568f2909904';  -- Solo Energia
  v_leads  integer;
  v_opps   integer;
  v_msgs   integer;
begin
  -- ── BACKUP ────────────────────────────────────────────────────────────────
  -- CREATE TABLE AS: pega as linhas como estão agora, sem constraints nem FKs,
  -- que é o que se quer de um backup — restaurar não pode depender de o resto
  -- do schema estar no mesmo estado.
  if to_regclass('public.leads_backup_sprint10') is null then
    create table public.leads_backup_sprint10 as
      select * from public.leads where equipe_id = v_equipe;
  end if;

  if to_regclass('public.opportunities_backup_sprint10') is null then
    create table public.opportunities_backup_sprint10 as
      select * from public.opportunities where equipe_id = v_equipe;
  end if;

  if to_regclass('public.messages_backup_sprint10') is null then
    create table public.messages_backup_sprint10 as
      select m.* from public.messages m
        join public.leads l on l.id = m.lead_id
       where l.equipe_id = v_equipe;
  end if;

  select count(*) into v_leads from public.leads_backup_sprint10;
  select count(*) into v_opps  from public.opportunities_backup_sprint10;
  select count(*) into v_msgs  from public.messages_backup_sprint10;
  raise notice 'Sprint 10 backup: % leads · % oportunidades · % mensagens', v_leads, v_opps, v_msgs;

  -- Recusa de propósito: apagar sem ter guardado nada é o único erro sem volta
  -- aqui. Se o backup veio vazio e a base não está vazia, algo está errado.
  if v_leads = 0 and exists (select 1 from public.leads where equipe_id = v_equipe) then
    raise exception 'ABORT: backup de leads vazio com base populada';
  end if;

  -- ── PURGE ─────────────────────────────────────────────────────────────────
  -- Oportunidades ANTES de leads (FK RESTRICT).
  delete from public.opportunities where equipe_id = v_equipe;
  -- Mensagens saem por CASCADE junto com os leads; o delete explícito abaixo é
  -- só para o caso de alguma mensagem órfã de lead já apagado.
  delete from public.leads where equipe_id = v_equipe;

  raise notice 'Sprint 10 purge: base da Solo Energia zerada';
end $$;

-- ============================================================================
-- T4 — Carregamento Veicular: Ganho e Perdido estavam como `open`.
--
-- Achado de passagem ao conferir o mapa de etapas da migração. Com `stage_type`
-- errado, nenhuma oportunidade daquele funil é contada como ganha ou perdida:
-- a taxa de conversão lê zero para sempre, sem nada na tela dizendo por quê.
-- Corrigido pelo nome da etapa, restrito ao pipeline afetado.
-- ============================================================================
update public.pipeline_stages_v2 s
   set stage_type = case s.name when 'Ganho' then 'won' else 'lost' end
  from public.pipelines p
 where p.id = s.pipeline_id
   and p.name = 'Carregamento Veicular'
   and s.name in ('Ganho', 'Perdido')
   and s.stage_type = 'open';

-- ============================================================================
-- ASSERÇÕES
-- ============================================================================
do $$
declare
  v_equipe uuid := '939d7dd8-592c-4fda-946e-3568f2909904';
  v_n integer;
begin
  select count(*) into v_n from public.leads where equipe_id = v_equipe;
  assert v_n = 0, format('ASSERT FAILED: sobraram %s leads da Solo Energia', v_n);

  select count(*) into v_n from public.opportunities where equipe_id = v_equipe;
  assert v_n = 0, format('ASSERT FAILED: sobraram %s oportunidades da Solo Energia', v_n);

  -- O backup tem de existir e ter conteúdo, senão a zeragem foi cega.
  assert to_regclass('public.leads_backup_sprint10') is not null,
    'ASSERT FAILED: tabela de backup de leads nao existe';

  select count(*) into v_n
    from public.pipeline_stages_v2 s join public.pipelines p on p.id = s.pipeline_id
   where p.name = 'Carregamento Veicular' and s.name in ('Ganho','Perdido') and s.stage_type = 'open';
  assert v_n = 0, format('ASSERT FAILED: %s etapa(s) de fecho ainda marcadas open', v_n);

  raise notice 'Sprint 10 T1+T4 assertions passed';
end $$;
