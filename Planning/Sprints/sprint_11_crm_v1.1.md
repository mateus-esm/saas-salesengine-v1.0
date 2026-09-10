# Sprint 11 — CRM v1.1 (Solo Energia como caso)

> **For agentic workers:** este arquivo é a fonte única da Sprint 11 (ver
> `Planning/Workflow/agent_workflow.md`). Execução com `superpowers:executing-plans`,
> uma tarefa por vez, TDD, com os gates da seção "Restrições globais".

## 🎯 Vision (Human)

Lets refine the CRM first:

- Relational Tables
- Base de Contatos
- Leads
- Copilot Stategy

1. We need an way to filter the name of the client or some data directly in the
   kanban view

2. We need to adjust the UI to be more clear and intuitive

3. We need to have how to filter per datao of creation, responsible, or another
   filter

4. You can study the style of the jestor for improve our strategy to relational
   tables here:C:\Users\mateus\SaaS Sales Engine - v1.0
   (Supabase)\saas-salesengine-v1.0\Planning\Sprints\sprint_11_crm_v1.1.md
   C:\Users\mateus\SaaS Sales Engine - v1.0
   (Supabase)\saas-salesengine-v1.0\Planning\Benchmark\Jestor\Jestor.md
   C:\Users\mateus\SaaS Sales Engine - v1.0
   (Supabase)\saas-salesengine-v1.0\Planning\Benchmark\Jestor\Jestor.txt

5. We need make work the strategy and the relational tables for me can create
   and vinculated for example an table for make proposals, i vinculated the
   proposal to the oppotunitie and trigger an webhook that will make and return
   the proposal

6. Also to contracts i need to can vinculated the contract table for capturing
   the data for an contract trough an forms the client fullfill and so we can
   trigger an webhook that will make the proposal and also can receive back the
   file

7. We need to improve our strategy for webhooks or maybe api this is our gate to
   get in and getout data and files of the software (we need gateways to receive
   leads and refistes, to send and receive files and data, this is what i
   current have in jestor)

8. We need to optimize the strategy and ui for the Copilot because is ugly and
   also very very slow.

9.Placar mensal is very ugly too we need somerhign more aligned

10. The software is with an very high latency in the crm

11. We need to have responsivity too the mobile

12.the tables in leads is broken and the tables in base de contatos is broken
too and also in the personalized tables.

13. The lead score is broken.

14. And very very important we need to refine our track strategy, maily to think
    in how have an better tacking strategy to ads, like i can effectively mappin
    the soucer of my lead: meta ads, google ads, indicação,if they came from
    Whatsapp Message, Landing Page (Which), forms (which), the campaign
    speccifacly, observations from this lead the utm data, and if possible an
    way to integrate for example with the meta for have more fast feedback,
    after we can have an integrations page for native have integrations
    like:click sign to contracts, meta ads and google ads for ads tracking,
    resend for email, apitemplate for proposals in pdf and more

Now i want that you look for the Solo Energia database and think in the best
strategy to have all the data effecively well defined, our sources of each lead
to have an good track, after we can create an tag of name for an certain source
or campaign atribute an responsible for ecample define some goal, the
investmento integrate to see the roi soo this is the vision and we need to buil
the foundations.

1. Relational Tables
2. Clear UI/UX with Trustfull and solid funciton of the tables (see jestor)
3. Leads Tracking by soucer in an effective way + ingest of the leads trough the
   right strategy from the webhooks
4. Improve the Copilot work
5. Thinking well in the necesity of the Solo Energia based in the db import to
   setup everything in the right way!

### Decisões do Human (2026-09-10)

1. **Ordem das ondas:** Onda 1 (o que está quebrado + reparo dos dados da Solo
   Energia) → Onda 2 (Kanban e tabelas claros) → Onda 3 (tabelas relacionais) →
   Onda 4 (tracking de origem). MCP (`future_sprint__mcp_v1.md`) e Copilot ficam para
   sprints próprias.
2. **Reparo de dados da Solo Energia:** aplicar em produção **depois** de um ensaio
   (`BEGIN … ROLLBACK`) que passe.
3. **Responsável fica no negócio** (`opportunities.owner_id`), herdando o
   responsável do contato por padrão. Seguindo o Jestor — "a ferramenta para
   construir a máquina" —, além do responsável nativo haverá um tipo de campo
   **Usuário** para outros papéis (pré-vendedor, técnico da visita). → Onda 2.
4. **Rolagem infinita** em vez de paginação com botões. O servidor continua
   entregando em blocos — é isso que tira o teto de 1.000 e a latência —; a tela
   carrega o próximo bloco ao rolar.

---

## 🔬 Achados (PM · 2026-09-10)

Levantados do código em `main` @ `d148b4f` e de consultas **somente leitura** na
produção. Cada um mudou o plano.

**1. O Kanban esconde ~20% da Solo Energia.** A API do Supabase corta toda
consulta em **1.000 linhas** (`max_rows = 1000`, conferido na produção) e
`useOpportunities` carrega o pipeline sem paginar. `Usinas - Micro Geração` tem
1.259 oportunidades → **259 nunca aparecem**, e o cabeçalho diz "1000 leads". A
Base de Contatos (1.253) bate no mesmo teto via `useLeads`.

**2. Cards sem nome.** O Kanban carrega **todos os leads da equipe** (`useLeads`,
também cortado em 1.000) só para achar o nome de cada card. Quando o lead do card
não está entre os 1.000 carregados, o card vira `[Novo Contato - WhatsApp]`
(`OpportunityCard.tsx:203`).

**3. A latência tem um responsável principal.** `useLeadScores` faz **duas
chamadas RPC por lead** (`fn_calculate_icp_score` + `fn_calculate_lead_velocity`)
→ **~2.000 requisições** a cada abertura do Kanban. `useTouchpointCounts` e a busca
de empresas mandam ~1.000 UUIDs **na URL** (`.in()`), o que provavelmente estoura o
limite de tamanho de URL. E qualquer mudança em `leads` ou `opportunities` refaz a
consulta inteira (Realtime sem debounce) — com o WhatsApp atualizando
`last_message_at` o tempo todo, isso é contínuo. Nenhuma lista é virtualizada.

**4. O lead score dá 0 para todo mundo.** Nenhum pipeline da Solo Energia tem
`icp_weights` (ICP = 0) e os leads importados não têm atividade (velocidade = 0).
O score não está "errado": ele não tem dado — e a tela mostra 0 em vez de "sem
dados". O modelo em si (contagem de atividades × 10) é fraco; redesenhá-lo é
trabalho do Copilot, não desta sprint.

**5. O Placar não é só feio — é quebrado.** `useForecast` pede `assigned_to` em
`opportunities`, coluna que **não existe**; o erro é engolido e o placar mostra
zeros (`useForecast.ts:142-145`). Também não filtra `deleted_at`.

**6. Lead que volta pelo formulário se perde.** O `crm-webhook` procura lead
existente por `phone = <só dígitos>`, mas 897 dos 1.175 telefones da Solo Energia
estão com máscara (`(85) 99262-5840`, `+5585…`). Não acha, tenta inserir, bate no
`UNIQUE (equipe_id, phone_normalized)` e responde 500: o lead do Formulário Meta ou
da Landing Page **some**. Os 514 do Reciclo são exatamente quem volta.

**7. Os dados da Solo Energia saíram tortos da Sprint 10 — que eu executei:**

- **Toda data de criação é o dia da importação.** `merge()` converte `Data` para
  ISO (`2025-03-14T10:22:00`) e o gerador de SQL passa de novo pelo `parse_dt`, que
  não aceita o `T` → cai em `now()`. O filtro por data de criação seria inútil.
- **O dashboard põe os 137 ganhos e as 503 perdas em setembro**: os eventos de funil
  herdaram a data da importação.
- **`stage_entered_at` = dia da importação** → "tempo na etapa" errado em todo card.
- **0 de 1.253 leads têm responsável**: o `Responsável` do Jestor ficou em
  `custom_data.responsavel_jestor` (Mateus Sombra 390 · luizhenriqueteixeira@… 223
  · fgmssolar@… 65 · estevamdequadros@… 8 · vazio 573).
- **Os 10 campos importados são invisíveis** (estudo MCP §3.1): o pipeline declara 7
  campos, com zero valores; os dados estão em 10 chaves não declaradas.

Tudo é recuperável: os CSVs e o SQL gerado da Sprint 10 estão no disco, fora do git.
O `Tempo na Fase` do Jestor vem como `1 year 2 months 10 days 3 hours …`, que o
Postgres lê direto como intervalo. Para negócios parados em Ganho/Perdido, o tempo
na fase **é** o tempo desde o fechamento — o que também recupera a data de
fechamento dos 564 que o Jestor não exportou.

**8. Tracking: não existe campanha, plataforma, anúncio, UTM, formulário nem landing
page como dado.** Há seis colunas de origem sobrepostas (`source`, `origem`,
`origin`, `origin_category`, `origin_detail`, `channel`) e 51% da Solo Energia é só
"Tráfego Pago". Os dois webhooks de entrada da Solo Energia (Formulário Meta ADS,
Landing Page) mapeiam só nome/telefone/e-mail/origem. `messages` não guarda o
payload bruto, então dado de anúncio clique-para-WhatsApp, se vier, é descartado.
→ Onda 4.

**9. No Jestor, "Propostas Comerciais" é uma tabela ligada à oportunidade** (213
propostas): Fabricante, Módulo, Nº Módulos, Inversor, Potência do Inversor, Qtde de
Inversores, Tipo de Estrutura, Monitoramento, Preço Total, Condições de Pagamento,
Equipamentos Extras, Consumo Médio, Exclusões, Adicionais, Status, Link do PDF,
Formulário. No app, a Solo Energia só tem a tabela "Teste" (1 linha). **Atenção ao
nome:** `proposals` e `contracts` no banco já são as tabelas de **cobrança** (a Solo
Ventures vendendo o SaaS); as do CRM precisam de outro nome. → Onda 3.

**10. Pontas soltas.** Um webhook `meeting_scheduled` da Solo Energia ("Teste") nunca
dispara — nenhum código emite esse evento. As chaves soltas `tipo_telhado`,
`city`/`cidade` etc. são do tenant Casa Flow, não da Solo Energia (corrigido também
no estudo MCP).

### Decisão técnica revisada — o endereço dos campos personalizados (D1 do estudo MCP)

O estudo recomendou `key` como endereço canônico. Com o código na mão, **revisei para
`field_id`**: `src/types/pipelines.ts` declara `field_id` como identidade estável
("never change") e `key` como mutável; card, tabela, formulário, Copilot e regras de
agente (`custom_field_set`, `set_field`) já usam `field_id`. Trocar tudo para `key`
custaria bem mais que os "~5 arquivos" que o estudo estimou. Fica assim:

- **O valor mora em `custom_data[field_id]`.** Um endereço só.
- **`key` vira nome público, imutável depois de criado**, usado nas bordas — webhook
  de entrada, payload de saída, dashboard, API/MCP futuros. As bordas traduzem
  `key ↔ field_id`.
- **`label` é a única coisa renomeável.**

---

## 🛠️ Implementation Plan (PM)

**Agente:** Claude / Opus 5 (PM + Engineer, execução solo).
**Branch da Onda 1:** `claude/sprint11/w1/crm-confianca`.

### Restrições globais (valem para toda tarefa)

- Gates: `npx tsc -b` · `npm test` · `npm run build` · `deno test` das functions
  tocadas · testes SQL via `scripts/sqltest.sh`.
- Testes SQL rodam **contra a produção dentro de `BEGIN … ROLLBACK`** (não há Docker
  nesta máquina). O teste recria as funções da migration dentro da própria
  transação, então nada fica no banco.
- **Dado de cliente não entra no git** — CSVs, SQL gerado, relatórios.
- Nenhuma escrita em dado de produção sem ensaio que passe.
- Não tocar em `docs/billing-runbook.md` (alteração pendente de outra sessão).
- Toda RPC nova: `security invoker` (a RLS faz o recorte de tenant),
  `set search_path = public`, `grant execute … to authenticated`.

### Contrato de filtros (servidor na Onda 1, tela na Onda 2)

```ts
// src/types/crmFilters.ts
export interface CrmFilters {
  search?: string;                          // nome, e-mail ou telefone (compara dígitos normalizados)
  created_from?: string;                    // ISO, inclusivo
  created_to?: string;                      // ISO, exclusivo
  owner_ids?: string[];                     // "none" = sem responsável
  stage_ids?: string[];
  statuses?: Array<"open" | "won" | "lost">;
  origin_categories?: string[];
  tags?: string[];                          // interseção com leads.tags
  value_min?: number;
  value_max?: number;
}
```

No SQL, `p_filters jsonb` com as mesmas chaves; chave ausente = sem filtro.

### Onda 1 — Confiança

| # | Tarefa | Tier |
| :-- | :-- | :-- |
| T1 | Runner de teste SQL | S |
| T2 | Responsável no negócio (`owner_id`) | M |
| T3 | RPCs do quadro: resumo por etapa + página de cards | L |
| T4 | Kanban no quadro do servidor, rolagem infinita por coluna | L |
| T5 | Tabelas sem teto de 1.000 + score e touchpoints em uma chamada | M |
| T6 | Placar com números reais | S |
| T7 | Webhook de entrada deduplica pelo telefone normalizado | M |
| T8 | Contrato dos campos: `key` imutável, dashboard por `field_id`, webhook traduz | M |
| T9 | Reparo dos dados da Solo Energia | L |
| T10 | Verificação, deploy e handoff | S |

#### T1 · Runner de teste SQL (S)

**Files:** create `scripts/sqltest.sh`.

- Lê `SUPABASE_ACCESS_TOKEN` e `SUPABASE_PROJECT_ID` do `.env`, remove meta-comandos
  do psql (`\set …`) e envia o arquivo à Management API
  (`POST /v1/projects/{ref}/database/query`).
- **Recusa** arquivo sem `rollback;` — proteção contra teste que grava em produção.
- Saída: `PASS <arquivo>`, ou a mensagem do primeiro `assert` que falhou, com exit
  code ≠ 0.
- Convenção dos testes: `begin;` → DDL da migration → fixtures → blocos
  `do $$ … assert … $$;` → `rollback;` → `select 'PASS' as result;`.

**Aceite:** um teste com `assert 1 = 2` sai com erro; com `assert 1 = 1` imprime
PASS; um arquivo sem `rollback;` é recusado.

#### T2 · Responsável no negócio (M)

**Files:** create `supabase/migrations/20260910000100_sprint11_opportunity_owner.sql`,
`supabase/tests/sprint11_w1_owner.test.sql`; modify `src/types/pipelines.ts`,
`src/hooks/useOpportunities.ts`.

**Produces:**
- `opportunities.owner_id uuid null references profiles(id) on delete set null`.
- Trigger `trg_opportunity_default_owner` (BEFORE INSERT): owner nulo herda
  `leads.responsible_id`.
- Índice `(equipe_id, owner_id) where deleted_at is null`; backfill a partir de
  `leads.responsible_id`.
- TS: `Opportunity.owner_id: string | null`; `UpdateOpportunityData.owner_id?: string | null`.

**Testes SQL:** (1) insert sem owner herda o responsável do lead; (2) owner explícito
é mantido; (3) apagar o profile zera o owner sem apagar o negócio.

#### T3 · RPCs do quadro (L)

**Files:** create `supabase/migrations/20260910000200_sprint11_crm_board.sql`,
`supabase/tests/sprint11_w1_board.test.sql`, `src/types/crmFilters.ts`,
`src/types/board.ts`.

**Produces:**
- `crm_opp_matches(o opportunities, l leads, p_filters jsonb) returns boolean` —
  `language sql stable`; a única implementação dos filtros.
- `crm_board_summary(p_pipeline_id uuid, p_filters jsonb default '{}') returns jsonb`
  → `[{stage_id, count, value_sum}]`, uma entrada por etapa não apagada, zeros
  incluídos.
- `crm_board_stage(p_pipeline_id uuid, p_stage_id uuid, p_filters jsonb default '{}', p_limit int default 30, p_offset int default 0) returns jsonb`
  → array de `BoardCard`, em ordem `position asc, updated_at desc, id`.
- `crm_lead_scores(p_lead_ids uuid[]) returns jsonb` →
  `{lead_id: {icp_score, velocity, lead_score}}`.
- `crm_touchpoint_counts(p_lead_ids uuid[]) returns jsonb` → `{lead_id: count}`.
- **Score com nulo honesto** (mesma fórmula de `computeLeadScore`): ICP nulo quando o
  pipeline não tem `icp_weights`; velocidade nula quando o lead não tem atividade;
  `lead_score` nulo quando os dois são nulos, senão
  `round(((icp ou 0) + (vel ou 0)) / 2 / 10)` limitado a 0–10.
- `BoardCard` (`src/types/board.ts`): os campos de `Opportunity` + `owner_id` +
  `lead: {id, name, phone, email, next_contact, tags, origin_category, source, responsible_id}`
  + `owner_name` + `touchpoint_count` + `icp_score` + `velocity` + `lead_score` +
  `companies: {id, name}[]`.

**Testes SQL** (fixtures: 2 tenants; 1 pipeline com 3 etapas; 45 negócios numa etapa):
1. resumo conta por etapa e soma valor; etapa vazia aparece com 0;
2. página de 30 + página seguinte de 15, sem sobreposição;
3. busca por pedaço do nome, por e-mail e por telefone digitado com máscara;
4. período de criação;
5. responsável, inclusive `"none"`;
6. etiquetas, origem, status e faixa de valor;
7. usuário do outro tenant vê 0 (RLS);
8. score nulo sem ICP e sem atividade; não nulo com atividade;
9. contagem de touchpoints;
10. `crm_lead_scores` e `crm_touchpoint_counts` com 1.200 ids numa chamada.

#### T4 · Kanban no quadro do servidor (L)

**Files:** create `src/hooks/useBoard.ts`, `src/hooks/useLead.ts`, `src/lib/board.ts`,
`src/lib/__tests__/board.test.ts`; modify `src/components/crm/OpportunityKanban.tsx`,
`src/components/crm/OpportunityKanbanColumn.tsx`, `src/components/crm/OpportunityCard.tsx`
e `src/components/crm/CardTelemetryPillars.tsx` (o `lead` passa a ser `CardLead`).

**Consumes:** T3. **Produces:**
- `useBoardSummary(pipelineId, filters)` e `useBoardStage(pipelineId, stageId, filters)`
  (`useInfiniteQuery`, 30 por página).
- `src/lib/board.ts` (puro, testado): `moveCardInPages(pages, cardId, toStageId)`,
  `adjustSummaryForMove(summary, fromStageId, toStageId, value)`,
  `cardToOpportunity(card)`.
- A coluna mostra `count` e `value_sum` do resumo — o total verdadeiro, não o da
  página — e carrega a próxima página quando um sentinela entra na tela
  (`IntersectionObserver`).
- O Kanban **para** de usar `useLeads`, `useLeadScores`, `useTouchpointCounts` e a
  busca de empresas: tudo vem no card.
- `ContactDetailsModal` e `OpportunityDetailModal` buscam o lead completo ao abrir
  (`useLead(id)`).
- Arrastar: move otimista entre os caches das colunas e ajusta o resumo; em erro,
  reverte.
- Realtime: invalida as consultas do quadro com debounce de 1 s.

**Testes vitest:** as três funções de `src/lib/board.ts`.

**Aceite:** no Kanban da Solo Energia, a soma dos contadores das colunas é
**1.259**; nenhum card `[Novo Contato - WhatsApp]` para lead com nome; abrir o Kanban
faz **menos de 20 requisições** (antes: ~2.000).

#### T5 · Tabelas sem teto + score e touchpoints em uma chamada (M)

**Files:** create `src/lib/fetchAllPages.ts`, `src/lib/__tests__/fetchAllPages.test.ts`,
`src/lib/debounce.ts`, `src/lib/__tests__/debounce.test.ts`; modify
`src/hooks/useOpportunities.ts`, `src/hooks/useLeads.ts`, `src/hooks/useLeadScores.ts`,
`src/hooks/useStageTelemetry.ts`.

**Produces:**
`fetchAllPages<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, pageSize = 1000): Promise<T[]>`;
`createDebouncer(fn, ms)`.

- `useOpportunities` e `useLeads` buscam todas as páginas, **com desempate por `id` na
  ordenação** — sem ele, `position = 0` em 1.259 linhas faz páginas repetirem ou
  pularem linhas.
- `useLeadScores` chama `crm_lead_scores` uma vez (POST, sem limite de URL);
  `useTouchpointCounts` chama `crm_touchpoint_counts`. As assinaturas dos hooks não
  mudam — Tabela de Leads e Base de Contatos são corrigidas junto.
- Realtime de `useLeads`/`useOpportunities` com debounce de 1 s.
- **Paliativo consciente:** as tabelas ainda carregam tudo e filtram no navegador. A
  Onda 2 troca por página no servidor + rolagem infinita + filtros da barra única.

**Testes vitest:** `fetchAllPages` com 0, exatamente 1.000, 2.500 linhas e erro na 2ª
página; `createDebouncer` com fake timers.

#### T6 · Placar com números reais (S)

**Files:** modify `src/hooks/useForecast.ts`, `src/hooks/__tests__/useForecast.test.ts`.

**Produces:**
`buildPlacar(opps: {status, created_at, closed_at, owner_id, value}[])` →
`{won, lost, in_progress, win_rate, avg_velocity_days, won_revenue, owner_placar}`.
A consulta seleciona `owner_id` (não `assigned_to`), filtra `deleted_at is null` e
**lança** o erro em vez de engoli-lo.

**Testes vitest:** agregação por status, receita ganha, agregação por responsável via
`owner_id`, lista vazia.

#### T7 · Webhook de entrada deduplica pelo telefone normalizado (M)

**Files:** create `supabase/migrations/20260910000300_sprint11_find_lead_by_phone.sql`,
`supabase/tests/sprint11_w1_find_lead.test.sql`; modify
`supabase/functions/crm-webhook/index.ts`.

**Produces:** `crm_find_lead_by_phone(p_equipe_id uuid, p_phone text) returns uuid` —
`where phone_normalized = normalize_phone_br(p_phone) and deleted_at is null`. Os dois
caminhos de criação do `crm-webhook` (inbound por config e por segredo) chamam a RPC
antes do insert; achando, atualizam o lead existente em vez de inserir.

**Testes SQL:** `(85) 99262-5840`, `+55 85 99262-5840` e `5585992625840` acham o mesmo
lead; telefone de outro tenant não acha; lead apagado não acha.

#### T8 · Contrato dos campos (M)

**Files:** create `src/lib/customFieldKeys.ts`, `src/lib/__tests__/customFieldKeys.test.ts`,
`supabase/functions/_shared/custom-fields.ts`,
`supabase/functions/_shared/custom-fields.test.ts`,
`supabase/migrations/20260910000400_sprint11_breakdown_by_field_id.sql`,
`supabase/tests/sprint11_w1_breakdown.test.sql`; modify
`src/components/crm/pipeline-settings/CustomFieldsEditor.tsx`,
`supabase/functions/crm-webhook/index.ts`.

**Produces:**
- `uniqueKey(existingKeys: string[], base: string): string` (`slug`, `slug_2`, …) — o
  editor usa ao criar campo; a chave de campo já salvo fica **somente leitura**.
- `resolveCustomDataKeys(schema, data) → { resolved, undeclared }` — o `crm-webhook`
  grava campo declarado (por `key` ou por `field_id`) sob o `field_id`; o não
  declarado continua gravado sob a chave original (nenhum dado perdido) e vai listado
  em `lead_activities.metadata.undeclared_keys`.
- `get_custom_field_breakdown` lê `coalesce(custom_data->>field_id, custom_data->>key)`,
  com a mesma assinatura.

**Testes:** vitest de `uniqueKey`; deno de `resolveCustomDataKeys` (por key, por
field_id, não declarado, campo apagado); SQL: valor gravado por `field_id` entra na
quebra do dashboard.

#### T9 · Reparo dos dados da Solo Energia (L)

**Files:** create `scripts/repair_solo_energia_sprint11.py`; modify
`scripts/migrate_solo_energia.py` (`parse_dt` aceita ISO com `T`) e `.gitignore`
(`Planning/Assets/repair_solo_energia_sprint11*.sql`,
`Planning/Assets/repair_report_solo_energia.md`).

**Consumes:** T2 e T8. O ensaio embute o DDL das migrations T2/T8 na própria
transação, então pode rodar **antes** do deploy; o `commit` só depois delas aplicadas.

- O script refaz a deduplicação e o merge da Sprint 10 a partir dos CSVs e pareia cada
  linha, **na ordem**, com os ids de `Planning/Assets/migration_solo_energia.sql`.
  Qualquer divergência de nome/telefone no pareamento aborta.
- Âncora da exportação: `2026-09-10T00:50:00Z` (download dos CSVs, 21:50 BRT de 09/09).
- Gera um SQL transacional, fora do git:
  1. **backup** — `leads_backup_sprint11`, `opportunities_backup_sprint11`,
     `funnel_events_backup_sprint11`, `pipelines_backup_sprint11` (só Solo Energia);
  2. **declara 9 campos** no `Usinas - Micro Geração`: `fonte_negocio` (select, 10
     opções), `produto_interesse` (multi_select, 10 opções — eram as "Tags", que são
     linhas de produto), `proximo_contato` (date), `data_reuniao` (date),
     `data_envio_proposta` (date), `link_proposta` (url), `link_contrato` (url),
     `touchpoints_jestor` (number), `responsavel_jestor` (text); `origem_migracao`
     sai (a origem já está em `leads.creation_source = 'import'`);
  3. **regrava `custom_data`** sob os `field_id`;
  4. **responsável** — "Mateus Sombra" → Mateus; `luizhenriqueteixeira@hotmail.com` →
     Luiz; os outros 73 ficam sem responsável, com o nome original em
     `responsavel_jestor`; `leads.responsible_id` = responsável do negócio mais recente;
  5. **`leads.next_contact`** = `proximo_contato` só para negócios abertos fora do
     Reciclo (senão 514 cards do Reciclo ficariam "Atrasado");
  6. **datas** — `leads.created_at` = `Data` do Jestor; `stage_entered_at` = âncora −
     `Tempo na Fase`; `closed_at` de ganho/perdido sem data = `stage_entered_at`;
     `opportunities.created_at` = o menor entre criação do contato, entrada na etapa e
     fechamento;
  7. **eventos de funil** ganho/perdido: `occurred_at` = `closed_at`;
  8. **asserções** — 0 chave não declarada no pipeline; nenhum lead com a data da
     importação; eventos espalhados pelos meses reais; contagens de responsável
     batendo com o CSV.
- Ensaio: o SQL com `rollback` no fim, pela Management API → relatório de contagens
  (`repair_report_solo_energia.md`, fora do git) → aplicar com `commit` → consultas de
  verificação.

**Aceite:** as asserções passam no ensaio **e** depois de aplicado.

#### T10 · Verificação, deploy e handoff (S)

- Gates completos no branch; os testes SQL passando.
- **Ponto de parada — aprovação do founder** para: (a) `supabase db push --dns-resolver https`
  das migrations T2/T3/T7/T8; (b) `supabase functions deploy crm-webhook`; (c) aplicar
  o T9; (d) PR e merge (o Netlify publica o frontend a partir do `main`).
- Verificação no navegador, na Solo Energia: contadores somando 1.259; nome em todo
  card; requisições e tempo de carga antes × depois; placar com números reais.
- Handoff em `Planning/Project Management/Sprints_PM_Handoff.md`.

### Onda 2 — Kanban e tabelas claros *(plano detalhado quando a Onda 1 fechar)*

- **Barra de filtros única** (`CrmFilters`) no Kanban, na Tabela de Leads e na Base de
  Contatos: busca, criado em, responsável, origem, etiquetas, etapa/status, valor,
  campo personalizado declarado. Estado na URL — compartilhável, sobrevive ao reload.
- **Tabelas** com página no servidor + rolagem infinita + filtros no servidor
  (substitui o paliativo do T5); edição inline confiável; tabelas personalizadas no
  mesmo padrão.
- **Responsável:** seletor no card, no modal e na tabela; avatar no card; **tipo de
  campo Usuário** (estilo Jestor).
- **Card redesenhado** com hierarquia clara; cabeçalho da coluna com contagem e total
  verdadeiros.
- **Placar redesenhado:** faixa compacta, meta × realizado × ritmo, por responsável.
- **Mobile:** Kanban em uma coluna com seletor de etapa; tabelas viram lista; modal em
  tela cheia.
- **Saída:** achar qualquer cliente da Solo Energia pelo nome no Kanban em menos de
  2 s; filtrar por responsável e período; usar no celular.

### Onda 3 — Tabelas relacionais: Propostas e Contratos *(plano detalhado depois)*

- Campo **Oportunidade (N:1)** em tabela personalizada + painel reverso no negócio
  ("Propostas (3)"), criando já vinculado.
- **Campos de consulta** (lookup): nome e telefone do cliente vindos do negócio.
- **Campo arquivo** (Storage, isolado por tenant).
- **Botão de automação** → webhook de saída com registro + negócio + contato + URL de
  retorno com token → o n8n devolve campos e arquivos → o registro é atualizado
  (status, link do PDF, arquivo).
- **Formulário público** para preencher um registro (Dados para Contrato), ligado ao
  negócio.
- Semente da Solo Energia: "Propostas Comerciais" (campos do Jestor) e "Contratos".
- **Pré-requisito:** ver os fluxos atuais do n8n (APITemplate / ClickSign) para fixar
  o contrato do payload.

### Onda 4 — Tracking de origem *(plano detalhado depois)*

- **Atribuição por lead** (primeiro toque): plataforma, campanha, conjunto/anúncio,
  UTMs, click IDs (`fbclid`, `gclid`, `ctwa_clid`), landing page, formulário,
  referrer, payload bruto.
- **Tabela de campanhas:** nome, plataforma, responsável, meta, investimento (manual
  primeiro) → ROI por campanha no dashboard.
- Cada endpoint de entrada **carimba a própria origem** (Formulário Meta ADS → social
  pago / Meta / nome do formulário) e captura `utm_*` sozinho.
- **Spike:** o canal de WhatsApp entrega dado de anúncio clique-para-WhatsApp? Se sim,
  "Mensagem Whatsapp" ganha a campanha sozinha.
- Os 639 "Tráfego Pago" antigos ficam como social pago sem plataforma — a campanha não
  é recuperável.
- Página de integrações (Meta Ads, Google Ads, ClickSign, Resend, APITemplate) →
  sprint seguinte.

### Fora desta sprint

Copilot: velocidade e UI (ponto 8 — medir antes de mexer) · modelo do lead score ·
página de integrações · MCP (`future_sprint__mcp_v1.md`).

### Wave map — Onda 1

```
T1 ─► T2 ─► T3 ─► T4
              └─► T5
       T2 ─► T6
             T7          (independentes entre si)
             T8
T2 + T8 no ensaio ─► T9 (ensaio) ─► T10 (aprovação → deploy → T9 aplicado → PR)
```

Execução solo e sequencial: T1, T2, T3, T4, T5, T6, T7, T8, T9, T10.

---

## 📊 Ledger

- [x] T1 · Runner de teste SQL · S
- [x] T2 · Responsável no negócio · M
- [x] T3 · RPCs do quadro · L — na base real da Solo Energia: resumo 185 ms (conta os 1.259), página de 30 cards da maior coluna 114 ms
- [ ] T4 · Kanban no quadro do servidor · L
- [ ] T5 · Tabelas sem teto + score/touchpoints em uma chamada · M
- [ ] T6 · Placar com números reais · S
- [ ] T7 · Webhook deduplica pelo telefone normalizado · M
- [ ] T8 · Contrato dos campos · M
- [ ] T9 · Reparo dos dados da Solo Energia · L
- [ ] T10 · Verificação, deploy e handoff · S
