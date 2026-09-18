-- SE-FIX-002 — leitura por etapa para a seção Metas (Pipelines → Config → Metas).
--
-- RENUMERADA de 20260918000100 para 20260918000500 em 18/09/2026.
--
-- Duas migrations nasceram no mesmo dia com o mesmo prefixo: esta e
-- 20260918000100_sprint82_discovery_bank.sql. O histórico do Supabase é chaveado
-- pela VERSÃO, não pelo nome — e a do discovery chegou primeiro ao banco. Com o
-- número ocupado, `db push` considerava esta aqui já aplicada e a pulava para
-- sempre: `fn_stage_conversion_plan` não existia no banco enquanto a seção Metas
-- já a chamava em produção. Renumerar foi o que fez esta migration voltar a
-- rodar.
--
-- O número escolhido fica DEPOIS da última já aplicada (20260918000400) de
-- propósito: um número no meio faria o CLI exigir `--include-all`, que reaplica
-- toda migration fora de ordem — inclusive as que alguém já rodou à mão e que
-- não constam do histórico. Aqui nada depende da ordem: são duas funções de
-- leitura sobre tabelas que já existem desde 20260621002000.
--
-- NADA AQUI É DESTRUTIVO. São dois `create or replace function` de LEITURA:
-- nenhuma tabela, coluna, índice ou linha é criada, alterada ou apagada.
--
-- POR QUE UMA MIGRATION
--
-- A seção Metas precisa de três coisas por etapa que o RPC atual
-- (fn_stage_conversion_rates, 20260621002000) não devolve:
--
--   1. `stage_type` — para separar as etapas de PASSAGEM (`open`) das terminais
--      (`won`/`lost`) e da etapa de reciclo (`ciclo`). Sem isso o front pega a
--      "última etapa" e usa a taxa de Perdido/Ganho como se fosse a conversão do
--      funil (era o que o preview antigo fazia).
--   2. `funnel_event` — para saber qual etapa É a reunião feita
--      ('meeting_done'), e assim derivar quantas reuniões a meta exige.
--   3. o tempo médio REAL por etapa — calculado do histórico de etapas
--      (`opportunity_stage_history`), que só o banco agrega com honestidade.
--      É o "SLA médio por etapa" para bater o lead time de vendas.
--
-- O `max_idle_hours` também vem: é o SLA DECLARADO da etapa (Sprint 5.1),
-- diferente do tempo médio observado. Os dois aparecem lado a lado na tela.
--
-- ESCOPO DERIVADO, NUNCA RECEBIDO (padrão do Sprint 9/11)
--
-- A função é SECURITY DEFINER e chega ao PostgREST para qualquer autenticado,
-- então um parâmetro de equipe seria leitura cross-tenant de uma linha. A equipe
-- vem de `profiles.equipe_id` do auth.uid() e é conferida contra a equipe da
-- linha alvo — mesmo padrão de `record_funnel_event` (20260830000300:467-471) e
-- `_funnel_scope` (20260830000600:49-76).
--
-- Sem `p_equipe_id`. Sem `p_from`/`p_to` por enquanto: a janela temporal entra
-- na próxima onda, quando o histórico tiver volume para recortar por período.

begin;

-- ============================================================================
-- 1. O PLANO POR ETAPA (leitura)
-- ============================================================================

create or replace function public.fn_stage_conversion_plan(p_pipeline_id uuid)
returns table (
  stage_id            uuid,
  stage_name          text,
  stage_position      int,
  stage_type          text,
  funnel_event        text,
  max_idle_hours      int,
  historical_rate     numeric,  -- avançou / entrou; NULL quando não há histórico
  entered_count       int,
  advanced_count      int,
  avg_days_in_stage   numeric   -- dias médios entre entrar e sair desta etapa
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_equipe          uuid;
  v_pipeline_equipe uuid;
begin
  select p.equipe_id into v_equipe
    from public.profiles p
   where p.id = auth.uid();

  if v_equipe is null then
    raise exception 'no_team' using errcode = '42501';
  end if;

  select pl.equipe_id into v_pipeline_equipe
    from public.pipelines pl
   where pl.id = p_pipeline_id and pl.deleted_at is null;

  -- Linha inexistente e linha de outra equipe respondem igual: não confirmamos
  -- a existência de um pipeline que o chamador não pode ver.
  if v_pipeline_equipe is null or v_pipeline_equipe <> v_equipe then
    raise exception 'pipeline_not_found' using errcode = 'P0002';
  end if;

  return query
  with entered as (
    select osh.to_stage_id as sid,
           count(distinct osh.opportunity_id)::int as n
      from public.opportunity_stage_history osh
     where osh.equipe_id = v_equipe
     group by osh.to_stage_id
  ),
  advanced as (
    select osh.from_stage_id as sid,
           count(distinct osh.opportunity_id)::int as n
      from public.opportunity_stage_history osh
     where osh.equipe_id = v_equipe
       and osh.from_stage_id is not null
     group by osh.from_stage_id
  ),
  -- Tempo de permanência por etapa.
  --
  -- A linha do histórico é gravada NO MOVIMENTO (trigger
  -- log_opportunity_stage_change, 20260419110000_epic2_pipelines.sql:174-177) com
  -- from = etapa de origem e to = etapa de destino. Logo `changed_at` é o instante
  -- em que o negócio SAIU de `from_stage_id`. O tempo passado em cada etapa é,
  -- portanto:
  --     (changed_at desta linha) - (changed_at da linha anterior do mesmo negócio)
  -- chaveado por `from_stage_id`. Para a PRIMEIRA linha do negócio não existe linha
  -- anterior: essa etapa é aquela em que ele NASCEU, e o instante de entrada é
  -- `opportunities.created_at`.
  --
  -- Duas alternativas que NÃO servem: chavear por `to_stage_id` com `lead` mede só
  -- as etapas já deixadas e nunca a primeira; e chavear por `from_stage_id` com
  -- `lead` mede o tempo da etapa SEGUINTE — o número sai deslocado em uma etapa,
  -- que foi exatamente o defeito desta versão antes da correção.
  --
  -- A etapa ATUAL de cada negócio não recebe linha nenhuma: ela nunca aparece como
  -- `from`, porque ninguém saiu dela ainda. É isso que impede o tempo de quem está
  -- parado há 60 dias de contaminar o SLA de quem já saiu — e é também por isso que
  -- a última etapa do funil costuma não ter média (ninguém sai de Ganho).
  dwell as (
    select sid, round(avg(diff_days)::numeric, 1) as d
      from (
        select osh.from_stage_id as sid,
               extract(epoch from (
                 osh.changed_at - coalesce(
                   lag(osh.changed_at) over (
                     -- o.id desempata: dois movimentos com o mesmo carimbo
                     -- deixariam a ordem indefinida e o SLA instável entre execuções.
                     partition by osh.opportunity_id order by osh.changed_at, osh.id
                   ),
                   o.created_at
                 )
               )) / 86400.0 as diff_days
          from public.opportunity_stage_history osh
          join public.opportunities o on o.id = osh.opportunity_id
         where osh.equipe_id = v_equipe
           and osh.from_stage_id is not null
      ) x
     where x.diff_days is not null
       and x.diff_days >= 0  -- backfill com carimbo fora de ordem não pode virar SLA negativo
     group by sid
  )
  select
    s.id,
    s.name::text,
    s.position::int,
    s.stage_type::text,
    s.funnel_event::text,
    s.max_idle_hours,
    case
      when coalesce(e.n, 0) = 0 then null
      else round(coalesce(a.n, 0)::numeric / e.n, 4)
    end,
    coalesce(e.n, 0),
    coalesce(a.n, 0),
    dw.d
  from public.pipeline_stages_v2 s
  left join entered  e  on e.sid = s.id
  left join advanced a  on a.sid = s.id
  left join dwell    dw on dw.sid = s.id
  where s.pipeline_id = p_pipeline_id
    and s.deleted_at is null
  order by s.position asc;
end;
$$;

comment on function public.fn_stage_conversion_plan(uuid) is
  'SE-FIX-002: por etapa do pipeline — tipo, marco de funil, SLA declarado, taxa histórica (avançou/entrou) e tempo médio real de permanência. Leitura, escopo derivado do auth.uid().';

revoke all on function public.fn_stage_conversion_plan(uuid) from public, anon;
grant execute on function public.fn_stage_conversion_plan(uuid) to authenticated;

-- ============================================================================
-- 2. ESCOPO EXPLÍCITO em fn_stage_conversion_rates (mesma assinatura)
-- ============================================================================
--
-- A versão do Sprint 6.7 resolve `v_equipe_id` (20260621002000:11-13) e NUNCA
-- usa a variável — código morto: as duas LATERAL contam sem filtro de equipe.
--
-- QUANTO ISSO DE FATO VAZAVA, para não superdimensionar a correção: menos do que
-- a variável morta sugere. A junção `osh.to_stage_id = s.id` / `osh.from_stage_id
-- = s.id` já amarra a contagem a UMA etapa, e etapa pertence a uma única equipe —
-- então na prática o resultado já era da equipe da linha. E `opportunity_stage_history`
-- tem RLS com policy de SELECT por equipe (20260419110000_epic2_pipelines.sql:225,
-- :264-267), que recorta o caminho autenticado. Não há, portanto, um vazamento
-- demonstrado entre tenants nesta função.
--
-- O que a mudança faz é tornar o recorte EXPLÍCITO em vez de deixá-lo depender de
-- um join e de RLS — quem chamar com `service_role` (que ignora RLS) passa a ter o
-- mesmo resultado do caminho autenticado, e a variável morta sai do caminho. É
-- endurecimento, não correção de vazamento.
--
-- O corpo abaixo é o original, com `osh.equipe_id = v_equipe_id` nas duas
-- contagens. A assinatura e o shape de retorno não mudam, então nenhum consumidor
-- precisa mudar. Efeito colateral possível: se houver histórico de equipe A
-- apontando para etapa da equipe B (dado inconsistente), essas linhas deixam de
-- contar. É o comportamento desejado.
--
-- ROLLBACK: reaplicar o arquivo 20260621002000_sprint67_stage_conversion.sql.

create or replace function public.fn_stage_conversion_rates(p_pipeline_id uuid)
returns table (stage_id uuid, stage_name text, stage_position int, conversion_rate numeric)
language plpgsql
stable
as $$
declare
  v_equipe_id uuid;
begin
  select p.equipe_id into v_equipe_id
    from public.pipelines p
   where p.id = p_pipeline_id and p.deleted_at is null;

  if v_equipe_id is null then
    return;
  end if;

  return query
  select
    s.id,
    s.name::text,
    s.position::int,
    case
      when entered.count = 0 then 1.0
      else round(coalesce(advanced.count, 0)::numeric / entered.count, 4)
    end
  from public.pipeline_stages_v2 s
  left join lateral (
    select count(distinct osh.opportunity_id) as count
      from public.opportunity_stage_history osh
     where osh.to_stage_id = s.id
       and osh.equipe_id = v_equipe_id
  ) entered on true
  left join lateral (
    select count(distinct osh.opportunity_id) as count
      from public.opportunity_stage_history osh
     where osh.from_stage_id = s.id
       and osh.equipe_id = v_equipe_id
  ) advanced on true
  where s.pipeline_id = p_pipeline_id
    and s.deleted_at is null
  order by s.position asc;
end;
$$;

comment on function public.fn_stage_conversion_rates(uuid) is
  'Sprint 6.7 + SE-FIX-002: per-stage conversion rate = advanced / entered, 1.0 quando não há histórico. Escopo por equipe aplicado nas duas contagens.';

commit;
