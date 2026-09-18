# SE-FIX-002 — Seção Metas: legendas + modelo de conversão por etapa

| Campo | Valor |
|---|---|
| **Projeto** | `saas-salesengine-v1.0` |
| **Tarefa** | `SE-FIX-002` — Metas (Pipelines → Config → Metas) pouco intuitiva: campos sem legenda na divisão por vendedor e taxas de conversão que não refletem o modelo desejado |
| **Origem** | Relato do usuário sobre a seção Metas: (1) inputs por vendedor só com placeholders "Deals" e "R$", sem rótulo; (2) taxas de conversão não intuitivas — o modelo desejado é **cada etapa define a meta de passagem para a próxima**, e disso derivam as entradas de leads no topo, o tracking de reuniões realizadas / negócios fechados e o SLA médio por etapa, para bater o lead time de vendas. Contrato da tarefa em `contexto/spec.md` |
| **Agentes** | `verboo` (execução) · `verification` (verificação independente, adversarial) |
| **Status** | Código e documentação **prontos** · **validação automatizada NÃO EXECUTADA** (sandbox sem `node_modules` e sem runner de JS) · **migration escrita, não aplicada** · verificação adversarial: **PASS** após correções (1 BLOQUEADOR + 2 contradições de apresentação corrigidos; 1 afirmação do diagnóstico derrubada e corrigida; matemática confirmada por derivação independente) · sem commit, push ou PR |
| **Branch** | `fix/metas-section-conversion` (worktree `SE-FIX-002`) |
| **Data** | 2026-09-18 |

## Artefatos

| Artefato | Caminho | O que tem |
|---|---|---|
| Diagnóstico | [`verboo/diagnostico.md`](verboo/diagnostico.md) | Como a seção funciona hoje, com `arquivo:linha`; o defeito de fundo da projeção (`Infinity` / taxa da etapa terminal); o modelo de dados que já existe; lista fechada do que falta; evidência negativa; baseline de validação |
| Fix | [`verboo/fix.md`](verboo/fix.md) | Desenho do modelo por etapa + matemática + exemplo numérico; o que mudou (`arquivo:linha`); migration de leitura e como revertê-la; validação (e o que **não** foi validado); riscos com rollback; pendências nomeadas |
| Contrato | `contexto/spec.md` | Contrato original da tarefa |

### Código e migration

| Arquivo | Situação |
|---|---|
| `src/components/crm/revenue/RevenueGoalsForm.tsx` | **Reescrito.** Cabeçalho de coluna e `<Label>` na divisão por vendedor; "Metas de passagem por etapa" (input em %); "A cadeia do funil" (derivada); "Realizado no período"; removidos a projeção quebrada e o card de taxas em 0–1 |
| `src/lib/revenuePlan.ts` | **Novo.** Matemática pura da cadeia: produto das taxas, entradas por etapa, entradas no topo, reuniões, lead time, orçamento por etapa |
| `src/lib/__tests__/revenuePlan.test.ts` | **Novo.** 17 testes unitários (vitest) — escritos, **não executados** |
| `src/types/pipelines.ts` | `RevenueConfig` documentado + `target_lead_time_days?: number` |
| `supabase/migrations/20260918000100_sefix002_stage_plan_read.sql` | **Nova, de leitura, não destrutiva, NÃO APLICADA.** Cria `fn_stage_conversion_plan` e aplica escopo por equipe em `fn_stage_conversion_rates` |

## Decisões que valem saber antes de ler o resto

1. **Nenhuma tabela nova.** Reuniões realizadas e negócios fechados já existem em `funnel_events`,
   expostos pelo RPC `get_funnel_overview` do Sprint 9 — o mesmo que o dashboard usa. O fix só
   passou a lê-lo.
2. **`conversion_overrides` foi reaproveitada, não substituída.** `src/hooks/useForecast.ts:110-128`
   já aplicava a regra "meta digitada vence o histórico" — o modelo pedido já vivia no cálculo,
   faltava a tela que o expressasse. Manter a chave evita migração de dados e uma segunda fonte de
   verdade.
3. **O defeito de fundo** era `RevenueGoalsForm.tsx:381` dividir a meta pela taxa de **uma** etapa
   (a última, que é uma etapa terminal): com negócios perdidos no histórico a taxa é 0 e a tela
   mostrava `Infinity` leads. Detalhamento em `verboo/diagnostico.md` §2.4.
4. **Uma mudança fora do escopo literal foi incluída:** `fn_stage_conversion_rates` resolvia a
   equipe numa variável e **nunca a usava** (código morto; cálculo dependia de um join e de RLS
   para recortar). O fix torna o recorte explícito. **Não** é correção de vazamento — a primeira
   versão do diagnóstico afirmava que era, a verificação adversarial derrubou a afirmação e o
   documento foi corrigido. Detalhes em `verboo/diagnostico.md` §3.1 e `verboo/fix.md` §2.2/R1.
5. **A verificação adversarial encontrou um erro real no fix, que foi corrigido:** o
   `avg_days_in_stage` media o tempo da etapa **seguinte** (usava `lead` chaveado por
   `from_stage_id`, quando o correto é `lag`). Era o número-título da feature, deslocado em uma
   etapa. Corrigido, e o episódio está registrado em `verboo/fix.md` §2.1.

## Pendências

| ID | Pendência | Onde |
|---|---|---|
| PEND-001 | Nenhuma etapa pode estar mapeada como "Reunião feita" — sem isso `meeting_done` nunca nasce e "reuniões realizadas" fica 0 por falta de configuração, não por desempenho. A tela avisa | `fix.md` §7 |
| PEND-002 | A migration **não foi aplicada em nenhum ambiente** (instrução da tarefa). Sem ela, os cards 3 e 4 não aparecem | `fix.md` §7, R4 |
| PEND-003 | ~~`avg_days_in_stage` não mede a permanência na primeira etapa~~ — **fechada** ao corrigir o off-by-one, usando `opportunities.created_at` como entrada da primeira etapa | `fix.md` §7 |
| PEND-004 | O forecast do Kanban (`useForecast.ts:144-147`, `:157-173`) tem o mesmo defeito de fundo: multiplica a taxa de etapas terminais e deriva reuniões/propostas por índice fixo. **Não corrigido** (fora do relato) | `fix.md` §7 |
| PEND-005 | Metas usa `Math.ceil` e o forecast `Math.round` — podem divergir em 1 no `required_inbound` | `fix.md` §7 |
| PEND-006 | A taxa histórica é all-time; o "Realizado" é do período. Duas janelas justapostas na mesma tela | `fix.md` §7 |
| PEND-007 | `leads.meeting_*` / `no_show` existem, são legado do pré-Sprint 4 e não são usados por ninguém — dado morto que pode enganar | `fix.md` §7 |
| PEND-008 | **Typecheck, lint e testes NÃO EXECUTADOS** (sem `node_modules`, sem runner no PATH, `npm` negado pelo sandbox). Nenhum baseline foi medido — e nenhum foi inventado | `fix.md` §5, `diagnostico.md` §6 |
| PEND-009 | A migration foi revisada por leitura, não compilada por um Postgres | `fix.md` §7 |
| PEND-010 | `fn_stage_conversion_rates` continua executável por `PUBLIC`/`anon` — nenhuma das duas versões tem `revoke` (pré-existente, não introduzido pelo fix). Não adicionei `revoke` porque mudar grants de uma função existente tem raio de alcance que não pude testar | `fix.md` §7 |
| PEND-011 | Para uma etapa sem negócios entrados, Metas mostra "sem histórico" (`NULL`) e o Kanban assume 100% (`1.0`) — as duas telas podem discordar sobre a mesma etapa | `fix.md` §7 |
| PEND-012 | Uma meta de **0% digitada** é tratada como passagem neutra, não como "nada passa". Evita divisão por zero, mas não obedece a intenção — **confirmar com o usuário** | `fix.md` §7 |
| PEND-013 | Se uma etapa for apagada (`ON DELETE SET NULL`), a linha de histórico sai do cálculo e o dwell da etapa seguinte fica inflado — só sobre dado já degradado | `fix.md` §7 |

## Como validar depois

```bash
npm run typecheck && npm run lint && npm run test
```

E, para ver a melhoria na tela, aplicar
`supabase/migrations/20260918000100_sefix002_stage_plan_read.sql` em um ambiente de teste — sem
isso os cards "Metas de passagem por etapa" e "A cadeia do funil" não renderizam (degradação
graciosa, ver R4).
