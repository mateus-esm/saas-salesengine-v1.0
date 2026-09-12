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
   sprints próprias. *(Reordenada em 11/09 — decisão 10: a Receita entra como Onda 3,
   tabelas relacionais viram a Onda 4 e o tracking, a Onda 5.)*
2. **Reparo de dados da Solo Energia:** aplicar em produção **depois** de um ensaio
   (`BEGIN … ROLLBACK`) que passe.
3. **Responsável fica no negócio** (`opportunities.owner_id`), herdando o
   responsável do contato por padrão. Seguindo o Jestor — "a ferramenta para
   construir a máquina" —, além do responsável nativo haverá um tipo de campo
   **Usuário** para outros papéis (pré-vendedor, técnico da visita). → Onda 2.
4. **Rolagem infinita** em vez de paginação com botões. O servidor continua
   entregando em blocos — é isso que tira o teto de 1.000 e a latência —; a tela
   carrega o próximo bloco ao rolar.

### Decisões do Human (2026-09-11) — planejamento da Onda 2

5. **Responsável só no negócio.** O contato não tem responsável: ele pode ter vários
   negócios, na mesma linha ou em outras, cada um com o seu. A Base de Contatos
   mostra os negócios do contato e os responsáveis deles. `leads.responsible_id` fica
   como legado (padrão do negócio novo, pelo trigger do T2), sem aparecer em tela.
   *(Reafirma a Sprint 4: "Contacts stay identity-pure".)*
6. **O dashboard segue o negócio, e o evento guarda o responsável do momento.** Ganho,
   perda e marcos contam para quem era dono naquele instante; o que está em aberto,
   para o dono atual; números de contato, para quem tem negócio com o contato.
7. **Arquitetura em motores** — `Planning/Architecture/motores_revops.md`: objetos,
   eventos e artefatos como lente; oito motores; toda porta (tela, WhatsApp, webhook,
   Copilot, API, MCP) usa as mesmas operações. Serve todo tenant — nada desenhado para
   um só. Evolui v1.1 → v1.2 → v2 → v3.
8. **O pipeline é uma linha configurável por naturezas** (Duração, Entradas, Oferta,
   Processo), com catálogo, preço e recorrência opcionais — o cliente pode não usar.
9. **Recorrência = novo negócio por ciclo.** Reciclo continua sendo o mesmo negócio
   voltando para a linha, e ganha agendador.
10. **Nova ordem das ondas:** 2 Kanban e tabelas claros (2A funcional; 2B visual e
    celular) → 3 Receita e linha configurada → 4 Artefatos (Propostas e Contratos) →
    5 Entradas e atribuição.

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
→ Onda 5 (era a 4 antes da reordenação de 11/09).

**9. No Jestor, "Propostas Comerciais" é uma tabela ligada à oportunidade** (213
propostas): Fabricante, Módulo, Nº Módulos, Inversor, Potência do Inversor, Qtde de
Inversores, Tipo de Estrutura, Monitoramento, Preço Total, Condições de Pagamento,
Equipamentos Extras, Consumo Médio, Exclusões, Adicionais, Status, Link do PDF,
Formulário. No app, a Solo Energia só tem a tabela "Teste" (1 linha). **Atenção ao
nome:** `proposals` e `contracts` no banco já são as tabelas de **cobrança** (a Solo
Ventures vendendo o SaaS); as do CRM precisam de outro nome. → Onda 4 (era a 3 antes
da reordenação de 11/09).

**10. Pontas soltas.** Um webhook `meeting_scheduled` da Solo Energia ("Teste") nunca
dispara — nenhum código emite esse evento. As chaves soltas `tipo_telhado`,
`city`/`cidade` etc. são do tenant Casa Flow, não da Solo Energia (corrigido também
no estudo MCP).

**11. (Achado durante a execução · segurança) As tabelas de backup estavam
públicas.** Toda tabela criada em `public` recebe SELECT para `anon` e
`authenticated`; sem RLS, a API entrega a tabela a quem tiver a chave anon — que
vai no bundle do frontend. Os 19 backups das Sprints 3, 5.5, 8.2 e 10 (contatos,
9.340 mensagens, cópias de `profiles`, `billing_accounts`, `contracts` e `equipes`)
e o `epic1_merge_log` (telefones) estavam assim: conferido com a chave anon, só
contagem, 200/206. **Fechado em 10/09** com aprovação do founder
(`20260910000050_sprint11_lock_backup_tables.sql`: RLS sem política + revoke;
conferido: 401, e zero tabela em `public` sem RLS legível por anon/authenticated).
Os logs da API só guardam ~1 dia (desde 09/09 21:35 UTC): nesse período, os únicos
acessos a essas tabelas foram os da própria conferência. Acesso anterior não pode
ser descartado. Os `webhook_secret` expostos eram das equipes duplicadas apagadas em
03/09 — nenhum está em uso. **Regra daqui em diante:** backup em `public` nasce com
`enable row level security` na mesma transação.

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

## 🔬 Achados da Onda 2 (PM · 2026-09-11)

Levantados do código em `main` @ `9f022ee` e de consultas **somente leitura** na
produção.

12. **Tabela de Leads e Base de Contatos não abrem o registro.** Na Tabela de Leads o
    modal só abre por `?opp=`; na Base de Contatos, `selectedLead` nunca é setado — o
    `ContactDetailsModal` é código morto naquela tela.
13. **A grade trata o tipo do campo errado.** A coluna Seleção nasce sem as opções
    (dropdown vazio). Multi-seleção, endereço, sim/não, URL e moeda caem em "texto":
    editar multi-seleção grava texto no lugar da lista; endereço aparece
    `[object Object]`. Data digitada na grade grava meia-noite UTC e aparece um dia
    antes. Em produção existem campos de 9 tipos (número 7, seleção 7, texto 6, data 5,
    moeda 5, URL 3, endereço 1, sim/não 1, multi-seleção 1).
14. **A Tabela de Leads repete a latência antiga do Kanban.** A coluna Empresa faz uma
    consulta por linha (`useRelationResolver` em cada célula: ~1.260 requisições na
    Solo Energia) e `useLeadEntitySummary` manda ~1.250 UUIDs na URL em três consultas
    — o mesmo defeito que a Onda 1 corrigiu nos scores.
15. **Nenhum lugar do CRM deixa escolher o responsável**, nem do negócio nem do
    contato. 648 negócios da Solo Energia estão sem dono.
16. **O modal do negócio trabalha fechado.** A cada abertura do Kanban ou da Tabela, ele
    busca todos os eventos de agenda da equipe e chama a API do Copilot.
17. **Tabelas personalizadas:** sem excluir linha, sem ação em massa, um toast a cada
    edição, teto de 1.000, relação resolvida por célula, chave de coluna digitada à
    mão. Em produção só existe uma ("Teste", 1 linha, Solo Energia).
18. **O placar mostra os mesmos números duas vezes** (faixa Meta/Atual/Projetado/Gap e
    de novo em quatro cartões) e baixa todos os negócios do pipeline para contar.
19. **Dashboard e CRM discordam sobre "responsável".** As RPCs da Sprint 9 filtram por
    `leads.responsible_id`; o CRM usa `opportunities.owner_id`. E `funnel_events` guarda
    o `actor` (quem clicou), não o dono: reatribuir um negócio ganho moveria o ganho —
    e a comissão — para outra pessoa.
20. **Ciclo e ciclo de vida nunca rodaram.** Duas etapas `ciclo` configuradas (WI
    Advogados, 30 dias; Casa Flow, 15) e nenhum cron do banco chama o `cycle_pass` do
    `python-agent`; os 2.215 contatos estão em `lifecycle_stage = raw`. → Onda 3.
21. **Escala:** o maior tenant é a Solo Energia (1.254 contatos, 1.261 negócios, 2
    membros); 79 contatos já têm 2+ negócios; 7 pipelines ativos em 6 tenants.

---

## 🛠️ Implementation Plan (PM)

**Agente:** Claude / Opus 5 (PM + Engineer, execução solo).
**Branch da Onda 1:** `claude/sprint11/w1/crm-confianca` (merged, PR #11).
**Branches da Onda 2:** `claude/sprint11/w2a/achar-filtrar-atribuir` (2A) ·
`claude/sprint11/w2b/claro-e-celular` (2B, criada do `main` depois do merge da 2A).
**Arquitetura:** `Planning/Architecture/motores_revops.md` — cada tarefa diz o motor que
avança.

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
- *(Onda 2 em diante)* **Nenhuma porta tem atalho privado** (`motores_revops.md` §2):
  regra de negócio mora no banco; a tela monta o pedido e desenha a resposta.
- *(Onda 2 em diante)* **Nenhuma lista carrega a base inteira no navegador:** páginas do
  servidor com rolagem infinita; contador e lista usam a mesma função de filtro.
- *(Onda 2 em diante)* **Escrita em lote vai por verbo de negócio** (RPC, ids no corpo do
  POST) — nunca `.in()` com ids na URL.
- *(Onda 2 em diante)* **Em tabela, sucesso de edição é silencioso; erro sempre aparece**,
  na própria célula.
- *(Onda 2 em diante)* **Uma linha de billing por tarefa** em `Planning/Workflow/billing.md`
  (gate do workflow; a Onda 1 ficou sem — linhas acrescentadas no commit do plano da
  Onda 2).

### Contrato de filtros (servidor na Onda 1, tela na Onda 2)

> **Versão 2** (chaves `next_contact`, `custom` e `ContactFilters`) em "Contratos da
> onda", na Onda 2. O bloco abaixo é a versão da Onda 1.

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

### Onda 2 — Kanban e tabelas claros

> Execução com `superpowers:executing-plans`, uma tarefa por vez, TDD. Tarefa **L**
> apresenta plano curto (arquivos + lógica) antes do código (workflow §3). Duas
> entregas, cada uma com parada para aprovação → deploy → PR:
> **2A · Achar, filtrar, atribuir** (T11–T22) e **2B · Claro e no celular** (T23–T27).

**Saída da onda** (founder, 10/09): achar qualquer cliente da Solo Energia pelo nome no
Kanban em menos de 2 s; filtrar por responsável e período; usar no celular.

**O que a onda constrói de cada motor:** Modelo v1 (registro de tipos de campo, campo
Usuário) · Consulta v1 (filtros v2, tabelas no servidor, filtros na URL) · Automação
(verbos de negócio) · Eventos (responsável do momento) · Métricas (dashboard e placar
por responsável).

#### Orçamento de latência (linha de base no T11; conferido no T22 e no T27)

| Tela (Solo Energia, máquina e rede do founder) | Requisições | Tempo até o conteúdo |
| :-- | :-- | :-- |
| Abrir o Kanban | ≤ 20 | primeira coluna com cards < 1,5 s |
| Buscar um nome no Kanban | — | resultado < 2 s |
| Abrir a Tabela de Leads | ≤ 10 | primeiras 50 linhas < 1,5 s |
| Abrir a Base de Contatos | ≤ 10 | primeiras 50 linhas < 1,5 s |
| Abrir um negócio | ≤ 8 | < 1 s |

Se uma lista rolar travando depois das páginas no servidor, virtualização de linhas
entra como tarefa nova — não antes de medir.

#### Contratos da onda

**Filtros v2** (`src/types/crmFilters.ts`; chaves iguais no `p_filters jsonb`; chave
ausente = sem filtro):

```ts
export type NextContactBucket = "overdue" | "today" | "week" | "none"; // dia de São Paulo

export type CustomFieldFilterOp =
  | "any_of"          // seleção, multi-seleção, usuário: o valor (ou algum item) está na lista
  | "contains"        // texto, url, telefone: pedaço do texto, sem diferenciar maiúsculas
  | "between_number"  // número, moeda: from <= v <= to (cada ponta opcional)
  | "between_date"    // data: from <= v < to (ISO; cada ponta opcional)
  | "is_true"
  | "is_false"        // só false; vazio é "empty"
  | "empty"           // ausente, null, "", [] ou {}
  | "not_empty";

export interface CustomFieldFilter {
  field_id: string;
  op: CustomFieldFilterOp;
  values?: string[];       // any_of
  value?: string;          // contains
  from?: string | number;  // between_*
  to?: string | number;    // between_*
}

export interface CrmFilters {            // negócios: Kanban e Tabela de Leads
  search?: string;
  created_from?: string;                 // ISO, inclusivo
  created_to?: string;                   // ISO, exclusivo
  owner_ids?: string[];                  // responsável do negócio; "none" = sem responsável
  stage_ids?: string[];
  statuses?: OpportunityStatus[];
  origin_categories?: string[];
  tags?: string[];
  value_min?: number;
  value_max?: number;
  next_contact?: NextContactBucket;      // do contato do negócio
  custom?: CustomFieldFilter[];          // campos declarados do pipeline (E entre eles)
}

export type ContactRelationship = "sem_negocio" | "negociando" | "cliente" | "perdido";

export interface ContactFilters {        // Base de Contatos
  search?: string;
  created_from?: string;
  created_to?: string;
  origin_categories?: string[];
  tags?: string[];
  next_contact?: NextContactBucket;
  relationship?: ContactRelationship[];  // derivada dos negócios (ver T12)
  pipeline_ids?: string[];               // tem negócio nessas linhas
  deal_owner_ids?: string[];             // tem negócio desses responsáveis; "none" = negócio sem dono
}

export interface CrmSort {
  key: string;                           // chave da lista abaixo, ou "cf:<field_id>"
  dir: "asc" | "desc";
}
```

**Ordenação** (nulos sempre no fim; desempate por `id`; chave desconhecida = padrão):
negócios — `created_at` (padrão, desc), `updated_at`, `value`, `stage`,
`stage_entered_at`, `closed_at`, `lead_name`, `owner_name`, `next_contact`,
`cf:<field_id>`; contatos — `created_at` (padrão, desc), `name`, `last_message_at`,
`won_value`, `last_won_at`, `next_contact`.

**Filtros na URL** (T17). A mesma chave vale nas duas telas: `resp` é sempre o
responsável **do negócio**.

| Chave | Filtro | Exemplo |
| :-- | :-- | :-- |
| `q` | search | `q=maria` |
| `criado` | created_from / created_to (dias locais; fim inclusivo na URL, exclusivo no filtro) | `criado=2026-09-01..2026-09-30` · `criado=..2026-09-30` |
| `resp` | owner_ids · deal_owner_ids | `resp=<uuid>,none` |
| `etapa` | stage_ids | `etapa=<uuid>,<uuid>` |
| `status` | statuses | `status=open,won` |
| `origem` | origin_categories | `origem=paid_social` |
| `tags` | tags | `tags=solar,vip` |
| `valor` | value_min / value_max | `valor=1000..50000` |
| `prox` | next_contact | `prox=overdue` |
| `cf` (repetível) | custom | `cf=<field_id>~any_of~Indicação\|Site` · `cf=<field_id>~between_date~2026-09-01..2026-09-30` |
| `situacao` | relationship (contatos) | `situacao=cliente,negociando` |
| `linha` | pipeline_ids (contatos) | `linha=<uuid>` |
| `ordem` | sort | `ordem=value.desc` · `ordem=cf:<field_id>.asc` |

**Linhas das tabelas** (`src/types/crmTables.ts`):

```ts
export interface OppTableRow extends BoardCard {   // BoardCard: src/types/board.ts (Onda 1)
  property_count: number;
}

export interface ContactDeal {
  id: string;
  pipeline_id: string;
  pipeline_name: string;
  stage_id: string;
  stage_name: string;
  stage_color: string | null;
  status: OpportunityStatus;
  value: number | null;
  owner_id: string | null;
  owner_name: string | null;
}

export interface ContactRow {
  id: string;
  equipe_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  origin_category: string | null;
  channel: string | null;
  tags: string[];
  observations: string | null;
  created_at: string;
  last_message_at: string | null;
  next_contact: string | null;          // date (AAAA-MM-DD)
  personal_custom_data: Record<string, unknown>;
  company_name: string | null;          // empresa principal (contact_company_links)
  property_count: number;               // property_owner_links, owner_type = 'contact'
  relationship: ContactRelationship;
  open_count: number;
  won_value: number;                    // soma de value dos negócios ganhos (Onda 3: da receita)
  last_won_at: string | null;
  deals: ContactDeal[];                 // até 10: abertos primeiro, depois os mais recentes
}
```

**Registro de tipos de campo** (`src/lib/fields/registry.ts`, T15) — o motor de Modelo
v1. Grade, card e barra de filtros leem daqui; o SQL do T12/T13 é o gêmeo.

```ts
export type FieldType = CustomFieldType;          // inclui "user" a partir do T15
export type InlineEditor =
  | "text" | "number" | "currency" | "date" | "boolean"
  | "select" | "multi_select" | "url" | "phone" | "user";

export interface FieldContext {
  options?: string[];                             // seleção / multi-seleção
  nameOf?: (userId: string) => string | null;     // usuário
}

export interface FieldTypeSpec {
  type: FieldType;
  label: string;                                  // PT-BR, no editor de campos
  format(value: unknown, ctx?: FieldContext): string;  // nunca lança
  parse(raw: string, ctx?: FieldContext): unknown;     // do texto digitado ao valor gravado
  isEmpty(value: unknown): boolean;               // o mesmo vazio de _crm_is_empty
  filterOps: CustomFieldFilterOp[];               // os que o SQL aceita para o tipo
  sortAs: "number" | "date" | "text" | null;      // o mesmo do ORDER BY de crm_opp_table
  inlineEdit: InlineEditor | null;                // null = só leitura na grade (edita no modal)
}

export const FIELD_TYPES: readonly FieldTypeSpec[];
export function getFieldType(type: string | null | undefined): FieldTypeSpec; // desconhecido → texto
```

| Tipo | Mostra | Edita na grade | Filtros | Ordena |
| :-- | :-- | :-- | :-- | :-- |
| `text` | o texto | texto | contains · empty · not_empty | texto |
| `number` | 1.234,5 | número | between_number · empty · not_empty | número |
| `currency` | R$ 1.234,56 | moeda (aceita "1.234,56") | between_number · empty · not_empty | número |
| `date` | 14/03/2026 (dia local) | data (grava meia-noite local, como o modal) | between_date · empty · not_empty | data |
| `boolean` | Sim / Não | sim/não | is_true · is_false · empty | — |
| `select` | a opção | seleção com as opções do campo | any_of · empty · not_empty | texto |
| `multi_select` | a, b | multi-seleção (grava array) | any_of · empty · not_empty | — |
| `url` | link | url | contains · empty · not_empty | texto |
| `phone` | (85) 99262-5840 | telefone | contains · empty · not_empty | texto |
| `user` | nome do membro · "Usuário removido" | seletor de membro | any_of · empty · not_empty | — |
| `address` | Rua, nº – bairro, cidade/UF | — (modal) | empty · not_empty | — |
| `file` | nome do arquivo | — | empty · not_empty | — |
| `company_ref` · `property_ref` · `contact_ref` | "Vinculado" | — | empty · not_empty | — |

### Onda 2A — Achar, filtrar, atribuir

| # | Tarefa | Motor | Tier |
| :-- | :-- | :-- | :-- |
| T11 | Verificação da Onda 1 + linha de base de latência | Consulta | S |
| T12 | Filtros v2 no servidor | Consulta | L |
| T13 | Tabelas no servidor + verbos de negócio | Consulta · Automação | L |
| T14 | Eventos com o responsável do momento + métricas por responsável | Eventos · Métricas | L |
| T15 | Registro de tipos de campo + grade certa por tipo | Modelo | L |
| T16 | Campo Usuário | Modelo | M |
| T17 | Barra de filtros e filtros na URL | Consulta | L |
| T18 | Tabela de Leads no servidor | Consulta · Automação | M |
| T19 | Base de Contatos no servidor | Consulta · Automação | M |
| T20 | Responsável no negócio + modal leve | Processo · Consulta | M |
| T21 | Tabelas personalizadas no mesmo padrão | Modelo | M |
| T22 | Verificação 2A, deploy e PR | — | S |

#### T11 · Verificação da Onda 1 + linha de base (S)

**Files:** modify `Planning/Sprints/sprint_11_crm_v1.1.md` (tabela "Linha de base").

- Navegador (Chrome, sessão logada do founder, equipe Solo Energia), aba de rede aberta.
- **Pendência da Onda 1:** no Kanban de `Solo Energia | Usinas - Micro Geração`, a soma
  dos contadores das colunas = total de negócios não apagados do pipeline (consultar na
  hora; era 1.259, a produção tinha 1.261 em 11/09); nenhum card
  `[Novo Contato - WhatsApp]` para lead com nome; ≤ 20 requisições ao abrir; placar com
  números do mês.
- **Linha de base** de cada tela do orçamento: requisições, tempo até o conteúdo, bytes.
- Regressão da Onda 1 encontrada aqui vira correção antes do T12.

**Aceite:** tabela "Linha de base" preenchida neste arquivo; pendência da Onda 1 marcada.

#### T12 · Filtros v2 no servidor (L)

**Files:** create `supabase/migrations/20260911000100_sprint11_w2_filters.sql`,
`supabase/tests/sprint11_w2_filters.test.sql`, `src/lib/crmFilters.ts`,
`src/lib/__tests__/crmFilters.test.ts`; modify `src/types/crmFilters.ts`,
`src/lib/board.ts` (`cleanFilters` limpa `custom`), `supabase/tests/sprint11_w1_board.test.sql`
(passa a incluir esta migration, para testar a versão nova de `crm_opp_matches`).

**Produces (SQL)** — todas `set search_path = public`, revoke de `public, anon`, grant a
`authenticated`:
- `_crm_is_empty(v jsonb) → boolean` — ausente, `null`, `""`, `[]` ou `{}`.
- `_crm_try_numeric(p text) → numeric` e `_crm_try_timestamptz(p text) → timestamptz` —
  null em vez de erro.
- `_crm_custom_match(p_data jsonb, p_filter jsonb) → boolean` e
  `_crm_custom_matches(p_data jsonb, p_custom jsonb) → boolean` (E entre os filtros).
  Op desconhecida = filtro ignorado. Valor gravado que não converte = não bate. Ponta
  `from`/`to` que não converte = ponta ausente. `any_of` sobre array (multi-seleção) =
  sobreposição.
- `_crm_next_contact_matches(p_next date, p_bucket text) → boolean` — hoje =
  `(now() at time zone 'America/Sao_Paulo')::date`; `week` = de hoje até hoje + 6;
  balde nulo = sem filtro.
- `_crm_search_matches(l leads, p_search text) → boolean` — a busca que hoje mora dentro
  de `crm_opp_matches`, extraída para servir negócio e contato.
- `crm_opp_matches(o, l, p_filters)` recriada (mesma assinatura) + `next_contact` + `custom`.
- `_crm_lead_relationship(p_lead_id uuid) → text` — `cliente` (algum ganho) >
  `negociando` (algum aberto) > `perdido` (só perdidos) > `sem_negocio`; só negócios
  não apagados.
- `crm_lead_matches(l leads, p_filters jsonb) → boolean` com as chaves de
  `ContactFilters`; `deal_owner_ids` e `pipeline_ids` olham os negócios não apagados.
- `create index if not exists idx_opportunities_lead_active on public.opportunities (lead_id) where deleted_at is null;`

**Produces (TS):** os tipos de "Contratos da onda";
`cleanCustomFilters(list: CustomFieldFilter[]): CustomFieldFilter[]` em
`src/lib/crmFilters.ts` (tira filtro sem conteúdo: `any_of` sem valores, `contains` sem
texto, `between_*` sem ponta).

**Testes SQL** — fixtures: 2 tenants; 1 pipeline com 8 campos declarados (seleção,
multi-seleção, usuário, número, moeda, data, sim/não, texto); negócios com valores
válidos, vazios (`null`, `""`, `[]`, `{}`, chave ausente) e malformados (`"abc"` no
número, `"31/02/2026"` na data):
1. `any_of` em seleção, multi-seleção (sobreposição) e usuário;
2. `between_number` com só `from`, só `to` e os dois; `"abc"` não bate e não quebra;
3. `between_date` meio-aberto; data malformada não bate e não quebra;
4. `is_true` / `is_false`; `contains` sem diferenciar maiúsculas;
5. `empty` / `not_empty` nos cinco jeitos de vazio;
6. dois filtros juntos = E; op desconhecida = sem filtro;
7. `next_contact` nos quatro baldes, com datas montadas a partir de hoje em São Paulo;
8. `crm_board_summary` e `crm_board_stage` com `custom`: soma do resumo = linhas que batem;
9. `crm_lead_matches`: telefone digitado com máscara, período, as quatro situações
   (contato com ganho e com aberto = `cliente`), `pipeline_ids`, `deal_owner_ids` com
   `"none"`;
10. RLS: o usuário do tenant B conta 0 contatos do tenant A.

**Testes vitest:** `cleanCustomFilters` e `cleanFilters` com as chaves novas.

**Aceite:** `bash scripts/sqltest.sh supabase/tests/sprint11_w2_filters.test.sql supabase/tests/sprint11_w1_board.test.sql` → PASS · `npx tsc -b` · `npm test`.

#### T13 · Tabelas no servidor + verbos de negócio (L)

**Files:** create `supabase/migrations/20260911000200_sprint11_w2_tables.sql`,
`supabase/tests/sprint11_w2_tables.test.sql`, `src/types/crmTables.ts`,
`src/lib/tablePages.ts`, `src/lib/__tests__/tablePages.test.ts`; modify
`supabase/tests/sprint11_w1_board.test.sql` (inclui esta migration: `crm_board_stage`
muda por dentro e o teste da Onda 1 prova que a saída não mudou).

**Consumes:** T12 (`crm_opp_matches`, `crm_lead_matches`, `_crm_lead_relationship`,
`_crm_try_*`).

**Produces (SQL):**
- `_crm_card_json(o opportunities, l leads, p_has_icp boolean, p_owner_name text) → jsonb`
  — o card que `crm_board_stage` já monta (lead, owner_name, touchpoint_count,
  icp_score, velocity, lead_score, companies) num lugar só; `crm_board_stage` recriada
  em cima dela, com a mesma saída.
- `crm_opp_table(p_pipeline_id uuid, p_filters jsonb default '{}', p_sort jsonb default '{"key":"created_at","dir":"desc"}', p_limit int default 50, p_offset int default 0) → jsonb`
  — array de `OppTableRow` (card + `property_count`); limite entre 1 e 200.
- `crm_contacts_table(p_filters jsonb default '{}', p_sort jsonb default '{"key":"created_at","dir":"desc"}', p_limit int default 50, p_offset int default 0) → jsonb`
  — array de `ContactRow`, **só da equipe de quem chama**
  (`l.equipe_id = (select equipe_id from profiles where id = auth.uid())`; a RLS sozinha
  deixaria um super admin ver todos os tenants).
- `crm_contacts_count(p_filters jsonb default '{}') → int`.
- **Ordenação sem SQL dinâmico:** três chaves por linha (`sk_num`, `sk_ts`, `sk_text`)
  calculadas por `p_sort->>'key'`, e `order by` com `case` por direção,
  `nulls last`, desempate por `id`. `cf:<field_id>` lê o tipo no
  `custom_fields_schema` do pipeline: número/moeda → `_crm_try_numeric`; data →
  `_crm_try_timestamptz`; texto, URL, telefone, seleção → `lower(texto)`; outros tipos
  não ordenam (cai no padrão).
- **Verbos de negócio** (`security invoker`; ids no corpo do POST):
  - `crm_update_opportunities(p_ids uuid[], p_patch jsonb) → int` — chaves aceitas:
    `stage_id` (move só os negócios da linha dessa etapa) e `owner_id` (null = sem
    responsável; outra equipe é recusada pelo trigger do T2). Chave desconhecida →
    `raise exception 'invalid_patch_key: %'`. Devolve quantos mudaram.
  - `crm_delete_opportunities(p_ids uuid[]) → int` e `crm_delete_leads(p_ids uuid[]) → int`
    — soft delete.
  - `crm_create_opportunities(p_lead_ids uuid[], p_pipeline_id uuid, p_stage_id uuid default null) → jsonb`
    → `{"created": n, "skipped": m}` — um negócio por contato, na etapa informada ou na
    primeira etapa aberta; pula quem já tem negócio aberto nessa linha; o responsável
    vem do trigger do T2.

**Produces (TS):** os tipos `OppTableRow`, `ContactDeal`, `ContactRow`; e

```ts
// src/lib/tablePages.ts
export type TablePages<T> = InfiniteData<T[], number>;
export function flattenPages<T>(pages: TablePages<T> | undefined): T[];
export function patchRowInPages<T extends { id: string }>(
  pages: TablePages<T> | undefined, id: string, patch: Partial<T>,
): TablePages<T> | undefined;
export function removeRowsFromPages<T extends { id: string }>(
  pages: TablePages<T> | undefined, ids: string[],
): TablePages<T> | undefined;
export function nextOffset<T>(lastPage: T[], allPages: T[][], pageSize: number): number | undefined;
```

**Testes SQL** — fixtures: 2 tenants; 1 pipeline com campo número, data e texto; 60
negócios; contatos com 0, 1 e 3 negócios em 2 pipelines; empresa e imóvel ligados:
1. `crm_opp_table` página de 50 + página de 10 sem sobreposição; total = soma do
   `crm_board_summary` com os mesmos filtros;
2. cada chave de ordenação nos dois sentidos, nulos no fim, sem repetir linha entre
   páginas quando o valor empata;
3. `cf:` numérico ordena 9 antes de 10; `cf:` texto ordena "10" antes de "9";
4. o card de `crm_opp_table` é igual ao de `crm_board_stage` para o mesmo negócio
   (menos `property_count`);
5. `crm_contacts_table`: `relationship`, `open_count`, `won_value`, `last_won_at`,
   `deals` com nome da linha, da etapa e do responsável, abertos primeiro, no máximo 10;
6. `crm_contacts_count` = soma das páginas, com filtro;
7. tenant B vê 0 linhas e contagem 0;
8. verbos: mover etapa grava histórico; etapa de outra linha não move; `owner_id` de
   outra equipe levanta erro; chave desconhecida levanta `invalid_patch_key`; apagar
   devolve a contagem e some das listas; ids de outro tenant contam 0;
   `crm_create_opportunities` pula quem já tem negócio aberto;
9. 1.200 ids numa chamada.

**Medir** (como no T3): `crm_opp_table` página 1 por `created_at` e por `cf:`;
`crm_contacts_table` página 1 — na base real da Solo Energia, dentro de `rollback`.
Meta < 300 ms cada.

**Testes vitest:** as cinco funções de `tablePages.ts`.

**Aceite:** os testes SQL do T12, do T13 e da Onda 1 → PASS · tsc · npm test.

#### T14 · Eventos com o responsável do momento + métricas por responsável (L)

**Files:** create `supabase/migrations/20260911000300_sprint11_w2_owner_events.sql`,
`supabase/tests/sprint11_w2_owner_events.test.sql`; modify
`supabase/tests/sprint9_w2_metrics.test.sql`, `supabase/tests/sprint9_w4_reports.test.sql`,
`supabase/tests/sprint11_w1_breakdown.test.sql` (fixtures passam a dar dono ao negócio).

**Produces (SQL):**
- Tabela `opportunity_owner_history` (`id bigserial`, `equipe_id`, `opportunity_id` →
  cascade, `from_owner`, `to_owner`, `changed_by`, `changed_at`,
  `source text check (source in ('change','backfill'))`), RLS de leitura para a equipe
  e **nenhuma política de escrita** (só o trigger grava); índice
  `(opportunity_id, changed_at)`.
- Trigger `trg_opportunity_owner_history` — AFTER INSERT (com dono) e AFTER UPDATE OF
  `owner_id` (quando muda); `changed_by = auth.uid()`.
- `_opportunity_owner_at(p_opportunity_id uuid, p_at timestamptz) → uuid` — o último
  `to_owner` até `p_at`; senão o `from_owner` da primeira troca depois de `p_at`; sem
  histórico, o dono atual.
- `funnel_events.owner_id uuid` + índice `(equipe_id, owner_id, occurred_at)` + trigger
  BEFORE INSERT que preenche `owner_id` com `_opportunity_owner_at(opportunity_id,
  occurred_at)` quando vier nulo — cobre os sete lugares que gravam evento (três
  triggers, `record_funnel_event`, o replay) sem mexer em nenhum.
- Backfill: uma linha `source = 'backfill'` por negócio com dono (em `created_at`);
  depois `funnel_events.owner_id` dos eventos existentes. Ensaio em `rollback` antes.
- **Métricas recriadas com as mesmas assinaturas**, por uma regra só:
  - **métrica de evento** (qualificados, propostas, reuniões, no-show, ganhos, perdidos,
    receita ganha e perdida, ciclo médio, motivos de perda) → `funnel_events.owner_id`;
  - **métrica de estado** (valor e contagem em aberto, novos negócios, top
    oportunidades) → `opportunities.owner_id`;
  - **métrica de contato** (novos leads, touchpoints) → contatos com algum negócio não
    apagado do responsável;
  - o vendedor sem papel de gestor (D7 da Sprint 9, `_funnel_scope`) passa a ver o que é
    dele pela mesma regra.
  - Funções: `_funnel_overview_core`, `_loss_reasons_core`, `_top_opportunities_core`
    (última versão em `20260830000900`), `get_funnel_series`, `get_funnel_breakdown`
    (`20260830000600`), `get_custom_field_breakdown` (`20260910000400`).
    `get_funnel_overview`, `get_loss_reasons`, `get_top_opportunities` e
    `build_report_snapshot` herdam por chamarem os `_core`.
  - `_top_opportunities_core` devolve o nome do dono do negócio na mesma chave JSON que
    hoje leva o responsável do contato (a tela não muda).
  - `get_custom_field_breakdown`: campo do tipo `user` agrupa pelo **nome** do membro
    (`profiles` da equipe; "Usuário removido" quando o id não é da equipe).
- `crm_placar(p_pipeline_id uuid, p_from timestamptz, p_to timestamptz) → jsonb`
  (`security invoker`; a RLS de `funnel_events` já dá leitura à equipe):
  `{won, lost, won_revenue, in_progress, avg_velocity_days, by_owner: [{owner_id, owner_name, won, lost, in_progress, won_revenue}]}`
  — ganhos e perdas por evento no período (negócio distinto, dono do momento); em
  andamento pelo dono atual. O T25 troca o placar para ela.

**Testes SQL** (novo) — contato sem responsável; negócio do vendedor B ganho em março
e depois passado para C; negócio aberto de C:
1. o ganho conta para B, não para C, em overview, série, quebra, motivos, relatório
   agendado e `crm_placar`;
2. o aberto conta para C em `open_count` e `in_progress`;
3. filtrando C, "novos leads" conta o contato (tem negócio de C);
4. o vendedor B (sem papel de gestor) vê o ganho dele e não vê o aberto de C;
5. `recompute_funnel_events` mantém o dono do momento;
6. quebra por campo Usuário mostra nomes.

Os testes da Sprint 9 e da Onda 1 que montam responsável em `leads.responsible_id`
passam a dar dono ao negócio e continuam passando.

**Aceite:** os seis arquivos de teste SQL → PASS.

#### T15 · Registro de tipos de campo + grade certa por tipo (L)

**Files:** create `src/lib/fields/registry.ts`, `src/lib/fields/dateOnly.ts`,
`src/lib/fields/columns.ts`, `src/lib/fields/__tests__/registry.test.ts`,
`src/lib/fields/__tests__/dateOnly.test.ts`, `src/lib/fields/__tests__/columns.test.ts`,
`src/hooks/useMemberDirectory.ts`, `src/components/crm/fields/UserAvatar.tsx`,
`src/components/crm/fields/UserPicker.tsx`, `src/components/crm/fields/MultiSelectPicker.tsx`,
`src/components/crm/grid/__tests__/InlineCell.test.tsx`; modify `src/types/pipelines.ts`
(`CustomFieldType` ganha `"user"`), `src/components/crm/grid/types.ts`,
`src/components/crm/grid/columnTypes.tsx` (delega ao registro),
`src/components/crm/grid/InlineCell.tsx`, `src/components/crm/grid/SpreadsheetGrid.tsx`.

**Produces:**
- O registro (contrato acima) com os 14 tipos da tabela.
- Grade:

```ts
// src/components/crm/grid/types.ts
export type ColumnKind = FieldType | "relation" | "formula" | "rollup" | "conditional";
export interface ColumnDef {
  // … campos atuais …
  /** Abre o registro: a célula vira botão. Uma por grade. */
  primary?: boolean;
  relation?: {
    // … campos atuais …
    /** Os chips já vêm na linha ({ id, name }[]): nenhuma consulta por célula. */
    resolvedFromRow?: boolean;
  };
}

// SpreadsheetGrid — props novas
onRowOpen?: (rowId: string) => void;
hasMore?: boolean;
loadingMore?: boolean;
onEndReached?: () => void;   // sentinela no fim (IntersectionObserver no contêiner da grade)
```

- `InlineCell`: modo de exibição puro (sem consulta); editor montado só ao editar,
  escolhido por `spec.inlineEdit`; `useRelationResolver` só para `relation` sem
  `resolvedFromRow`; `onCommit` devolve promessa — falha mostra erro na célula (contorno
  e `title`) e volta o valor; sucesso silencioso. Cabeçalho fixo ao rolar.
- `columnFromField(field: { field_id?: string; key: string; label: string; type: string; options?: string[] }, jsonbField: JsonbField, addressBy: "field_id" | "key" = "field_id"): ColumnDef`
  — `key` da coluna = `field_id` (campos do pipeline) ou `key` (campos de contato e
  tabelas personalizadas, que ainda se endereçam por `key` até a v1.2), `kind` = tipo do
  campo, opções, `editable` = `spec.inlineEdit !== null`.
- `useMemberDirectory(): { members: { id: string; name: string; email: string }[]; nameOf(id: string | null): string | null }`
  — sobre `useTeamMembers` (`crm_team_members`, em cache).
- `UserPicker({ value, onChange, allowNone = true, placeholder })` — combobox (`cmdk`) com
  avatar, busca por nome e "Sem responsável". `UserAvatar({ userId, size })` —
  iniciais, cor fixa por id, `title` com o nome.
- `MultiSelectPicker({ options, value, onChange })` — chips + lista com caixas.

**Testes vitest:**
- registro: `format` / `parse` / `isEmpty` de cada tipo (moeda "1.234,56" → 1234.56;
  multi-seleção → "a, b"; sim/não; usuário por nome e "Usuário removido"; endereço
  resumido; tipo desconhecido cai em texto sem erro); `filterOps` por tipo = os
  operadores do T12;
- `dateOnly` (com `process.env.TZ = "America/Sao_Paulo"`): "2026-03-14" mostra 14/03/2026;
  o input "2026-03-14" grava a meia-noite local; ISO com fuso mostra o dia local;
- `columns`: seleção leva as opções; multi-seleção e usuário viram o `kind` certo;
  endereço fica só leitura;
- `InlineCell` (testing-library): seleção mostra as opções e grava o valor; multi-seleção
  grava array; data grava meia-noite local; sim/não alterna; falha no commit mostra erro
  e volta o valor.

**Aceite:** tsc · npm test. Nenhuma tela muda de dados aqui (as telas trocam nos T18–T21).

#### T16 · Campo Usuário (M)

**Files:** modify `src/components/crm/pipeline-settings/CustomFieldsEditor.tsx` (tipo
"Usuário (membro da equipe)"), `src/components/crm/DynamicFieldRenderer.tsx`
(`case "user"` com `UserPicker`; `validateCustomData` aceita uuid ou vazio),
`src/components/crm/OpportunityCard.tsx` (`renderCustomValue` mostra o nome); create
`src/components/crm/__tests__/DynamicFieldRenderer.user.test.tsx`.

**Consumes:** T15 (registro com `user`, `UserPicker`, `useMemberDirectory`), T12
(`any_of` com ids), T14 (quebra por nome).

- Valor gravado: o `profiles.id` do membro, em `custom_data[field_id]`. Um usuário por
  campo (vários: v1.2, se pedirem).
- Webhook de entrada: sem mudança — grava o que vier; a tela mostra "Usuário removido"
  para id que não é da equipe.
- Regras do Agente CRM com campo Usuário: fora da onda.

**Testes vitest:** o renderer escolhe e limpa o membro; `validateCustomData` recusa
texto que não é uuid.

**Aceite:** num pipeline de teste, criar "Pré-vendedor", preencher no modal, ver no
card, filtrar por ele (T17) e ver a quebra do dashboard com o nome.

#### T17 · Barra de filtros e filtros na URL (L)

**Files:** create `src/lib/crmFilterParams.ts`, `src/lib/__tests__/crmFilterParams.test.ts`,
`src/hooks/useUrlFilters.ts`, `src/components/crm/filters/DealFilterBar.tsx`,
`src/components/crm/filters/ContactFilterBar.tsx`, `src/components/crm/filters/controls.tsx`
(busca, multi-seleção, período, faixa de valor, próximo contato, campo personalizado,
chips ativos, menu "+ Filtro"), `src/components/crm/filters/FilterSheet.tsx` (celular:
"Filtros (n)" abre folha de baixo com os mesmos controles, `vaul`),
`src/components/crm/filters/__tests__/DealFilterBar.test.tsx`; modify
`src/components/crm/OpportunityKanban.tsx` (a barra no lugar da caixa de busca; filtros
da URL), `src/hooks/usePipelineSelection.ts` (trocar de pipeline apaga `etapa`, `cf` e
`ordem=cf:*`), `src/pages/CRM.tsx` (trocar de aba de topo apaga as chaves de filtro).

**Consumes:** T12 (tipos), T15 (`getFieldType(...).filterOps`, `UserPicker`,
`useMemberDirectory`), T16 (campo Usuário filtrável).

**Produces:**

```ts
// src/lib/crmFilterParams.ts
export const FILTER_PARAM_KEYS: readonly string[];  // q, criado, resp, etapa, status, origem, tags, valor, prox, cf, situacao, linha, ordem
export function crmFiltersToParams(f: CrmFilters, into?: URLSearchParams): URLSearchParams;
export function paramsToCrmFilters(p: URLSearchParams): CrmFilters;
export function contactFiltersToParams(f: ContactFilters, into?: URLSearchParams): URLSearchParams;
export function paramsToContactFilters(p: URLSearchParams): ContactFilters;
export function sortToParam(s: CrmSort | null): string | null;
export function paramToSort(v: string | null): CrmSort | null;

// src/hooks/useUrlFilters.ts
export function useDealUrlFilters(): {
  filters: CrmFilters; setFilters(next: CrmFilters): void;
  sort: CrmSort | null; setSort(next: CrmSort | null): void;
};
export function useContactUrlFilters(): {
  filters: ContactFilters; setFilters(next: ContactFilters): void;
  sort: CrmSort | null; setSort(next: CrmSort | null): void;
};
```

- Busca com debounce de 300 ms e `replace: true` (digitar não enche o histórico); os
  outros filtros com `replace: false` (voltar desfaz o filtro).
- Sempre visíveis: busca, **Responsável** (membros + "Sem responsável"), **Criado em**
  (Hoje, 7 dias, 30 dias, Este mês, Mês passado, Personalizado). No "+ Filtro": Etapa,
  Status, Origem, Etiquetas, Valor, Próximo contato e cada campo declarado do pipeline
  (operadores do registro). Filtros ativos viram chips removíveis; "Limpar".
- Kanban: cabeçalho "N negócios", ou "N encontrados · Limpar" com filtro.

**Testes vitest:** ida e volta URL ↔ filtro para cada chave (inclui `cf` com `|`, `~` e
acento no valor, período com uma ponta só, `none`); parâmetro inválido é ignorado sem
erro; período em dias locais vira `[início, dia seguinte)`; a barra remove o chip certo
e adiciona "Sem responsável".

**Aceite:** na Solo Energia, buscar um nome no Kanban traz o card em < 2 s; filtrar por
responsável e por "Criado em: mês passado" muda contadores e cards juntos; recarregar
mantém o filtro; o link copiado abre com o mesmo filtro.

#### T18 · Tabela de Leads no servidor (M)

**Files:** create `src/hooks/useOppTable.ts`; modify `src/components/crm/OpportunityTable.tsx`.

**Consumes:** T13 (`crm_opp_table`, verbos, `tablePages`), T15 (grade,
`columnFromField`, `UserPicker`), T17 (`DealFilterBar`, `useDealUrlFilters`),
`useBoardSummary` (total).

**Produces:**

```ts
export function useOppTable(pipelineId: string, filters: CrmFilters, sort: CrmSort | null):
  UseInfiniteQueryResult<TablePages<OppTableRow>>;           // 50 por página
export function useOppTableRealtime(pipelineId: string): void; // debounce 1 s, maxWait 5 s
export function useUpdateOpportunities(pipelineId: string, filters: CrmFilters, sort: CrmSort | null):
  UseMutationResult<number, Error, { ids: string[]; patch: { stage_id?: string; owner_id?: string | null } }>;
  // otimista via patchRowInPages; volta no erro
export function useDeleteOpportunities(pipelineId: string, filters: CrmFilters, sort: CrmSort | null):
  UseMutationResult<number, Error, string[]>;                // otimista via removeRowsFromPages
```

- Colunas: **Lead** (principal: abre o negócio), **Responsável** (usuário, editável),
  Empresa (chips da linha com `resolvedFromRow`; vincular/desvincular continua pelo
  `RelationPicker` e corrige a linha no cache), Imóveis, Valor (moeda), Etapa, Tempo na
  fase, Interações, Status, Próximo contato, Criado em, Atualizada + campos declarados
  por `columnFromField`.
- Ordenar pelo cabeçalho = `ordem` na URL, no servidor.
- Ações em massa: Mover para etapa, **Atribuir responsável** (diálogo com `UserPicker`),
  Excluir — uma chamada de verbo cada.
- Cabeçalho: total = soma do `useBoardSummary` com os mesmos filtros (o número do Kanban).
- Saem da tela: `useLeads`, `useOpportunities`, `useLeadEntitySummary`, `useLeadScores`,
  `useTouchpointCounts` e a consulta por célula. O modal recebe o lead por
  `useLead(row.lead_id)`.

**Aceite:** na Solo Energia, o total é o do Kanban com o mesmo filtro; rolar até o fim
carrega todos; editar seleção, multi-seleção, data, moeda, sim/não e usuário e recarregar
mostra o valor salvo; atribuir responsável a 20 negócios numa ação; ≤ 10 requisições
até as primeiras linhas.

#### T19 · Base de Contatos no servidor (M)

**Files:** create `src/hooks/useContactsTable.ts`; modify `src/components/crm/DatabaseView.tsx`,
`src/components/crm/AssignToPipelineDialog.tsx` (uma chamada a `crm_create_opportunities`;
mostra "X criados, Y já tinham negócio aberto"), `src/components/crm/ExportModal.tsx`
(recebe `ContactRow[]`; a coluna "Responsável" vira "Responsáveis dos negócios", nomes
separados por vírgula).

**Consumes:** T13 (`crm_contacts_table`, `crm_contacts_count`, `crm_delete_leads`,
`crm_create_opportunities`), T15, T17 (`ContactFilterBar`, `useContactUrlFilters`).

**Produces:**

```ts
export function useContactsTable(filters: ContactFilters, sort: CrmSort | null):
  UseInfiniteQueryResult<TablePages<ContactRow>>;
export function useContactsCount(filters: ContactFilters): UseQueryResult<number>;
export function useContactsRealtime(): void;   // leads e opportunities da equipe, debounce 1 s
export function useDeleteContacts(filters: ContactFilters, sort: CrmSort | null):
  UseMutationResult<number, Error, string[]>;
export async function fetchAllContacts(filters: ContactFilters, sort: CrmSort | null):
  Promise<ContactRow[]>;                       // exportar: páginas de 200
```

- **Sem coluna Responsável** (o contato não tem). Colunas: **Nome** (principal: abre o
  contato), Telefone, E-mail, Empresa, **Situação** (selo), **Negócios** (chips
  "linha · etapa" com o avatar do responsável; o clique abre o negócio no Kanban por
  `?opp=`), **Ganho total**, **Último ganho**, Origem, Canal, Etiquetas, Observações,
  Criado em + campos de contato (`columnFromField(campo, "personal_custom_data", "key")`).
- Filtros: busca, Criado em, Origem, Etiquetas, Próximo contato, **Situação**,
  **Pipeline**, **Responsável (de um negócio)**.
- Ações em massa: Adicionar a pipeline, Excluir.
- O contato abre por `useLead(id)`.

**Aceite:** a contagem bate com os contatos não apagados da Solo Energia (1.254 em
11/09); filtrar "cliente" bate com os contatos que têm ganho; abrir um contato pela
linha; adicionar 3 contatos a uma pipeline numa chamada; exportar todos os filtrados;
≤ 10 requisições até as primeiras linhas.

#### T20 · Responsável no negócio + modal leve (M)

**Files:** modify `src/components/crm/OpportunityDetailModal.tsx` (seletor de
responsável no cabeçalho, salva na hora por `crm_update_opportunities`; agenda e
decisões só com o modal aberto), `src/components/crm/LeadOpportunitiesSection.tsx`
(cada negócio do contato mostra avatar e nome do responsável),
`src/components/crm/OpportunityCard.tsx` (avatar do responsável no canto do card — só
isso; o redesenho é o T24), `src/hooks/useCopilotDecisions.ts` (aceita `enabled`);
create `src/hooks/useLeadAgendaEvents.ts`.

**Produces:** `useLeadAgendaEvents(leadId: string | null, enabled: boolean)` — os
`agenda_events` do contato, não da equipe inteira; `useCopilotDecisions({ pipelineId, enabled })`.

- O contato não ganha responsável: mostra os negócios e os responsáveis deles.
- `leads.responsible_id` fica como está (legado, padrão do negócio novo pelo T2), sem tela.

**Aceite:** o card mostra o avatar do responsável; trocar o responsável no modal
atualiza card e tabela sem recarregar; abrir o
Kanban e a Tabela não dispara `agenda_events` nem a API do Copilot (aba de rede); abrir
um negócio ≤ 8 requisições.

#### T21 · Tabelas personalizadas no mesmo padrão (M)

**Files:** modify `src/components/crm/customtables/CustomTableView.tsx`,
`src/hooks/useCustomTableRecords.ts`, `src/hooks/useCustomTables.ts`; create
`src/components/crm/customtables/CustomRecordDrawer.tsx`, `src/lib/customTables.ts`,
`src/lib/__tests__/customTables.test.ts`.

**Consumes:** T15 (grade, registro, `UserPicker`), `uniqueKey` (`src/lib/customFieldKeys.ts`, T8).

- Layout de altura cheia; tipos de coluna do registro: Texto, Número, Moeda, Data,
  Sim/Não, Seleção, Multi-seleção, URL, Telefone, Usuário, Relação.
- A chave da coluna nasce do rótulo por `uniqueKey` e não se edita (o contrato dos
  campos do pipeline); a coluna nova pede só rótulo e tipo.
- Abrir a linha → gaveta do registro (todos os campos, criado/atualizado, excluir).
- Excluir linha, uma ou em massa; sucesso sem toast; erro sempre aparece.
- Registros sem teto de 1.000 (`fetchAllPages`, desempate por `id`).
- Relação resolvida **por coluna**:
  `mapLinksToRows(links, targetRecords, displayField): Record<string, { id: string; name: string }[]>`
  (puro, testado) sobre duas consultas por coluna (vínculos da coluna; registros da
  tabela alvo), entregue à grade com `resolvedFromRow`.
- Página no servidor e `field_id` nas tabelas personalizadas: Onda 4, quando elas
  ganham vínculo com o negócio.

**Testes vitest:** `mapLinksToRows` (vínculo apagado some; alvo sem o campo de exibição
mostra "[registro]"; várias linhas).

**Aceite:** na tabela "Teste" da Solo Energia: criar coluna de cada tipo, editar, abrir
a gaveta, excluir linha; tabela com relação abre com 2 consultas por coluna de relação.

#### T22 · Verificação 2A, deploy e PR (S)

- Gates completos no branch; testes SQL da onda + os da Sprint 9 e da Onda 1.
- **Ponto de parada — aprovação do founder** para: (a) aplicar as migrations T12/T13/T14
  pela Management API e registrá-las em `supabase_migrations.schema_migrations` (como na
  Onda 1); (b) PR e merge (o Netlify publica o frontend). A 2A não muda edge function.
- Navegador, Solo Energia: a saída da onda (nome em < 2 s; responsável e período); o
  orçamento de latência contra a linha de base; editar cada tipo de campo na Tabela de
  Leads; Base de Contatos com a situação; dashboard filtrado por um responsável.
- Handoff "Sprint 11 · Onda 2A" em `Planning/Project Management/Sprints_PM_Handoff.md`.

### Onda 2B — Claro e no celular

| # | Tarefa | Motor | Tier |
| :-- | :-- | :-- | :-- |
| T23 | Design do card, da coluna, do placar e do celular (canvas aprovado) | — | M |
| T24 | Card e coluna redesenhados | Consulta (tela) | M |
| T25 | Placar redesenhado | Métricas | M |
| T26 | CRM no celular | todas as telas do CRM | L |
| T27 | Verificação 2B, deploy, PR e handoff | — | S |

#### T23 · Design do card, da coluna, do placar e do celular (M)

- Canvas (skill `design`) com **dados fictícios** (dado de cliente não entra em
  artefato): (1) Kanban no desktop — card novo em quatro estados (normal, contato
  atrasado, com campos do card, perdido) e cabeçalho da coluna (contagem, total, SLA,
  recolher); (2) placar em faixa única + detalhe por responsável; (3) celular — Kanban
  de uma etapa por vez com seletor e "Mover para…", lista no lugar da tabela, negócio em
  tela cheia, folha de filtros.
- Direção para o card (o canvas decide): linha 1 nome + avatar do responsável; linha 2
  valor · tempo na etapa · próximo contato; linha 3 até três campos do card e etiquetas;
  ações (Chat, Touchpoint, ⚡) no hover do desktop e sempre visíveis no toque.
- Placar: cada número uma vez só — Meta · Realizado · Ritmo · Falta · Conversão · Ciclo —
  com barra fina; por responsável num detalhe que abre.
- **Ponto de parada:** o founder aprova o canvas; as decisões ficam registradas aqui
  antes do T24.

#### T24 · Card e coluna redesenhados (M)

**Files:** modify `src/components/crm/OpportunityCard.tsx`,
`src/components/crm/CardTelemetryPillars.tsx`, `src/components/crm/OpportunityKanbanColumn.tsx`,
`src/components/crm/OpportunityKanban.tsx`; create `src/lib/cardModel.ts`,
`src/lib/__tests__/cardModel.test.ts`, `src/hooks/useCollapsedStages.ts`.

**Produces:**
`buildCardModel(card: BoardCard, stage: PipelineStageV2 | undefined, flags: NativeCardFlags, fields: CustomFieldSchema[], today: Date): CardModel`
— puro: título, valor, responsável, selos em ordem, campos visíveis (a hierarquia
aprovada vira regra testável); `useCollapsedStages(pipelineId)` (localStorage com
try/catch).

**Testes vitest:** `buildCardModel` nos quatro estados do canvas; campo vazio não
aparece; selo de atraso só com próximo contato no passado.

**Aceite:** igual ao canvas; nenhuma requisição a mais por card; recolher "Perdido"
persiste ao recarregar.

#### T25 · Placar redesenhado (M)

**Files:** modify `src/components/crm/revenue/PipelineScoreboard.tsx`,
`src/hooks/useForecast.ts`, `src/hooks/__tests__/useForecast.test.ts`.

**Consumes:** `crm_placar` (T14).

- O placar lê `crm_placar` (ganho pelo responsável do momento, como o dashboard) em vez
  de baixar todos os negócios do pipeline; `buildPlacar` sai, `computeRunRate` fica.
- Faixa única conforme o canvas; detalhe por responsável com avatar, ganhos/meta, barra
  e ritmo; "Sem responsável" aparece quando existe.

**Testes vitest:** a resposta de `crm_placar` vira o placar certo (inclui "Sem
responsável" e meta zero).

**Aceite:** os números batem com o dashboard filtrado pelo mesmo pipeline e mês.

#### T26 · CRM no celular (L)

**Files:** modify `src/pages/CRM.tsx` (abas de topo roláveis),
`src/components/crm/PipelineWorkspace.tsx` (cabeçalho compacto),
`src/components/crm/OpportunityKanban.tsx`, `src/components/crm/OpportunityKanbanColumn.tsx`,
`src/components/crm/grid/SpreadsheetGrid.tsx` (modo lista: `renderMobileRow`),
`src/components/crm/OpportunityTable.tsx`, `src/components/crm/DatabaseView.tsx`,
`src/components/crm/OpportunityDetailModal.tsx`, `src/components/crm/ContactDetailsModal.tsx`;
create `src/components/crm/mobile/StagePicker.tsx`,
`src/components/crm/mobile/MoveToStageSheet.tsx`, `src/lib/mobileBoard.ts`,
`src/lib/__tests__/mobileBoard.test.ts`.

- Abaixo de 768 px (`useIsMobile`): o Kanban mostra uma etapa por vez, escolhida por
  chips com a contagem (`crm_board_summary`); mover card é "Mover para…" (arrastar não
  funciona bem no toque); tabelas viram lista (nome, valor/etapa, responsável, próximo
  contato); filtros pela `FilterSheet` (T17); modais em tela cheia; placar recolhido em
  uma linha.

**Produces:** `pickInitialStage(summary: BoardStageSummary[], stages: PipelineStageV2[]): string`
— a primeira etapa aberta com cards; senão a primeira.

**Testes vitest:** `pickInitialStage`.

**Aceite:** em 390×844 e 360×800 (navegador redimensionado): achar um cliente pelo nome,
abrir o negócio, mover de etapa, filtrar por responsável; a página nunca rola na
horizontal.

#### T27 · Verificação 2B, deploy, PR e handoff (S)

- Gates; conferência contra o canvas; orçamento de latência de novo; celular nos dois
  tamanhos.
- **Ponto de parada:** aprovação do founder para PR e merge (a 2B só tem frontend).
- Handoff "Sprint 11 · Onda 2" (2A + 2B) em `Sprints_PM_Handoff.md`; memória do
  projeto atualizada.

### Onda 3 — Receita e linha configurada

Motores: **Receita v1** (catálogo, itens, ganho → receita, recorrência) · **Processo**
(a etapa decide o desfecho, naturezas Oferta e Processo, modelos, agendador) · **Eventos**
(reabertura, reciclo, receita) · **Métricas** (dashboard e placar sobre a receita).

#### Achados que moldam a onda (produção, 11/09)

22. **Status e etapa discordam em 200 negócios.** Mover um card para uma etapa de ganho
    ou perda grava o evento (pelo histórico de etapa), mas `opportunities.status` só muda
    se alguém trocar o "Status" no modal: 197 negócios em etapa de perda e 3 em etapa de
    ganho seguem `open` (sem `closed_at`). Contam como "em andamento" no placar e como
    "negociando" na Base de Contatos. E o ganho tem duas fontes que podem gravar dois
    eventos (`stage_change` e `status_change`) — as consultas se defendem com `distinct on`.
23. **O Reciclo nunca rodou**: o `cycle_pass` do `python-agent` existe e ninguém o chama.
    A Casa Flow tem 200 negócios na etapa Reciclo (15 dias) — 29 já vencidos; a WI
    Advogados tem a etapa (30 dias) vazia. Ligar o agendador move os vencidos de uma vez.
24. **`pg_cron` e `pg_net` estão instalados** (os crons de cobrança e relatório chamam
    edge functions). O agendador da onda é uma função do banco chamada pelo cron — sem
    edge function e sem segredo.
25. **`leads.lifecycle_stage`**: os 2.221 contatos estão em `raw`; o valor aceita
    `client`, `opportunity`, `lost`; nenhuma tela lê; o sweep do Copilot lê e regrava
    `mql`. Recalcular a partir dos negócios e da receita mantém o Copilot funcionando.
26. Receita hoje é só `opportunities.value`; `billing_products`, `proposal_items`,
    `contract_items`, `invoice_items` são da cobrança do SaaS. `scheduled_automations`
    está vazia e é por contato — não serve para timers de negócio.

#### Decisões da Onda 3

11. **A etapa decide o desfecho.** No banco: entrar numa etapa de ganho/perda fecha o
    negócio (`status`, `closed_at`); sair de uma etapa de ganho/perda para uma aberta ou
    de reciclo **reabre** (evento `reopened`; a receita é estornada). Escrever o `status`
    direto (modal, regra do Agente CRM, API) move o negócio para a primeira etapa daquele
    tipo no pipeline; sem etapa daquele tipo, a escrita vale como está. O evento de
    ganho/perda tem **uma** fonte: o caminho da etapa (que já traz autor e é idempotente
    por `source_row_id`); o gatilho de status só emite quando não houve movimento de etapa.
12. **Receita é um livro-razão** (`revenue_entries`, só inserção): no ganho, um lançamento
    por item (ou um pelo valor, sem itens), com o **responsável do momento**; reabrir
    lança o estorno; mudar itens ou valor de um negócio ganho lança o ajuste. Estorno e
    ajuste ficam no **mesmo período do ganho** (`recognized_at` do lançamento original;
    `created_at` guarda quando aconteceu): a receita de agosto é "o que foi ganho em
    agosto, como está hoje". Receita líquida = soma.
13. **Itens:** com pelo menos um item, `opportunities.value` = soma dos itens (o banco
    mantém); sem itens, o valor segue livre. O item guarda nome, preço e recorrência do
    momento em que entrou (o catálogo pode mudar depois).
14. **Catálogo por equipe** (`catalog_items`): produto ou serviço; preço **fixo** (o item
    do negócio usa o preço do catálogo) ou **negociável** (preço sugerido, editável);
    recorrência opcional (a cada N dias/meses; abrir o retorno X dias antes; em qual
    linha e etapa — padrão: a mesma linha, primeira etapa aberta).
15. **Recorrência = negócio novo por ciclo** (`opportunities.renewal_of_id`,
    `opportunities.origin = 'recorrencia'`): mesmo contato, mesmo responsável, os itens
    recorrentes; o retorno ganho agenda o seguinte. *Refinado no T34:* **um retorno por
    negócio e por cadência** — a limpeza semestral e a manutenção anual do mesmo negócio
    viram dois retornos, cada um no seu tempo e no pipeline/etapa do item.
16. **Agendador único:** `crm_run_timers()` a cada 15 min pelo `pg_cron` — reciclo (move
    para a etapa alvo, evento `recycled`, webhook da etapa por `pg_net`) e recorrência
    (cria os retornos). Cada execução fica em `crm_timer_runs`. `crm_run_timers(dry_run)`
    responde o que faria sem fazer. O `cycle_pass` do `python-agent` é aposentado.
17. **Situação do contato vem dos ganhos e da receita:** cliente = tem negócio ganho vivo
    (o mesmo fato que gera a receita — reabrir/perder/apagar tira os dois); negociando =
    negócio aberto; perdido = só perdidos. *Refinado no T32:* "cliente = receita > 0"
    rebaixaria 49 clientes — 65 ganhos da produção não têm valor. O **Ganho total** é a
    receita líquida. `lifecycle_stage` é recalculado para `client` / `opportunity` / `lost`
    pelos mesmos fatos; `raw`/`mql`/`sql` seguem para quem não tem negócio.
18. **Naturezas Oferta e Processo** em `pipelines.natures` (jsonb): Oferta = valor livre
    (padrão, o de hoje) ou catálogo (quais itens); Processo = marcos (qualificação,
    reunião, proposta, contrato) ou compra direta. Escolher os marcos gera as etapas
    que já declaram o `funnel_event`. Marcos novos: `contract_sent`, `contract_signed`.
19. **Modelos** combinam naturezas + etapas + sugestões de catálogo: venda consultiva
    (solar), clínica com retorno (dentista), lançamento (cinema), serviço jurídico.
20. **Dado existente só com aprovação, no T38, cada um ensaiado:** (a) os 200 negócios
    com status ≠ etapa → status da etapa, `closed_at` = entrada na etapa, sem evento novo;
    (b) receita dos ganhos antigos: um lançamento pelo valor, na data do ganho, com o
    responsável do momento; (c) o reciclo acumulado da Casa Flow (29 vencidos) — o
    founder escolhe soltar tudo ou só os que vencerem depois de ligar.

#### Onda 3A — Receita

| # | Tarefa | Motor | Tier |
| :-- | :-- | :-- | :-- |
| T28 | A etapa decide o desfecho | Processo · Eventos | XL |
| T29 | Catálogo | Receita · Modelo | L |
| T30 | Itens do negócio | Receita | L |
| T31 | Ganho → receita (livro-razão, estorno, ajuste) | Receita · Eventos | XL |
| T32 | Situação e ciclo de vida do contato pela receita | Receita · Consulta | M |
| T33 | Métricas pela receita | Métricas | L |
| T34 | Agendador: reciclo e recorrência | Processo · Automação | XL |

#### T28 · A etapa decide o desfecho (XL)

**Files:** create `supabase/migrations/20260912000100_sprint11_w3_outcome.sql`,
`supabase/tests/sprint11_w3_outcome.test.sql`,
`supabase/scripts/2026-09-12_sprint11_repair_status_from_stage.sql` (+ ensaio em
`supabase/tests/sprint11_w3_repair_status.test.sql`); modify
`src/components/crm/OpportunityDetailModal.tsx` (o "Status" vira "Desfecho": escolher
Ganha/Perdida move para a etapa daquele tipo; aberta reabre na primeira etapa aberta),
`src/hooks/useBoard.ts` (mover para etapa de ganho/perda atualiza o status no cache).

- `fn_opportunity_outcome` (BEFORE INSERT/UPDATE): etapa → `status`/`closed_at`; status
  escrito direto → etapa; reabertura limpa `closed_at` e marca `reopened`.
- `fn_record_stage_funnel_event` segue emitindo ganho/perda pelo histórico;
  `fn_record_status_funnel_event` só emite sem movimento de etapa; `reopened` e
  `recycled` entram no catálogo de eventos.

**Testes SQL:** mover para ganho fecha e emite **um** `won`; status escrito direto move
para a etapa; sem etapa de ganho, o status vale; reabrir limpa `closed_at` e emite
`reopened`; a métrica da Sprint 9 conta o mesmo ganho uma vez; RLS do vizinho.

**Aceite:** nenhum negócio com status ≠ etapa depois do reparo (ensaiado em rollback);
os testes da Sprint 9 e da Onda 2 passam sobre a versão nova.

#### T29 · Catálogo (L)

**Files:** create `supabase/migrations/20260912000200_sprint11_w3_catalog.sql`,
`supabase/tests/sprint11_w3_catalog.test.sql`, `src/types/revenue.ts`,
`src/hooks/useCatalog.ts`, `src/components/crm/catalog/CatalogView.tsx`,
`src/components/crm/catalog/CatalogItemDialog.tsx`; modify `src/pages/CRM.tsx` (aba
"Catálogo").

**Produces:** `catalog_items` (id, equipe_id, name, kind `product|service`, price,
price_mode `fixed|negotiable`, recurrence_every, recurrence_unit `day|month`,
renew_days_before, renew_pipeline_id, renew_stage_id, active, description, timestamps,
deleted_at); verbos `crm_save_catalog_item(p_item jsonb) → uuid`,
`crm_archive_catalog_items(p_ids uuid[]) → int`.

**Testes SQL:** fixo exige preço; recorrência exige intervalo e unidade juntos; etapa de
retorno precisa ser do pipeline de retorno; vizinho não vê; arquivar não apaga itens de
negócio já vendidos.

#### T30 · Itens do negócio (L)

**Files:** create `supabase/migrations/20260912000300_sprint11_w3_items.sql`,
`supabase/tests/sprint11_w3_items.test.sql`, `src/lib/dealItems.ts`,
`src/lib/__tests__/dealItems.test.ts`, `src/hooks/useOpportunityItems.ts`,
`src/components/crm/deal/DealItemsSection.tsx`; modify
`src/components/crm/OpportunityDetailModal.tsx` (seção "Itens"; o campo Valor fica só
leitura quando há itens).

**Produces:** `opportunity_items` (id, equipe_id, opportunity_id, catalog_item_id,
name, quantity, unit_price, total gerado, recorrência copiada do catálogo, position,
timestamps, deleted_at); trigger que mantém `opportunities.value` = soma quando há itens;
verbo `crm_set_opportunity_items(p_opportunity_id uuid, p_items jsonb) → jsonb` (troca a
lista numa transação; preço fixo vem do catálogo, não do pedido).

**Testes:** vitest do total e das regras de preço; SQL: soma, remover o último item
devolve o valor livre, preço fixo ignora o preço mandado, item de outro tenant recusado.

#### T31 · Ganho → receita (XL)

**Files:** create `supabase/migrations/20260912000400_sprint11_w3_revenue.sql`,
`supabase/tests/sprint11_w3_revenue.test.sql`,
`supabase/scripts/2026-09-12_sprint11_backfill_revenue.sql` (+ ensaio),
`src/hooks/useDealRevenue.ts`, `src/components/crm/deal/DealRevenueSection.tsx`; modify
`src/components/crm/OpportunityDetailModal.tsx` (seção "Receita": lançamentos e líquido).

**Produces:** `revenue_entries` (id, equipe_id, opportunity_id, lead_id, pipeline_id,
opportunity_item_id, catalog_item_id, line_key, amount, kind `booking|adjustment|reversal`,
recognized_at, owner_id, actor, created_at) só inserção (RLS: select; escrita só pelo
banco); `_crm_sync_revenue(p_opportunity_id)` — lança a diferença entre o que o negócio
deve (ganho: itens ou valor; senão nada) e o que já está lançado, por linha.

**Testes SQL:** ganho com 2 itens → 2 lançamentos; sem itens → 1; reabrir → estorno no
período do ganho; ganhar de novo → novo lançamento; editar valor de um ganho → ajuste;
responsável do momento; nada muda num negócio aberto; o vizinho não lê.

#### T32 · Situação e ciclo de vida do contato pela receita (M)

**Files:** create `supabase/migrations/20260912000500_sprint11_w3_contact_situation.sql`,
`supabase/tests/sprint11_w3_contact_situation.test.sql`.

- `_crm_lead_relationship` e o agregado de `crm_contacts_table` passam a ler a receita
  líquida (Ganho total = receita líquida; Último ganho = último lançamento positivo).
- `lifecycle_stage` recalculado (`client`/`opportunity`/`lost`) quando negócio ou receita
  do contato muda; `raw`/`mql`/`sql` intocados para quem não tem negócio.

**Testes SQL:** cliente só com receita líquida > 0; estorno devolve a "perdido" ou
"negociando"; o sweep do Copilot (`mql`) continua valendo sem negócio.

#### T33 · Métricas pela receita (L)

**Files:** create `supabase/migrations/20260912000600_sprint11_w3_revenue_metrics.sql`,
`supabase/tests/sprint11_w3_revenue_metrics.test.sql`; modify
`src/lib/scoreboard.ts` (se o contrato do placar mudar), o catálogo de gráficos do
dashboard (quebra "Produto").

- Overview, série e quebras da Sprint 9 e `crm_placar` somam a **receita líquida** por
  `recognized_at` e pelo responsável do momento (hoje: `opportunities.value` do ganho).
- Nova dimensão de quebra **produto** (receita por item do catálogo).

**Testes SQL:** os da Sprint 9 e da Onda 2 passam; estorno some da métrica do período;
receita por produto soma o que o negócio vendeu.

#### T34 · Agendador: reciclo e recorrência (XL)

**Files:** create `supabase/migrations/20260912000700_sprint11_w3_timers.sql`,
`supabase/tests/sprint11_w3_timers.test.sql`,
`supabase/scripts/2026-09-12_sprint11_schedule_timers.sql` (o `cron.schedule`, aplicado só
no T38); modify `python-agent/app/routers/cycle_pass.py` (aposentado: responde 410 e
aponta para o agendador).

**Produces:** `opportunities.renewal_of_id`, `opportunities.origin`; `crm_timer_runs`;
`crm_run_timers(p_dry_run boolean default false, p_recycle_since timestamptz default null) → jsonb`.

**Testes SQL:** reciclo move só o vencido, emite `recycled`, respeita `p_recycle_since`;
recorrência cria um retorno X dias antes, com contato, responsável e itens, uma vez só;
retorno ganho agenda o seguinte; `dry_run` não escreve.

#### Onda 3B — Linha configurada

| # | Tarefa | Motor | Tier |
| :-- | :-- | :-- | :-- |
| T35 | Naturezas Oferta e Processo + marcos | Processo | L |
| T36 | Modelos de linha | Processo | M |
| T37 | Track Shaper preenche naturezas e marcos | Processo · Copilot | M |
| T38 | Verificação, deploy (parada), PR e handoff | — | S |

#### T35 · Naturezas Oferta e Processo + marcos (L)

**Files:** create `supabase/migrations/20260912000800_sprint11_w3_natures.sql`,
`supabase/tests/sprint11_w3_natures.test.sql`, `src/types/natures.ts`,
`src/lib/natures.ts`, `src/lib/__tests__/natures.test.ts`,
`src/components/crm/pipeline-settings/PipelineNaturesEditor.tsx`; modify a tela de
configuração do pipeline (aba "Natureza").

**Produces:** `pipelines.natures` `{ offer: { mode: 'free'|'catalog', catalog_item_ids },
process: { mode: 'milestones'|'direct', milestones } }`; `stagesForMilestones(milestones)`
(puro: as etapas na ordem, cada uma com o `funnel_event`, + ganho e perdido); marcos
novos `contract_sent`, `contract_signed`.

#### T36 · Modelos de linha (M)

**Files:** create `src/lib/pipelineTemplates.ts`, `src/lib/__tests__/pipelineTemplates.test.ts`;
modify o diálogo de novo pipeline ("Começar de um modelo").

- Venda consultiva (solar) · Clínica com retorno (dentista) · Lançamento (cinema) ·
  Serviço jurídico: naturezas + etapas com marcos + sugestões de catálogo.

#### T37 · Track Shaper preenche naturezas e marcos (M)

**Files:** modify `python-agent/app/schemas.py`, `python-agent/app/cascade/track_shaper.py`,
`python-agent/app/routers/shape.py`, `python-agent/tests/test_track_shaper.py`,
`src/services/copilot.ts` (tipo do blueprint), `src/components/crm/copilot/TrackShaperDialog.tsx`.

- O blueprint ganha `natures` e `funnel_event` por etapa; o apply grava os dois.
- O deploy do `python-agent` é manual — entra na parada do T38.

#### T38 · Verificação, deploy e handoff (S)

- Gates; testes SQL da onda + Sprint 9 + Onda 1/2.
- **Ponto de parada — aprovação do founder** para: (a) aplicar as migrations 0100…0800;
  (b) reparo dos 200 status (ensaio passou); (c) backfill da receita (ensaio passou);
  (d) ligar o agendador e o que fazer com o reciclo acumulado da Casa Flow;
  (e) deploy do `python-agent`; (f) PR e merge.
- Handoff "Sprint 11 · Onda 3" em `Sprints_PM_Handoff.md`.

### Onda 4 — Artefatos: Propostas e Contratos

Motores: **Artefatos v1** (documento preso ao negócio, ciclo de vida, arquivo) ·
**Modelo** (tabelas em `field_id`, N:1 com o negócio, consulta, arquivo) · **Automação**
(botão → webhook → retorno) · **Entradas** (formulário público) · **Eventos** (o artefato
prova o marco).

#### Achados que moldam a onda (produção, 12/09)

27. **Tabelas personalizadas quase vazias:** uma só na produção ("Teste" da Solo Energia,
    1 coluna, 2 registros, 0 vínculos). Passar para `field_id` é barato agora — e caro
    depois que as propostas entrarem.
28. **A fila de webhooks de saída já existe:** `enqueue_crm_webhooks` → `deliver-crm-webhook`
    (edge) → `webhook_logs` (com `dispatch_token`). O botão de automação usa a mesma fila;
    não nasce outro caminho de saída.
29. **Os dois buckets do Storage são públicos** (`agent-training-docs`, `chat-attachments`):
    quem tem a URL lê. Proposta e contrato carregam CPF, endereço e valores — o arquivo do
    artefato vai para um bucket **privado**, com a pasta da equipe e URL assinada.
    (`chat-attachments` público fica registrado como risco, fora desta onda.)
30. **Os fluxos do n8n (APITemplate / ClickSign) não estão visíveis daqui** (o MCP do n8n
    pede login do founder). O pré-requisito do plano não se cumpre por dentro: esta onda
    **fixa o contrato v1** do payload e do retorno; os fluxos da Solo se adaptam a ele (ou
    o founder mostra os fluxos e o mapeamento entra no T44).

#### Decisões da Onda 4

21. **Artefato = registro de uma tabela personalizada marcada como artefato**
    (`custom_tables.artifact_kind`: `proposal` · `contract` · `document`), preso a um
    negócio por coluna de verdade (`custom_table_records.opportunity_id`, N:1), não por
    vínculo solto. A espinha entende: painel reverso no negócio ("Propostas (3)"),
    consulta, ciclo de vida, marco. Tabela que não é artefato continua granular.
22. **Tabelas personalizadas em `field_id`** (o contrato dos campos do pipeline): cada
    coluna ganha `field_id`, o valor mora em `data[field_id]`, a `key` é o nome público
    nas bordas (payload, formulário). Página no servidor (`crm_custom_table_page`).
23. **Campo de consulta** (`lookup`): coluna só leitura que lê do negócio ligado —
    nome, telefone, e-mail do contato; valor, etapa, responsável do negócio; os itens
    do catálogo. Resolvido no servidor na leitura (nunca copiado: o negócio muda, a
    proposta mostra o de agora; o que precisa congelar vai para um campo comum).
24. **Campo arquivo**: bucket privado `artifacts`, caminho `{equipe}/{tabela}/{registro}/`,
    RLS do Storage pela pasta da equipe; o valor guarda caminho, nome, tamanho e tipo; ver
    é por URL assinada de curta duração.
25. **Ciclo de vida do artefato** (`artifact_status`): rascunho → enviado →
    aceito/assinado · recusado, pelo verbo `crm_set_artifact_status`. O artefato prova o
    marco: Proposta *enviada* = `proposal_sent`; Contrato *enviado* = `contract_sent`;
    *assinado* = `contract_signed`. Se o pipeline tem a etapa que declara o marco e o
    negócio está antes dela, o negócio avança para ela (o evento sai pelo caminho da
    etapa — uma fonte só); senão o evento é gravado direto (fonte `artifact`). Nunca
    volta etapa, nunca mexe em negócio fechado.
26. **Botão de automação → webhook → retorno** (contrato **v1**): o clique chama
    `crm_run_artifact_action` → payload `{ version: 1, action, record (por key), deal,
    contact, items, callback: { url, token } }` pela fila de saída. O n8n devolve em
    `artifact-callback` (edge, pública, só com o token): `status`, `fields` (por key) e
    `files` (URL → baixado para o bucket privado). Token de uso único, validade de 7 dias,
    guardado como hash.
27. **Formulário público por registro** (Dados para Contrato): a tabela escolhe os
    campos do formulário; cada registro tem um link com token (`/f/:token`); o cliente
    preenche sem login; o registro recebe os valores e a hora do envio; o token vale até
    o envio ou 30 dias.
28. **Dado existente só com aprovação, no T47**: converter "Teste" para `field_id`;
    criar as tabelas da Solo Energia ("Propostas Comerciais", "Contratos") — ensaiadas em
    rollback.

#### Onda 4A — Modelo e artefato

| # | Tarefa | Motor | Tier |
| :-- | :-- | :-- | :-- |
| T39 | Tabelas personalizadas em `field_id` + página no servidor | Modelo · Consulta | L |
| T40 | Artefato preso ao negócio + painel no negócio | Artefatos · Modelo | L |
| T41 | Campos de consulta | Modelo | M |
| T42 | Campo arquivo (bucket privado) | Modelo · Artefatos | L |
| T43 | Ciclo de vida do artefato → marco | Artefatos · Eventos | M |

#### T39 · Tabelas personalizadas em `field_id` + página no servidor (L)

**Files:** create `supabase/migrations/20260912100100_sprint11_w4_custom_tables_field_id.sql`,
`supabase/tests/sprint11_w4_custom_tables.test.sql`; modify `src/hooks/useCustomTables.ts`,
`src/hooks/useCustomTableRecords.ts`, `src/lib/customTables.ts` (+ testes),
`src/components/crm/customtables/CustomTableView.tsx`, `CustomRecordDrawer.tsx`.

- Coluna nova ganha `field_id` (uuid); a migração dá `field_id` às colunas que não têm
  e reescreve `data[key]` → `data[field_id]` (idempotente; ensaiada sobre "Teste").
- `crm_custom_table_page(p_table_id, p_search, p_sort, p_limit, p_offset)` e
  `crm_custom_table_count` (busca em texto, ordenação por coluna sem SQL dinâmico).
- Vínculos (`custom_table_links.relation_key`) passam a `field_id`.

#### T40 · Artefato preso ao negócio + painel no negócio (L)

**Files:** create `supabase/migrations/20260912100200_sprint11_w4_artifacts.sql`,
`supabase/tests/sprint11_w4_artifacts.test.sql`, `src/hooks/useDealArtifacts.ts`,
`src/components/crm/deal/DealArtifactsSection.tsx`; modify o criador de tabela
(tipo "Artefato: proposta/contrato/documento"), `OpportunityDetailModal.tsx`.

- `custom_tables.artifact_kind`; `custom_table_records.opportunity_id` (+ índice) e
  `artifact_status`; verbo `crm_create_artifact(p_table_id, p_opportunity_id, p_data)`.
- Painel no negócio: uma seção por tabela de artefato ("Propostas (3)"), criar já
  ligado, abrir o registro.

#### T41 · Campos de consulta (M)

**Files:** modify a migration de página (`lookup` resolvido no servidor), o registro de
tipos (`lookup`), o editor de colunas; `lib/customTables` (+ testes).

- Fontes: `contact.name|phone|email`, `deal.value|stage|owner`, `deal.items`.

#### T42 · Campo arquivo (L)

**Files:** create `supabase/migrations/20260912100300_sprint11_w4_artifact_files.sql`
(bucket privado + políticas do Storage), `src/hooks/useArtifactFiles.ts`,
`src/components/crm/customtables/FileField.tsx`; modify o registro de tipos (`file`) e a gaveta.

#### T43 · Ciclo de vida do artefato → marco (M)

**Files:** create `supabase/migrations/20260912100400_sprint11_w4_artifact_lifecycle.sql`,
`supabase/tests/sprint11_w4_artifact_lifecycle.test.sql`; modify o painel e a gaveta
(seletor de status).

- `crm_set_artifact_status(p_record_id, p_status)`; fonte `artifact` no catálogo de
  eventos; avança o negócio para a etapa do marco quando ele está antes.

#### Onda 4B — Automação e bordas

| # | Tarefa | Motor | Tier |
| :-- | :-- | :-- | :-- |
| T44 | Botão de automação com retorno (contrato v1) | Automação · Artefatos | XL |
| T45 | Formulário público por registro | Entradas · Artefatos | L |
| T46 | Semente da Solo Energia: Propostas Comerciais e Contratos | Artefatos | M |
| T47 | Verificação, deploy (parada), PR e handoff | — | S |

#### T44 · Botão de automação com retorno (XL)

**Files:** create `supabase/migrations/20260912100500_sprint11_w4_artifact_actions.sql`,
`supabase/functions/artifact-callback/index.ts` (+ teste Deno),
`supabase/tests/sprint11_w4_artifact_actions.test.sql`,
`Planning/Architecture/contrato_artefato_v1.md` (payload e retorno, com exemplos);
modify o editor da tabela (ações: rótulo + URL) e a gaveta (botões).

#### T45 · Formulário público por registro (L)

**Files:** create `supabase/migrations/20260912100600_sprint11_w4_public_forms.sql`,
`supabase/functions/public-form/index.ts`, `src/pages/PublicForm.tsx` (rota `/f/:token`);
modify o editor da tabela (campos do formulário) e a gaveta (copiar link).

#### T46 · Semente da Solo Energia (M)

**Files:** create `supabase/scripts/2026-09-12_sprint11_seed_solo_artifacts.sql` (+ ensaio).

- "Propostas Comerciais" (os campos do Jestor, em `field_id`, com consulta ao contato e
  aos itens) e "Contratos" (Dados para Contrato no formulário público).

#### T47 · Verificação, deploy e handoff (S)

- Gates; testes SQL da onda + anteriores; teste Deno do retorno.
- **Ponto de parada — aprovação do founder** para: migrations 1001…1006, conversão da
  "Teste", semente da Solo, deploy das edge functions `artifact-callback` e `public-form`,
  PR e merge.
- Handoff "Sprint 11 · Onda 4".

### Onda 5 — Entradas e atribuição *(plano detalhado depois)*

Motores: Entradas v1 · Métricas (ROI sobre a receita).

- Naturezas **Duração** (contínuo, ou campanha com início e fim — ao terminar para de
  receber e o placar vira o relatório da campanha) e **Entradas** (que fontes alimentam
  a linha) no pipeline.
- **Atribuição por lead** (primeiro toque): plataforma, campanha, conjunto/anúncio,
  UTMs, click IDs (`fbclid`, `gclid`, `ctwa_clid`), landing page, formulário,
  referrer, payload bruto.
- **Tabela de campanhas:** nome, plataforma, responsável, meta, investimento (manual
  primeiro) → ROI por campanha sobre a receita (Onda 3).
- Cada entrada **carimba a própria origem** (Formulário Meta ADS → social pago / Meta /
  nome do formulário), captura `utm_*` sozinha e pode definir o responsável (fixo ou
  rodízio).
- **Spike:** o canal de WhatsApp entrega dado de anúncio clique-para-WhatsApp? Se sim,
  "Mensagem Whatsapp" ganha a campanha sozinha.
- Os 639 "Tráfego Pago" antigos ficam como social pago sem plataforma — a campanha não
  é recuperável.
- Página de integrações (Meta Ads, Google Ads, ClickSign, Resend, APITemplate) →
  sprint seguinte.

### Fora desta sprint

Copilot: velocidade e UI (ponto 8 — medir antes de mexer) · modelo do lead score ·
página de integrações · MCP (`future_sprint__mcp_v1.md`) · visões salvas, agrupar e
"selecionar todos os filtrados" (v1.2) · filtros por campo de contato · campos de
contato em `field_id` (v1.2) · regras do Agente CRM com campo Usuário · campo com
vários usuários · virtualização de lista (só se o orçamento de latência falhar).

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

### Wave map — Onda 2

```
2A   T11 ─► T12 ─► T13 ─► T14                 SQL: Consulta, Automação, Eventos, Métricas
            T12 ─► T15 ─► T16 ─► T17          Modelo v1 + barra de filtros
     T13 + T17 ─► T18 ─► T19                  as tabelas sobre as RPCs
            T15 ─► T20 ─► T21 ─► T22          modal, tabelas personalizadas, deploy da 2A
2B   (branch do main depois do merge da 2A)
     T23 (canvas aprovado) ─► T24 ─► T25 ─► T26 ─► T27
```

Execução solo e sequencial: T11 … T22 (entrega 2A), depois T23 … T27 (entrega 2B).
Arquivos compartilhados entre tarefas (`OpportunityKanban.tsx`, `OpportunityTable.tsx`,
`DatabaseView.tsx`, os modais) só são tocados por uma tarefa de cada vez, na ordem.

### Wave map — Onda 3

```
3A   T28 ─► T29 ─► T30 ─► T31 ─► T32 ─► T33      o desfecho, o catálogo, os itens, a receita, quem lê
                          T31 ─► T34              o agendador usa itens e receita
3B   T35 ─► T36 ─► T37                            naturezas, modelos, Track Shaper
     T34 + T37 ─► T38                             uma parada só: migrations, dados, cron, python-agent, PR
```

Execução solo e sequencial, branch `claude/sprint11/w3a/receita` (T28–T34) e
`claude/sprint11/w3b/linha-configurada` (T35–T37, do 3A). As migrations só vão para a
produção no T38, antes do merge do frontend. `OpportunityDetailModal.tsx` é tocado por
T28, T30 e T31, nessa ordem.


### Wave map — Onda 4

```
4A   T39 ─► T40 ─► T41                 field_id e página; artefato no negócio; consulta
            T40 ─► T42 ─► T43          arquivo; ciclo de vida → marco
4B   T43 ─► T44 ─► T45 ─► T46          botão com retorno; formulário; semente da Solo
     T46 ─► T47                        uma parada: migrations, dados, edge functions, PR
```

Execução solo e sequencial, branch `claude/sprint11/w4a/artefatos` (T39–T43) e
`claude/sprint11/w4b/automacao-e-formulario` (T44–T47, do 4A). A gaveta do registro e o
modal do negócio são tocados por várias tarefas, uma de cada vez, na ordem.

---

## 📊 Ledger

- [x] T1 · Runner de teste SQL · S
- [x] T2 · Responsável no negócio · M
- [x] T3 · RPCs do quadro · L — na base real da Solo Energia: resumo 185 ms (conta os 1.259), página de 30 cards da maior coluna 114 ms
- [x] T4 · Kanban no quadro do servidor · L — código pronto (tsc, build, 22 testes de `lib/board` e `lib/debounce`); aceite ao vivo (1.259, <20 requisições) depende do deploy das RPCs → T10. Desvios do plano: `moveCardInPages` virou `removeCardFromPages` + `prependCardToPages` (as colunas são caches separados); `useOpportunityMutations`/`useLeadMutations` criados porque o modal de detalhe carregava a equipe inteira mesmo fechado; caixa de busca no cabeçalho do Kanban (antecipa o ponto 1 — o servidor já filtra)
- [x] T5 · Tabelas sem teto + score/touchpoints em uma chamada · M — `useLeadScore` (singular, sem uso, com uma segunda cópia da fórmula) removido
- [x] T6 · Placar com números reais · S — além do `assigned_to`, o placar contava ganhos/perdas de **todo o histórico** (a Solo Energia apareceria com 137 ganhos contra a meta do mês): agora conta só o que fechou dentro do período; e placar + formulário de metas pediam `profiles.name`, coluna que não existe — os nomes por vendedor e o seletor de metas por vendedor nunca funcionaram
- [x] T7 · Webhook deduplica pelo telefone normalizado · M — **achado maior no caminho:** `_shared/opportunities.ts` procurava etapa `stage_type = 'aberto'` desde 23/06 (a reversão da 6.8 não viu o arquivo), então **nenhum lead de WhatsApp ou webhook virou negócio**: 296 leads fora de Kanban (Casa Flow 174, Cinemas Benficas 120, Rema 1, Solo Energia 1). O mesmo erro matava os movimentos de etapa por intenção do `analyze-message`/`rule-engine`. Corrigido + teste Deno; webhook de entrada agora respeita o pipeline configurado. Backfill pronto e ensaiado em `supabase/scripts/2026-09-10_sprint11_backfill_inbound_opportunities.sql` (desliga o webhook `lead_created` na transação) — **aguarda aprovação no T10**
- [x] T8 · Contrato dos campos · M — o teste rodado contra a função atual da produção confirmou o bug (valor digitado no app caía em "Não informado"); a quebra agora conta multi-seleção por item (receita por produto)
- [x] T9 · Reparo dos dados da Solo Energia · L — **aplicado em produção em 10/09** (ensaio passou; a migration do owner, T2, foi aplicada à mão antes, por ser pré-requisito — idempotente). Conferido: 9 campos declarados, 0 valor fora do contrato (eram 6.193), responsável Mateus 390 / Luiz 223, 0 lead com a data da importação, 3 ganhos/perdas em setembro (eram 640), mediana do tempo na etapa 24 dias (era 0), 95 "próximo contato" nos cards ativos, 10 nomes com escape do Jestor corrigidos. Backups `*_backup_sprint11` com RLS
- [x] T10 · Verificação, deploy e handoff · S — migrations aplicadas e registradas no histórico; 4 edge functions publicadas; backfill de 297 negócios aplicado; handoff em `Sprints_PM_Handoff.md`. Pendente: verificação no navegador depois do deploy do frontend

### Ledger · Onda 2A

- [x] T11 · Verificação da Onda 1 + linha de base · S — baseline de banco de dados registrada durante Onda 2A (resumo 8 ms, colunas 78 ms, tabela de leads 153 ms, contatos 35 ms); verificação no navegador postergada devido a extensão desconectada
- [x] T12 · Filtros v2 no servidor · L — 10 blocos de teste SQL passando (e o teste da Onda 1 roda sobre a versão nova); um mutante provou que o arquivo falha quando deve. A mais do plano: as datas e valores dos filtros nativos (criado em, valor) também passam pelas conversões seguras — antes, `criado` malformado na URL derrubaria o quadro. `cleanFilters` virou genérico (negócio e contato)
- [x] T13 · Tabelas no servidor + verbos de negócio · L — medido na base real da Solo Energia (em `rollback`): a 1ª versão do T12 relia o `p_filters` em cada linha e deixou o resumo do Kanban em 590 ms (era 185 ms na Onda 1) e "clientes" na Base de Contatos em 2 s. **Filtro compilado** (`_crm_compile_*` lê o jsonb uma vez; `_crm_*_matches_c` é SQL que o planner embute) + contatos agregados numa passada só: resumo do Kanban **8 ms**, maior coluna 78 ms, Tabela de Leads p1 153 ms (ordenando por campo 120–131 ms, filtro de campo 122 ms), Base de Contatos p1 35 ms, clientes por ganho 25 ms, contagem 13 ms. `crm_opp_matches`/`crm_lead_matches` seguem como contrato para linha avulsa. Achado: o pipeline da Solo Energia tem **duas chaves `reuniao_agendada`** (seleção e sim/não) — as bordas que traduzem por `key` ficam ambíguas; corrigir renomeando a chave de um dos dois (dado de produção, com aprovação)
- [x] T14 · Eventos com o responsável do momento + métricas por responsável · L — o teste novo passou de primeira (ganho de B passado para C continua de B em overview, série, quebra, motivos, placar e depois do replay); a troca de dono é carimbada com `clock_timestamp()` (dentro de uma transação `now()` é fixo e empataria com o ganho). A quebra por dimensão agora agrega estado e evento em separado (antes: subconsulta por negócio). Os quatro testes da Sprint 9 / Onda 1 que tocam métricas e eventos rodam sobre a versão nova e passam; o `sprint9_w1_funnel_events` foi escrito para o banco local vazio e **falhava contra a produção antes desta tarefa** (contava todos os eventos reais) — agora conta só a equipe do teste. O ensaio do backfill rodou sobre os `funnel_events` reais dentro do `rollback`
- [x] T15 · Registro de tipos de campo + grade certa por tipo · L — `src/lib/fields/` (registro dos 15 tipos, datas no dia local, `columnFromField`); célula pura (sem consulta) com editor por tipo: seleção nativa com as opções do campo, multi-seleção grava lista, data grava meia-noite local, moeda aceita "1.234,56", usuário pelo `UserPicker`; erro de gravação aparece na célula. Grade: abrir pelo campo principal, cabeçalho fixo, sentinela de rolagem infinita. 42 testes novos (registro, datas, colunas, célula). Desvios: `columnFromField` ganhou o 4º parâmetro `context` (nome dos membros para o tipo usuário, sem hook por célula); seleção inline é `<select>` nativo (sem portal dentro da tabela que rola); o rótulo "Usuário" entrou no `CustomFieldsEditor` aqui para o build fechar (o resto do tipo é o T16)
- [x] T16 · Campo Usuário · M — tipo `user` no editor de campos, no formulário do negócio (`UserPicker`) e na validação (só `profiles.id`); o card passou a formatar **todo** campo pelo registro (endereço deixa de aparecer "Dados preenchidos" e referência deixa de mostrar o id cru) — o Kanban carrega os nomes da equipe uma vez e passa aos cards. A quebra do dashboard por campo Usuário já sai com nome (T14). Aceite ao vivo (criar "Pré-vendedor", filtrar) fica para a verificação do T22
- [x] T17 · Barra de filtros e filtros na URL · L — `crmFilterParams` (ida e volta testada: acentos, `|`, `~`, vírgula dentro de etiqueta, uma ponta só, parâmetro inválido descartado sem erro), `useDeal/ContactUrlFilters`, `DealFilterBar` e `ContactFilterBar` (busca com debounce, Responsável com "Sem responsável", Criado em com atalhos, "+ Filtro" com editor por tipo de campo, chips removíveis, Limpar) e a folha de filtros no celular. O Kanban usa a barra; trocar de pipeline apaga etapa/campo, trocar de aba apaga todos os filtros. 16 testes novos. A mais: o chip-model (`filters/model.ts`) é puro e testado. Aceite ao vivo (nome em < 2 s, link compartilhado) no T22
- [x] T18 · Tabela de Leads no servidor · M — `useOppTable` (páginas de 50 de `crm_opp_table`, filtro da URL, ordenação no servidor, realtime com debounce) e ações pelo verbo com patch otimista. Colunas: Lead (abre o negócio), **Responsável** (editável), Empresa (chips da linha, vincular continua), Valor em R$, Etapa, Status, Próximo contato, Criado em e cada campo pelo registro. Ações em massa: mover, **atribuir responsável**, excluir (agora com confirmação — antes excluía direto). Saíram da tela `useLeads`, `useOpportunities`, `useLeadEntitySummary`, `useLeadScores`, `useTouchpointCounts` e a consulta por célula. Desvios: edição de uma célula não refaz a consulta da tabela (o patch otimista já mostra; o realtime atualiza em 1 s); `useOpportunityMutations`/`useLeadMutations` passam a invalidar as tabelas novas (salvar no modal atualiza a tabela). "Selecionar todos" cobre as linhas carregadas (todos os filtrados: v1.2). Aceite ao vivo no T22
- [x] T19 · Base de Contatos no servidor · M — `useContactsTable` (páginas de 50 de `crm_contacts_table`, contagem à parte, realtime de leads e negócios com debounce, exclusão pelo verbo com patch otimista, `fetchAllContacts` em páginas de 200 para exportar). Sem coluna Responsável: **Situação** (selo), **Negócios** (chips com a cor da etapa e o avatar do responsável; o clique abre o negócio no Kanban por `?opp=`), **Ganho total**, **Último ganho**; o nome abre o contato (antes a linha não abria nada). "Adicionar a pipeline" é uma chamada a `crm_create_opportunities` ("X criados · Y já tinham negócio aberto"; antes carregava todos os leads e negócios da equipe e cria um por vez); exportar leva todos os filtrados, com "Responsáveis dos negócios". A mais: o verbo `crm_create_opportunities` passa o contato de `lead` para `opportunity` (o diálogo antigo fazia isso no cliente; teste do T13 cobre); a grade ganhou `ColumnDef.render` (coluna só de exibição, desenhada pela tela); `useLeadEntitySummary` saiu (sem uso) e vincular empresa passa a invalidar `contacts_table`. Aceite ao vivo (1.254, ≤ 10 requisições) no T22
- [x] T20 · Responsável no negócio + modal leve · M — seletor de responsável no cabeçalho do negócio: salva na hora pelo verbo `crm_update_opportunities` (entra no histórico de dono) e troca o avatar no card e na tabela antes da resposta (`setOwner` em `useOpportunityMutations`, patch em toda coluna do quadro e toda tabela carregada por `patchRowInCache`, testado; desfaz se falhar). O card mostra o avatar do responsável no canto (tracejado quando não tem); cada negócio do contato mostra avatar e nome. Modal leve: `useLeadAgendaEvents` pede só a agenda do contato (antes: a agenda da equipe inteira, filtrada no navegador) e `useCopilotDecisions` ganhou `enabled`. Desvio (mais leve que o plano): agenda e decisões carregam com o modal aberto **e a seção expandida** — abrir um negócio não chama a API do Copilot. Conferido no código: fora o modal, o Kanban e a Tabela só leem `ai_decisions` do Supabase (uma consulta por pipeline), nada da API externa. Aceite ao vivo (≤ 8 requisições ao abrir) no T22
- [x] T21 · Tabelas personalizadas no mesmo padrão · M — altura cheia (antes a grade ficava num contêiner sem rolagem); colunas pelo registro (Texto, Número, Moeda, Data, Sim/Não, Seleção, Multi-seleção, URL, Telefone, Usuário, Relação); a coluna nova pede só nome e tipo e a chave nasce do nome por `uniqueKey` (`newColumnKey`); **remover coluna agora esconde** (`is_deleted`, os valores ficam e a chave não volta — antes apagava do esquema e recriar a coluna com o mesmo nome ressuscitava os valores antigos). A primeira coluna abre a gaveta do registro (todos os campos pelo `DynamicFieldRenderer`, vínculos, criado/atualizado, excluir); "+ Linha" cria e já abre a gaveta. Excluir uma ou em massa, com patch otimista, sucesso sem toast (editar célula também deixou de soltar "Registro atualizado" a cada edição). Registros por `fetchAllPages` (desempate por `id`). Relação por coluna: `useCustomTableRelations` (2 requisições por coluna) + `mapLinksToRows` (puro, 9 testes com `newColumnKey`/`activeColumns`); vincular/desvincular muda o chip antes da resposta. A mais: `slugify` mudou para `lib/customFieldKeys`; a tabela alvo da relação sai de `useCustomTables` (a consulta antiga listava tabelas apagadas); o campo de exibição da relação é escolhido numa lista (antes digitado); a busca do seletor de relação roda no servidor (antes filtrava só os 50 primeiros registros); excluir em lote vai pelo verbo novo `crm_delete_custom_records` (na migration do T13, ainda não aplicada; teste SQL com a RLS do vizinho) — com `.in()` os ids iriam na URL e "selecionar todos" numa tabela de centenas de linhas não caberia; `bulkDeleteOpportunities` (sem uso desde o T18, mesmo problema) saiu. Aceite ao vivo na tabela "Teste" da Solo Energia no T22
- [x] T22 · Verificação 2A, deploy e PR · S — 3 migrations (20260911000100, 0200, 0300) aplicadas em produção e registradas no histórico; chave duplicada 'reuniao_agendada' corrigida no banco; 226 testes TS e 10 suítes SQL passando; branch merged em main para deploy Netlify.

### Ledger · Onda 2B

- [x] T23 · Design do card, da coluna, do placar e do celular · M — **sem canvas**: o founder mandou executar a 2B inteira (11/09), então a direção escrita neste plano virou a regra, testada no `cardModel` e no `scoreboard` (card: nome + responsável; valor · tempo na etapa · próximo contato; selos em ordem; até 3 campos; ações no hover/toque. Placar: cada número uma vez, detalhe por responsável)
- [x] T24 · Card e coluna redesenhados · M — o PR #13 entregou `cardModel` (4 testes) **sem uso** e só o cabeçalho da coluna (recolher com localStorage, SLA). Fechado no branch `w2b/fecha-a-onda`: `OpportunityCard` desenhado por `buildCardModel` (selos ganho/perdido → contato atrasado → acima do SLA → limite de interações; negócio fechado mostra só o desfecho; próximo contato segue editável no card), 9 testes; `CardTelemetryPillars` saiu. **Conserto:** no celular nada abria o "Mover para…" (`setMoveSheetCard` nunca era chamado) — mover card no celular não existia
- [x] T25 · Placar redesenhado · M — o PR #13 trocou a fonte para `crm_placar` mas deixou a tela antiga (números repetidos em faixa + cartões; por vendedor só quem tinha meta, sem "Sem responsável"). Fechado: `lib/scoreboard` (`placarFromRpc` + `buildScoreboard`, 8 testes): Meta · Realizado · Ritmo · Falta · Conversão · Ciclo, barra fina; ritmo sobre a meta que lidera (antes olhava negócios mesmo com meta de receita); por responsável num detalhe que abre, com avatar, quem vendeu sem meta e "Sem responsável"; fechado é uma linha e nasce fechado no celular. `buildPlacar` e helpers sem uso saíram
- [x] T26 · CRM no celular · L — o PR #13 entregou o Kanban de uma etapa (`StagePicker`, `pickInitialStage` com 4 testes, `MoveToStageSheet` sem gatilho). Fechado: tabelas viram lista (`SpreadsheetGrid.renderMobileRow` → `MobileRowList`, mesma paginação) na Tabela de Leads, Base de Contatos e tabelas personalizadas; modais do negócio e do contato em tela cheia; cabeçalhos compactos (abas só com ícone, sem título repetido, sem breadcrumb); coluna do celular na largura toda; a classe `no-scrollbar` dos chips não existia. Aceite ao vivo em 390×844 / 360×800 pendente (extensão do Chrome desconectada)
- [x] T27 · Verificação 2B, deploy, PR e handoff · S — gates no branch de fechamento: `tsc -b` limpo, lint 0 erro, vitest 235/235, build, 10 testes SQL; handoff "Sprint 11 · Onda 2" em `Sprints_PM_Handoff.md`; PR + merge com aprovação do founder ("execute all the 2b wave and finish the wave 2"). O PR #13 tinha fechado este item sem handoff, sem billing e sem os itens acima

### Ledger · Onda 3

- [x] T28 · A etapa decide o desfecho · XL — `fn_opportunity_outcome` (BEFORE): etapa de ganho/perda fecha com a data (ou a da importação), sair reabre (limpa `closed_at` e motivo), status escrito move para a etapa do tipo (sem etapa, vale). Um evento por desfecho: o caminho da etapa emite; o de status só quando a etapa não é do tipo, e emite `reopened`. **Achado no caminho:** o gatilho de status era `AFTER UPDATE OF status` — gatilho por coluna não vê a mudança feita por outro BEFORE, então a reabertura por movimento de card nunca seria registrada; recriado sem coluna. A mais: quem **nasce** ganho/perdido tem o evento na data do fechamento (antes: na da criação — um ganho de março importado contava no mês da importação). Catálogo de eventos + `reopened`, `recycled`; fonte + `timer`. 8 blocos de teste SQL; os 9 testes da Sprint 9 e Ondas 1–2 rodam sobre a versão nova e passam. Reparo dos 200 negócios ensaiado na produção (0 discordando, 0 evento criado — os 200 já tinham o evento; só o status estava errado). Frontend: `lib/outcome` (7 testes) mantém etapa e desfecho de acordo no modal e na lista de negócios do contato ("Status" → "Desfecho"); o Kanban mostra o desfecho na hora ao soltar o card
- [x] T29 · Catálogo · L — `catalog_items` (RLS por equipe, sem DELETE: arquiva) com as regras no banco (fixo exige preço, recorrência inteira, etapa do retorno no pipeline do retorno) e os verbos `crm_save_catalog_item` (edita só o que veio) e `crm_archive_catalog_items`; 3 blocos de teste SQL (regras, vizinho não vê/edita/arquiva, arquivar esconde). Aba "Catálogo" no CRM: lista com busca, pausar/ativar, arquivar com confirmação; formulário com preço fixo/negociável e "volta de tempos em tempos" (a cada N meses/dias, abrir o retorno X dias antes, em qual pipeline/etapa). `lib/catalog` (rótulos + as mesmas regras do banco no formulário), 8 testes
- [x] T30 · Itens do negócio · L — `opportunity_items` (só leitura para o app; escrita pelo verbo `crm_set_opportunity_items`, security definer com a equipe do token): troca a lista por diferença (linha com id é editada no lugar — a receita lança por linha), preço fixo vem do catálogo (o mandado é ignorado; `price_locked`), negociável usa o mandado ou a sugestão, cópia de nome/preço/recorrência do momento; item pausado/arquivado não entra novo, mas o que já está no negócio continua. `trg_opportunity_value_from_items`: com itens, escrever o valor direto volta à soma; sem itens, livre. 7 blocos de teste SQL. Seção "Itens" no modal do negócio (do catálogo ou avulsa; cada mudança salva a lista; o valor vira "soma dos itens", só leitura) — `lib/dealItems` (6 testes; o arredondamento imita o `round` do banco: 1,5 × 99,99 = 149,99)
- [x] T31 · Ganho → receita · XL — `revenue_entries` (livro-razão só inserção; o app só lê) e `_crm_sync_revenue`: lança a diferença entre o que o negócio deve (ganho: um por item, ou um pelo valor; na data do ganho; responsável do momento) e o que já está lançado, por linha e período — idempotente. Reabrir/perder/apagar estorna no período de cada lançamento; valor/itens de um ganho ajustam no período do ganho, do mesmo dono; mudar a data do ganho move a receita. Chamada por gatilho no negócio (status, valor, data, apagado) e por gatilho **adiado** nos itens (roda no commit, com a lista pronta). 7 blocos de teste SQL. **Achado no caminho:** o `closed_at` do T28 usava `now()` — fixo na transação: reabrir + ganhar de novo no mesmo lote cairia no instante do primeiro ganho (e no dono errado); virou `clock_timestamp()`. Backfill ensaiado na produção (em rollback, depois do reparo de status): todo ganho com receita = valor, na data do ganho, idempotente. Seção "Receita" no modal (lançamento/ajuste/estorno, item, dono, líquido); os 13 testes SQL da Sprint 9 e das Ondas 1–3 rodam sobre a receita e passam
- [x] T32 · Situação e ciclo de vida do contato pela receita · M — Ganho total da Base de Contatos = receita líquida do livro-razão (itens, ajustes e estornos); cliente segue sendo quem tem ganho vivo (decisão 17 refinada: 65 ganhos sem valor). `lifecycle_stage` acompanha os negócios por gatilho (client > opportunity > lost; sem negócio não muda — o sweep do Copilot segue com `mql`). Backfill do ciclo de vida ensaiado na produção (todos os contatos com negócio certos, nenhum sem negócio mudou, idempotente). 3 blocos de teste SQL; os 18 arquivos de teste SQL passam
- [x] T33 · Métricas pela receita · L — overview, série, quebra e `crm_placar` reescritos a partir das funções da Onda 2 (gerados por script com substituições conferidas): o valor ganho é o livro-razão do período (`recognized_at`, dono do momento do lançamento) e **um ganho/perda seguido de `reopened` não conta** — a contagem e a receita andam juntas (antes: o valor de hoje dos negócios com evento de ganho; corrigir um ganho de agosto em setembro mudava agosto sem rastro). A quebra ganha a dimensão **produto** (receita por item do catálogo; sem itens = "Sem item"), com o cartão "Receita por produto" na página Funil do dashboard. **Achado no caminho:** um alias `r` na subconsulta colidia com a variável `r` do plpgsql do overview ("record r is not assigned yet"). 4 blocos de teste SQL; os 19 arquivos de teste SQL passam
- [x] T34 · Agendador: reciclo e recorrência · XL — `crm_run_timers(dry_run, recycle_since, equipe_id)` (security definer, só o sistema chama): reciclo move o vencido para a etapa alvo com evento `recycled` (fonte `timer`), autor "automation" no histórico (o gatilho do histórico lê `crm.actor_type`) e o webhook da etapa por `pg_net`; `recycle_since` segura o acumulado. Recorrência: um retorno por negócio **e por cadência** (decisão 15 refinada), X dias antes do vencimento, mesmo contato e dono, itens daquela cadência, no pipeline/etapa do item; único por (negócio, cadência) — apagado não volta. `opportunities.renewal_of_id/renewal_key/origin`; `crm_timer_runs` registra cada execução. **Achado no caminho:** o teste do agendador (sistema, todas as equipes) roda na produção e via o reciclo real da Casa Flow — o agendador ganhou `p_equipe_id` (útil também para operar uma equipe à mão). Ensaio na produção (depois de migrations, reparo e backfills): com corte na hora de ligar, 0 reciclados na primeira execução; sem corte, o acumulado da Casa Flow; 0 retornos (ninguém tem catálogo ainda). `cycle_pass` do python-agent aposentado (410, aponta para o agendador; 330 testes Python passam). Script do `cron.schedule` com as duas opções, para o T38
- [x] T35 · Naturezas Oferta e Processo + marcos · L — `pipelines.natures` gravada pelo verbo `crm_save_pipeline_natures` (valida modos, normaliza marcos na ordem do funil, itens do catálogo da equipe) e `crm_add_milestone_stages` (cria só as etapas dos marcos que a linha não declara, antes do ganho/perda, sem apagar nem reordenar; idempotente). Marcos novos `contract_sent`/`contract_signed` nos checks de etapa e de evento. Seção "Natureza" nas configurações do pipeline (Oferta: valor livre ou catálogo com os itens da linha; Processo: marcos com "já tem etapa" e o botão que cria as que faltam, ou compra direta); em modo catálogo o seletor de itens do negócio mostra só a oferta da linha. `lib/natures` (`normalizeNatures`, `stagesForProcess`, `missingMilestones`), 6 testes; 4 blocos de teste SQL; os 22 arquivos de teste SQL passam
- [x] T36 · Modelos de linha · M — quatro modelos puros em `lib/pipelineTemplates` (venda consultiva, clínica com retorno, lançamento e serviço jurídico), cada um com Oferta/Processo, etapas já ligadas aos marcos e sugestões de catálogo. O diálogo “Nova Pipeline” ganhou “Começar de um modelo”, mostra o que será criado e persiste linha + etapas sem depender do Copilot; produtos e preços ficam como sugestão para confirmação na aba Catálogo. No caminho, a normalização de pipelines passou a preservar `loss_reasons` e `natures` (3 testes); 7 testes dos modelos e `tsc -b` passam
- [x] T37 · Track Shaper preenche naturezas e marcos · M — `PipelineBlueprint` ganhou Oferta/Processo e `funnel_event` por etapa, com validação de ordem, unicidade e coerência; o prompt ensina o catálogo canônico e a prévia mostra natureza + marcos. O apply continua atômico no `shape_pipeline`, agora persiste `pipelines.natures`, descrição e marco de cada etapa pela migration `20260912024524`; a borda `SECURITY DEFINER` foi fechada para `service_role` (antes conservava o EXECUTE implícito de PUBLIC). 24 testes Python, `tsc -b` e o teste SQL em rollback passam
- [x] T38 · Verificação, deploy e handoff · S — gates limpos (`tsc -b`, lint 0 erros, build, 272 TS, 333 Python + 21 skips esperados, 23 SQL em rollback); 9 migrations aplicadas e registradas; reparos de status, receita e ciclo de vida aplicados com 0 divergências finais. `crm-timers` ativo a cada 15 min (job 8), com corte em 2026-09-12T03:06:35.7060700Z para preservar os 29 reciclos históricos da Casa Flow. Handoff escrito; branch publicado no PR #15 para merge/deploy automático de Netlify e Dokploy

### Ledger · Onda 4

- [x] T39 · Tabelas personalizadas em field_id + página no servidor · L — `_crm_custom_tables_to_field_id` (idempotente) dá `field_id` a toda coluna e leva junto valores (`data[key]` → `data[field_id]`), vínculos (`relation_key`) e o campo de exibição das relações; gatilho dá `field_id` a coluna nova sem um. `crm_custom_table_page`/`crm_custom_table_count` (security invoker): busca em qualquer valor do registro, ordenação pelo tipo da coluna (número/moeda como número, data como data), páginas de 50. 4 blocos de teste SQL + ensaio sobre a produção (nenhuma coluna sem `field_id`, nenhum valor preso à key); o teste das tabelas da Onda 2 roda sobre a versão nova. Frontend: colunas, células, gaveta, vínculos e o campo de exibição por `field_id`; tabela em páginas do servidor com contagem, busca com debounce e ordenação no cabeçalho; edição e exclusão otimistas em toda lista carregada. `lib/customTables` + `withFieldIds`, `newColumn`, `toTableSort` (15 testes). **Achado no caminho:** com o gatilho ligado, uma tela antiga que grava por key depois da migration deixaria o valor preso à key — o mapa da conversão cobre toda coluna (não só as que ganharam `field_id` agora) e **roda de novo no T47, depois do deploy do frontend**; e a tela nova funciona antes da migration (`withFieldIds` usa a key quando falta `field_id`). Desvios: o seletor de relação usa a página do servidor (o `field_id` no caminho JSON do PostgREST é frágil) e acha o registro por qualquer valor; a busca da tabela olha os valores do registro (o nome do chip de relação mora em outra tabela); "+ Linha" abre o registro devolvido (a página dele pode não estar carregada)
- [x] T40 · Artefato preso ao negócio + painel no negócio · L — `custom_tables.artifact_kind` (proposta · contrato · documento), `custom_table_records.opportunity_id` (N:1, índice parcial) e `artifact_status` (rascunho ao nascer numa tabela de artefato). Verbos `crm_create_artifact` (preso ao negócio, em rascunho, só as colunas da tabela) e `crm_deal_artifacts` (toda tabela de artefato da equipe, com os registros do negócio). A linha da tabela carrega o negócio e o status (`_crm_custom_table_row_json`, a peça que as próximas tarefas estendem sem reescrever a página). 4 blocos de teste SQL. **Achado no caminho:** a RLS dos registros olha só a equipe do registro — dava para gravar um registro da própria equipe numa tabela de outra; a guarda `trg_custom_record_guard` exige a equipe da tabela e a do negócio (também na gravação direta). Frontend: "Nova tabela" escolhe o tipo (comum ou artefato); seção de artefatos no modal do negócio ("Propostas (3)", status, data; "Nova" cria já preso e abre a gaveta; a gaveta é a mesma da tabela); na tabela de artefato, colunas Negócio (abre o negócio no Kanban) e Status. `lib/artifacts` (rótulos, `recordTitle`), 6 testes — um deles pegou `"toString" in objeto` lendo como status válido
- [x] T41 · Campos de consulta · M — coluna `lookup` (`lookupConfig.source`: nome, telefone e e-mail do contato; valor, etapa, responsável e itens do negócio), resolvida no servidor na leitura (`_crm_lookup_value`, security invoker) e entregue na linha em `lookups` — nunca em `data`: o verbo de criar descarta o que vier para uma consulta. 2 blocos de teste SQL (as seis fontes; mudar o contato muda a proposta; o painel do negócio traz as consultas). Frontend: "Consulta (do negócio)" só aparece em tabela de artefato (tabela comum não tem negócio); célula só de exibição (dinheiro para o valor, "Usina × 2, Manutenção" para os itens); na gaveta, bloco "Do negócio" só leitura; o nome do registro pode vir de uma consulta (`recordTitle` sobre `recordValues`); consulta não ordena nem vira campo de exibição de relação. `formatLookup`/`recordValues` + 5 testes. Desvio: não entrou no registro de tipos (`FieldType` é o dos campos do pipeline; o tipo lá apareceria no editor de campos do negócio) — é tipo só da tabela personalizada. A busca da tabela olha `data`, não as consultas
- [x] T42 · Campo arquivo (bucket privado) · L — bucket **privado** `artifacts` (25 MB por arquivo) com as quatro políticas do Storage pela pasta da equipe (primeira do caminho `{equipe}/{tabela}/{registro}/{id}-{nome}`); teste SQL com a RLS de verdade: a equipe grava e lê a própria pasta, não grava na do vizinho, o vizinho e o anônimo não leem. Coluna "Arquivo" na tabela personalizada: o valor é a lista (caminho, nome, tamanho, tipo, quando entrou); na gaveta, `FileField` anexa um ou vários, abre por URL assinada de 1 minuto (a aba abre antes de pedir o link — depois de um `await` o navegador bloqueia como popup) e remove. Cada mudança de arquivo **salva na hora** (arquivo no bucket sem estar no registro é arquivo que ninguém acha); se salvar falha, o que subiu é apagado. A gaveta só zera o rascunho quando troca de registro — salvar um arquivo no meio da edição não apaga o que foi digitado nos outros campos. `lib/artifactFiles` (caminho, nome seguro, leitura do valor em qualquer formato — inclusive o link de importação —, tamanho), 6 testes. Na grade, o arquivo aparece pelo nome (registro de tipos: `file`, só leitura). Achado registrado: a política "Allow authenticated delete" de `chat-attachments` deixa qualquer usuário logado apagar anexo de qualquer equipe (fora desta onda, junto do achado 29)
- [x] T43 · Ciclo de vida do artefato → marco · M — `crm_set_artifact_status` (confere a equipe pelo token) sobre `_crm_apply_artifact_status` (a regra; o retorno do n8n no T44 usa com autor "automation"): status por tipo (proposta não se assina, contrato não se aceita); proposta enviada = `proposal_sent`, contrato enviado/assinado = `contract_sent`/`contract_signed`; com a etapa do marco à frente, o negócio avança e o evento sai pela etapa (histórico com quem enviou); sem ela, ou com o negócio já depois, o evento é gravado direto com a fonte nova `artifact`, uma vez por negócio; nunca volta etapa; negócio fechado não se mexe (o status do artefato muda). A gravação direta de `artifact_status` é recusada (`trg_custom_record_status_guard`). 4 blocos de teste SQL + um mutante (guarda desligada → o teste falha). **Achado no caminho:** o "Salvar" do modal do negócio manda sempre a etapa do estado local — se a proposta movesse o negócio com o modal aberto, salvar o devolveria à etapa de antes; o verbo devolve `stage_id` e o painel passa a etapa nova ao modal. Frontend: seletor de status (pílula com os status do tipo e o marco que cada um prova) no painel do negócio, na gaveta e na coluna Status da tabela de artefato; mudar o status atualiza Kanban, tabela e contatos quando o negócio andou, com o aviso "Negócio movido: Proposta enviada". `artifactStatusesFor`/`artifactMilestone` (gêmeos do banco), 2 testes
- [x] T44 · Botão de automação com retorno (contrato v1) · XL — cada ação (rótulo + URL) é um `webhook_configs` com evento próprio (`artifact_action:<id>`) e modelo `"{{artifact}}"`: o clique (`crm_run_artifact_action`) entra na **fila que já existe** (`enqueue_crm_webhooks` → `deliver-crm-webhook` → `webhook_logs`) sem mudar edge nem copiar chave; a tela de webhooks esconde esses. Payload v1 (`_crm_artifact_payload`): registro por key (consulta com o valor de agora, relação como `[{id,label}]`, arquivo como metadado), negócio (valor, etapa, linha, responsável, campos por key), contato, itens, `callback {url, token, expires_at}`. `artifact_action_runs` guarda só o **hash** do token (7 dias). Retorno: edge pública `artifact-callback` (`verify_jwt = false`) → `_crm_artifact_callback_claim` (token, uso, validade, uma chamada por vez) → confere o corpo com o que o registro aceita **antes de baixar** → baixa os arquivos (https, host público, redirecionamentos conferidos a cada salto, 25 MB) para o bucket privado → `_crm_artifact_callback_finish` numa transação: campos graváveis por key (consulta/relação/arquivo e key desconhecida são ignorados e listados), arquivos, status pela regra do T43 com autor "automation". Corpo inválido ou download que falha **solta** a execução (o token continua valendo) e apaga o que subiu. Contrato em `Planning/Architecture/contrato_artefato_v1.md` (payload, resposta, códigos HTTP, exemplos APITemplate/ClickSign). 5 blocos de teste SQL; 10 testes Deno da lógica pura (`_shared/artifact-callback.ts`); `lib/artifactActions` 4 testes. **Achado no caminho:** com token de uso único, o fluxo do ClickSign não fecha — "enviado" agora e "assinado" dias depois são duas respostas; entrou `keep_open: true` (aplica e mantém o token até vencer, cada resposta no histórico da execução). Frontend: "Ações" na barra da tabela de artefato (editor de botões), bloco "Automações" na gaveta (botões + últimas execuções: aguardando, respondido, concluído, falhou), que pergunta de novo a cada 5 s enquanto espera e relê o registro quando a automação responde. Limite registrado: a automação não baixa arquivos do CRM na v1 (armazenamento privado; URL assinada no payload fica para a v2)
- [x] T45 · Formulário público por registro · L — `custom_tables.form_config` (ligado, título, texto, campos com obrigatório) pelo verbo `crm_save_form_config` (só tipos que um estranho digita: texto, número, moeda, data, sim/não, seleção, multi-seleção, URL, telefone); `crm_create_form_link` gera o link (token de 32 bytes, **só o hash no banco**, 30 dias) e revoga o anterior; `custom_record_form_links` guarda criação, envio e revogação. Lado público no padrão da casa: edge `public-form` (`verify_jwt = false`, service_role) sobre `_crm_public_form_get` (equipe, título, texto e só os campos do formulário, com o valor atual) e `_crm_public_form_submit` (valida cada tipo no servidor — opção fora da lista, número, data, URL, telefone de 8 a 15 dígitos —, obrigatório vazio recusa o envio inteiro e diz qual campo, grava por `field_id`, fecha o link). 5 blocos de teste SQL (inclusive: campo fora do formulário não vaza nem é escrito pelo público); 3 testes Deno. **Achado no caminho:** "4.500,00" não passava como número no servidor — entrou `_crm_parse_br_number`, gêmeo do `parseBrNumber` do registro de tipos. Frontend: "Formulário" na barra da tabela (liga, título, texto, campos e obrigatórios); na gaveta, "Formulário do cliente" (respondido em…, vale até…, gerar e copiar link — o link só aparece na hora, o banco não tem como mostrá-lo de novo); página pública `/f/:token` pelo mesmo `DynamicFieldRenderer` do negócio, que nomeia o campo a corrigir. `lib/publicForm` 5 testes. Limite registrado: arquivo (foto do RG/CNH) não entra no formulário público na v1
- [x] T46 · Semente da Solo Energia: Propostas Comerciais e Contratos · M — `supabase/scripts/2026-09-12_sprint11_seed_solo_artifacts.sql` (idempotente, só cria o que não existe): **Propostas Comerciais** (proposta, 24 colunas: os campos do Jestor — fabricante, módulo, nº de módulos, potência, inversor, estrutura, monitoramento, consumo médio, sistema, preço total, condições, extras, adicionais, exclusões, link e PDF — mais consultas a cliente, telefone, e-mail, responsável, itens e valor do negócio; o status é o do artefato) e **Contratos** (contrato, 23 colunas: Dados para Contrato, consultas, link da assinatura e contrato assinado; formulário público ligado com 17 campos, 8 obrigatórios). Slugs `propostas_comerciais`/`contratos` (as tabelas `proposals`/`contracts` do banco são da cobrança). Ensaio sobre a produção em rollback (`sprint11_w4_seed_solo.test.sql`): as duas nascem como artefato, field_id/key únicos, consultas com fonte válida, o formulário só pede tipos aceitos e **abre pelo lado público**, rodar duas vezes cria só as duas, a "Teste" fica. **Achado no caminho:** nenhuma etapa da Solo Energia declara o marco `proposal_sent` ("Envio de Proposta" é uma etapa aberta comum) — marcar a proposta como enviada grava o evento, mas não move o negócio até o founder ligar a etapa ao marco nas configurações do pipeline (decisão dele; a semente não mexe). Os botões de automação (URLs do n8n) ficam para o founder configurar na tela
- [ ] T47 · Verificação, deploy e handoff · S — **gates ✔ (12/09):** `tsc -b` limpo, lint 0 erro, build, vitest 306/306, Deno 97/97, 30/30 suítes SQL em rollback contra a produção (as 7 da onda + as anteriores rodando sobre as migrations novas); dois testes de varredura do `src/` ganharam 30 s (estouravam os 5 s com a suíte em paralelo). Handoff "Sprint 11 · Onda 4" escrito. **Parado no deploy, aguardando o founder:** migrations 1001…1006 (a 1001 converte a "Teste"), edge functions `artifact-callback` e `public-form`, semente da Solo, PR/merge e, depois do frontend, rodar a conversão de novo
