# SE-FIX-002 — Task Contract

Projeto | Tarefa | Agent
saas-salesengine-v1.0 | SE-FIX-002 | verboo

Project: saas-salesengine-v1.0
Agent: verboo
Branch: fix/metas-section-conversion
Risk: bug fix de UI + possivel RPC/migration de leitura (sem destrutivo)

## Outcome

Corrigir e redesenhar a seção **Metas** (Pipelines → Config → Metas, componente `src/components/crm/revenue/RevenueGoalsForm.tsx`), hoje pouco intuitiva:

1. **Legenda dos campos ausente na divisão por vendedor** — os inputs por vendedor mostram apenas placeholders "Deals" e "R$" sem rótulo/legenda explicando o que são. Adicionar legenda clara.
2. **Taxas de conversão não intuitivas** — hoje o modelo é uma meta global de negócios + overrides de conversão por etapa (`conversion_overrides`) e o preview via RPC `fn_stage_conversion_rates`. O modelo desejado pelo usuário é **conversão por etapa**: cada etapa define a meta de passagem de leads para a próxima etapa; a partir disso o sistema calcula de volta:
   - número de **entradas de leads** necessárias no topo do funil
   - **tracking** (idealmente SQL) de: reuniões realizadas e negócios fechados
   - **SLA médio por etapa** para bater o lead time de vendas
3. Passar a exibir a cadeia completa: entradas → taxa por etapa → reuniões → fechamentos, com SLA por etapa.

## Entregáveis
1. Fix + melhoria implementados no frontend (`RevenueGoalsForm.tsx` e correlatos) e, se necessário, RPC/migration **de leitura** (nunca destrutiva).
2. `docs/dev/projects/saas-salesengine-v1.0/SE-FIX-002/verboo/diagnostico.md` — como a seção funciona hoje, com `arquivo:linha`, e o que falta.
3. `docs/dev/projects/saas-salesengine-v1.0/SE-FIX-002/verboo/fix.md` — desenho proposto (modelo de conversão por etapa), o que mudou, validação, riscos/rollback.
4. `docs/dev/projects/saas-salesengine-v1.0/SE-FIX-002/README.md` — header Projeto | Tarefa | Origem | Agentes | Status | Artefatos | Pendências.

## Contexto (evidência levantada 2026-09-18)
- `RevenueGoalsForm.tsx` (393 linhas): estado `goalDeals`, `goalRevenue`, `period`, `ownerGoals[]`, `overrides{}`; salva em `pipelines.revenue_config` JSON (`goal_deals`, `goal_revenue`, `period`, `owner_goals`, `conversion_overrides`).
- Preview de conversão: RPC `fn_stage_conversion_rates(p_pipeline_id)` → `{stage_id, stage_name, conversion_rate}`.
- Divisão por vendedor: select de `profiles` da equipe + inputs "Deals" (w-20) e "R$" (w-24) **sem label**.
- Validação existente: avisa se a soma por vendedor não bate com a meta principal.
- Página: `src/pages/PipelineSettings.tsx` seção "Metas" (CardTitle "Metas"), descrição atual: "Metas mensais ou trimestrais de negócios fechados. Alimenta o placar de performance no Kanban."

## Notas de escopo
- O usuário quer **intuição**: cada etapa define a meta de passagem para a próxima; o topo (entradas) é derivado.
- Tracker de reuniões realizadas e negócios fechados: avaliar se os dados já existem (funnel_events / opportunities / RPC existentes) antes de propor tabela nova. Se faltar dado, registrar como pendência nomeada em vez de inventar.
- Não alterar o modelo de dados de forma destrutiva; preferir `revenue_config` JSON + leitura.

## Acceptance
- [ ] Legenda/rótulos visíveis na divisão por vendedor.
- [ ] Modelo de conversão por etapa implementado ou, se inviável no escopo, plano técnico explícito + pendência nomeada.
- [ ] Cálculo derivado de entradas de leads exibido e auditável.
- [ ] Typecheck + lint + testes passam (baseline registrado).
- [ ] PT-BR nos artefatos; zero credenciais reais.

## Do not touch
- Secrets, `main`/`master` direto, migrations destrutivas, assets compartilhados, pastas de clientes.
