-- 20260902000500_sprint82_onboarding_backfill.sql
-- Sprint 8.2 · quem já estava aqui entra no quadro.
--
-- Sem isto o kanban nasce vazio e o fundador tem que arrastar oito clientes à
-- mão para descobrir que sete deles já estão no ar. Pior: os dois que de fato
-- estão em implantação — WI Advogados e Rema Digital — ficariam invisíveis
-- justamente na semana em que precisam de acompanhamento.
--
-- POR NOME, NÃO POR ID. Escrever uuids de produção numa migration a faz
-- fracassar em qualquer outro banco, e este arquivo tem que rodar num ambiente
-- limpo sem explodir. O casamento é por nome exato, e um nome que não existe
-- simplesmente não gera card.
--
-- Idempotente: `on conflict (equipe_id) do nothing`. Rodar de novo não move
-- ninguém de volta — o estágio de um card é decidido pelo fundador no quadro a
-- partir do momento em que ele existe, e uma migration não pode desfazer isso.
--
-- PROPOSTAS EM ABERTO NÃO VIRAM CARD. PlanLog e Casa Flow ADS estão em
-- 'enviada'/'vista': ainda são pipeline comercial, e a aba Propostas já é o
-- lugar delas. Um card só nasce quando existe um compromisso a implantar.

do $$
declare
  v_ativo       uuid := public.onboarding_stage_id('ativo');
  v_implantacao uuid := public.onboarding_stage_id('implantacao');
  v_aceite      uuid := public.onboarding_stage_id('aceite');
  v_nome        text;
  v_criados     integer := 0;
begin

  -- ── 1. Quem opera: entra em Ativo ────────────────────────────────────────
  --
  -- Cliente no ar não é trabalho em andamento, e a coluna Ativo vem colapsada
  -- por padrão — então eles ficam fora do caminho sem sumirem do sistema.
  for v_nome in
    select unnest(array[
      'Solo Energia',
      'Casa Flow',
      'Jornada do R1',
      'Cinemas Benficas',
      'Lucas Castelo Nutricionista',
      'Be My Guest'
    ])
  loop
    insert into public.onboardings (equipe_id, stage_id, cliente_nome, went_live_at)
    select e.id, v_ativo, e.nome, e.created_at
      from public.equipes e
     where e.nome = v_nome
       -- Quando há homônimos (as duplicatas de 02/09), fica a equipe com
       -- operação de verdade. A limpeza de produção resolve o resto.
     order by (select count(*) from public.leads l where l.equipe_id = e.id) desc
     limit 1
    on conflict (equipe_id) do nothing;

    v_criados := v_criados + case when found then 1 else 0 end;
  end loop;

  -- ── 2. Quem está sendo implantado agora ──────────────────────────────────
  --
  -- WI Advogados e Rema Digital aceitaram e estão em implantação. A previsão
  -- fica em 21 dias a partir de hoje: é o prazo real de uma implantação com
  -- discovery, treinamento e integração de anúncios, e é a data que o cliente
  -- vê no vencimento da fatura de implantação.
  for v_nome in
    select unnest(array['WI Advogados', 'Walter Inglez Advogados', 'Rema Digital'])
  loop
    insert into public.onboardings (equipe_id, stage_id, cliente_nome, golive_previsto)
    select e.id, v_implantacao, e.nome, current_date + 21
      from public.equipes e
     where e.nome = v_nome
     order by e.created_at desc
     limit 1
    on conflict (equipe_id) do nothing;
  end loop;

  -- ── 3. Propostas aceitas que ainda não têm ambiente ──────────────────────
  --
  -- Ficam em Aceite, que é literalmente o que são: um compromisso fechado
  -- esperando o clique de provisionar.
  insert into public.onboardings (proposal_id, stage_id, cliente_nome)
  select p.id, v_aceite, p.cliente_nome
    from public.proposals p
   where p.status = 'aceita'
     and p.equipe_id is null
  on conflict (proposal_id) do nothing;

  -- ── 4. Amarra o card à proposta de quem já tem as duas coisas ────────────
  --
  -- O card do passo 1 e 2 nasceu só com equipe. Ligar a proposta faz o valor
  -- mensal aparecer no card e o link para a proposta funcionar no detalhe.
  update public.onboardings o
     set proposal_id = p.id
    from public.proposals p
   where p.equipe_id = o.equipe_id
     and o.proposal_id is null
     and p.status = 'aceita'
     -- proposal_id é unique: uma proposta já usada por outro card não pode ser
     -- reaproveitada aqui.
     and not exists (select 1 from public.onboardings x where x.proposal_id = p.id);

  raise notice 'Sprint 8.2 · backfill: % cards de clientes ativos', v_criados;
end $$;

-- ============================================================================
-- 5. AS FATURAS DE IMPLANTAÇÃO QUE JÁ EXISTEM
--
-- Uma fatura de implantação emitida ANTES desta sprint está aberta, sem
-- cobrança, e com metadata vazio — que é exatamente o que voidOrphanInvoices()
-- do billing-cron considera entulho de gateway e anula depois de 2 horas. O
-- cron roda todo dia às 12h UTC e está ativo.
--
-- Em produção isso é uma fatura concreta: FAT-2026-000018, R$700, da Rema
-- Digital. Sem esta marca ela desaparece sozinha na próxima execução, e nada
-- registraria que ela existiu.
--
-- O vencimento também é corrigido para a data prevista de conclusão, que é o
-- modelo novo: o cliente vê como prazo o dia da entrega prometida.
-- ============================================================================

update public.invoices i
   set metadata = i.metadata || '{"awaiting_golive": true}'::jsonb,
       due_date = coalesce(o.golive_previsto, i.due_date)
  from public.contracts c
  left join public.onboardings o on o.equipe_id = c.equipe_id
 where i.contract_id = c.id
   and i.kind = 'setup'
   and i.status = 'open'
   and i.asaas_payment_id is null
   -- Só as que ainda não foram ao ar. Depois do go-live, uma fatura sem
   -- cobrança É entulho, e o cron deve mesmo anulá-la e reemitir.
   and c.went_live_at is null;

-- ============================================================================
-- ASSERÇÕES
-- ============================================================================

do $$
declare
  v_cnt   integer;
  v_stage text;
begin
  -- (a) todo cliente com operação real tem card
  select count(*) into v_cnt
    from public.equipes e
   where (select count(*) from public.leads l where l.equipe_id = e.id) > 10
     and not exists (select 1 from public.onboardings o where o.equipe_id = e.id);
  assert v_cnt = 0,
    format('ASSERT FAILED: %s equipe(s) com mais de 10 leads ficaram fora do quadro', v_cnt);

  -- (b) um cliente, um card — o quadro não pode mostrar ninguém duas vezes
  select count(*) into v_cnt from (
    select equipe_id from public.onboardings
     where equipe_id is not null
     group by equipe_id having count(*) > 1
  ) d;
  assert v_cnt = 0, format('ASSERT FAILED: %s equipe(s) com card duplicado', v_cnt);

  -- (c) propostas ainda em negociação NÃO viraram card
  select count(*) into v_cnt
    from public.onboardings o
    join public.proposals p on p.id = o.proposal_id
   where p.status in ('enviada', 'vista', 'rascunho');
  assert v_cnt = 0,
    format('ASSERT FAILED: %s proposta(s) em negociação viraram card de onboarding', v_cnt);

  -- (d) todo card gerou seu evento de entrada
  select count(*) into v_cnt
    from public.onboardings o
   where not exists (select 1 from public.onboarding_events e where e.onboarding_id = o.id);
  assert v_cnt = 0, format('ASSERT FAILED: %s card(s) sem histórico de entrada', v_cnt);

  -- (e) quem está em implantação tem previsão de conclusão — é o vencimento
  --     que o cliente vê, então um card sem ela é uma fatura sem data
  select count(*) into v_cnt
    from public.onboardings o
    join public.onboarding_stages s on s.id = o.stage_id
   where s.code = 'implantacao' and o.golive_previsto is null;
  assert v_cnt = 0,
    format('ASSERT FAILED: %s card(s) em implantação sem previsão de conclusão', v_cnt);

  -- (f) nenhuma fatura de implantação pendente está exposta ao cron
  select count(*) into v_cnt
    from public.invoices i
    join public.contracts c on c.id = i.contract_id
   where i.kind = 'setup' and i.status = 'open'
     and i.asaas_payment_id is null
     and c.went_live_at is null
     and coalesce(i.metadata->>'awaiting_golive', 'false') <> 'true';
  assert v_cnt = 0,
    format('ASSERT FAILED: %s fatura(s) de implantação seriam anuladas pelo billing-cron', v_cnt);

  raise notice 'Sprint 8.2 · backfill: asserções passaram';
end $$;
