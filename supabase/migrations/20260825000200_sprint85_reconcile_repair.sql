-- 20260825000200_sprint85_reconcile_repair.sql
-- Sprint 8.5 · desfaz a primeira conciliação, que cobrou um mês inteiro de
-- consumo contra um ledger que existia havia um dia.
--
-- O QUE ACONTECEU, em 2026-08-25 04:30, na primeira execução do
-- `credits-reconcile` depois que o cron foi agendado:
--
--   equipe                   provider (mês)   ledger tinha   lançou
--   Casa Flow                        8540            500     -8040
--   Solo Energia                     7000              0     -7000
--   Walter Inglez Advogados            20              0       -20
--
-- O reconciliador pergunta ao GPT Maker quanto o agente gastou no MÊS
-- CALENDÁRIO e compara com o que o nosso ledger registrou desde o dia 1º. Só
-- que o primeiro lançamento do `credit_ledger` é de 2026-08-24 16:06 — o ledger
-- tinha um dia de vida. Ele comparou 24 dias de consumo do provider contra 1 dia
-- de registro e lançou a diferença inteira como dívida.
--
-- O comentário do backfill do Sprint 8 já dizia que o consumo anterior "nunca
-- foi lançado e não pode ser reconstruído". O que faltou foi ensinar isso ao
-- reconciliador: ele não tinha noção de "a partir de quando esta equipe passa a
-- ser medida".
--
-- POR QUE COMPENSAR E NÃO APAGAR: o ledger é append-only por decisão de projeto
-- — é o que torna o saldo auditável. Apagar a linha errada esconderia que ela
-- existiu; um lançamento positivo com motivo mostra o erro e a correção, que é
-- o que um cliente tem direito de ver no extrato.
--
-- A correção da CAUSA está em `credits-reconcile/index.ts`: um mês em que a
-- medição começou no meio é pulado, porque a API do provider só responde por
-- mês fechado e não há como comparar meio mês com mês inteiro.

do $$
declare
  r        record;
  v_count  integer := 0;
  v_total  integer := 0;
begin
  for r in
    select l.id, l.equipe_id, l.credits, e.nome,
           l.metadata->>'period' as periodo
    from public.credit_ledger l
    join public.equipes e on e.id = l.equipe_id
    where l.source = 'reconcile'
      and l.entry_type = 'adjustment'
      and l.credits < 0
      -- Só a rodada defeituosa: agosto/2026, o único mês em que a medição
      -- começou depois do dia 1º. Em setembro em diante a conciliação é válida
      -- e não deve ser desfeita por esta migration.
      and l.metadata->>'period' = '2026-08'
  loop
    insert into public.credit_ledger (
      equipe_id, entry_type, credits, source, pool, idempotency_key, metadata
    ) values (
      r.equipe_id,
      'adjustment',
      -r.credits,                      -- positivo, exatamente o que foi tirado
      'reconcile',
      'whatsapp',
      'reconcile_repair_' || r.id::text,
      jsonb_build_object(
        'reason', 'estorno da conciliacao de 2026-08',
        'reverses_ledger_id', r.id,
        'why', 'o reconciliador comparou o mes inteiro do provider com um ledger de um dia'
      )
    )
    on conflict (equipe_id, idempotency_key) do nothing;

    if found then
      perform public.recompute_credit_balance(r.equipe_id, 'whatsapp');
      v_count := v_count + 1;
      v_total := v_total + (-r.credits);
      raise notice 'estornado: % -> +% creditos', r.nome, -r.credits;
    end if;
  end loop;

  raise notice 'Sprint 8.5 reparo: % lancamentos estornados, % creditos devolvidos', v_count, v_total;
end $$;

-- ============================================================================
-- ASSERÇÕES — o saldo tem de refletir as recargas de novo
-- ============================================================================

do $$
declare v_bad integer; v_solo integer;
begin
  -- (a) nenhuma equipe pode ficar com soma negativa no pool de atendimento,
  --     que é o sintoma exato de "recarreguei e não mudou nada": credit_balance
  --     é greatest(0, soma), então uma soma negativa engole toda recarga futura
  --     sem aparecer em lugar nenhum.
  select count(*) into v_bad
  from public.equipes e
  where (select coalesce(sum(credits), 0) from public.credit_ledger l
          where l.equipe_id = e.id and l.pool = 'whatsapp') < 0;
  assert v_bad = 0,
    format('ASSERT FAILED: %s equipe(s) ainda com soma negativa — recargas continuariam sumindo', v_bad);

  -- (b) a Solo Energia recebeu 1500 em recargas (500 em 24/08 + 500 + 500 em
  --     25/08) e nada consumiu pelo ledger. O saldo tem de mostrar isso.
  select public.credit_balance(id, 'whatsapp') into v_solo
    from public.equipes where nome = 'Solo Energia';
  if v_solo is not null then
    assert v_solo >= 1500,
      format('ASSERT FAILED: Solo Energia com %s creditos, esperado ao menos 1500', v_solo);
  end if;

  raise notice 'Sprint 8.5 reparo: assercoes passaram';
end $$;
