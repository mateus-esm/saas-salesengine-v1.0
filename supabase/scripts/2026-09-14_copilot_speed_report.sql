-- Sprint 11 · Onda 6 · T66 — quão rápido e quão bem o Copilot está (somente leitura).
--
-- Metas da onda: ~4 s por negócio (contexto + modelo + aplicar); o Sync pedido
-- mostra o resultado em menos de 10 s; a primeira palavra do chat em menos de 2 s
-- (o chat mede o planejar e as consultas antes do texto começar — `planner_ms` +
-- `tools_ms` é o que o usuário espera antes da primeira palavra).
--
-- Rodar no SQL Editor (ou `python q.py -f`), depois do piloto.

-- 1. A passada por negócio, nos últimos 7 dias.
select 'passada por negócio' as medida,
       count(*) as n,
       percentile_cont(0.5) within group (order by (payload->'timings'->>'context_ms')::int) as contexto_p50_ms,
       percentile_cont(0.5) within group (order by (payload->'timings'->>'model_ms')::int)   as modelo_p50_ms,
       percentile_cont(0.5) within group (order by (payload->'timings'->>'apply_ms')::int)   as aplicar_p50_ms,
       percentile_cont(0.5) within group (order by coalesce((payload->'timings'->>'context_ms')::int, 0)
                                                 + coalesce((payload->'timings'->>'model_ms')::int, 0)
                                                 + coalesce((payload->'timings'->>'apply_ms')::int, 0)) as total_p50_ms,
       percentile_cont(0.9) within group (order by coalesce((payload->'timings'->>'context_ms')::int, 0)
                                                 + coalesce((payload->'timings'->>'model_ms')::int, 0)
                                                 + coalesce((payload->'timings'->>'apply_ms')::int, 0)) as total_p90_ms
  from public.copilot_run_events
 where kind = 'keeper_done' and created_at > now() - interval '7 days';

-- 2. Da fila ao fim, por motivo: quanto esperou para ser pego e quanto levou.
select reason as motivo,
       count(*) filter (where status = 'done')    as feitos,
       count(*) filter (where status = 'skipped') as nada_novo,
       count(*) filter (where status = 'failed')  as falharam,
       round(extract(epoch from percentile_cont(0.5) within group (order by claimed_at - run_after))::numeric, 1) as espera_p50_s,
       round(extract(epoch from percentile_cont(0.5) within group (order by finished_at - claimed_at))::numeric, 1) as passada_p50_s,
       round(extract(epoch from percentile_cont(0.9) within group (order by finished_at - created_at))::numeric, 1) as pedido_ao_fim_p90_s
  from public.copilot_jobs
 where created_at > now() - interval '7 days' and finished_at is not null
 group by reason
 order by reason;

-- 3. O chat: planejar, consultar, responder.
select 'chat' as medida,
       count(*) as respostas,
       percentile_cont(0.5) within group (order by (meta->>'planner_ms')::int + coalesce((meta->>'tools_ms')::int, 0)) as ate_a_primeira_palavra_p50_ms,
       percentile_cont(0.9) within group (order by (meta->>'planner_ms')::int + coalesce((meta->>'tools_ms')::int, 0)) as ate_a_primeira_palavra_p90_ms,
       percentile_cont(0.5) within group (order by (meta->>'total_ms')::int) as total_p50_ms,
       count(*) filter (where meta ? 'error') as falharam
  from public.copilot_messages
 where role = 'assistant' and created_at > now() - interval '7 days' and meta ? 'planner_ms';

-- 4. O que o Copilot fez e quanto foi desfeito (a precisão vista pela equipe).
select count(*) filter (where status in ('auto_applied', 'executed', 'undone')) as aplicadas,
       count(*) filter (where status = 'undone')   as desfeitas,
       count(*) filter (where status = 'executed') as aprovadas,
       count(*) filter (where status = 'rejected') as recusadas,
       count(*) filter (where status = 'stale')    as desatualizadas,
       count(*) filter (where status in ('pending_approval', 'proposed')) as esperando
  from public.ai_decisions
 where agent_role = 'copilot' and created_at > now() - interval '7 days';

-- 5. Por que falhou.
select left(last_error, 80) as motivo, count(*) as vezes
  from public.copilot_jobs
 where status = 'failed' and finished_at > now() - interval '7 days'
 group by 1 order by 2 desc limit 10;
