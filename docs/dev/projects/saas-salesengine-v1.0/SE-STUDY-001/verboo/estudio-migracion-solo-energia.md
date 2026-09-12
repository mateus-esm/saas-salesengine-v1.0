# Estudo — Migração Solo Energia (Jestor → SaaS Sales Engine)

> **Projeto:** Sales Engine (Solo Ventures) · **Estudo:** SE-STUDY-001
> **Data:** 2026-09-10 · **Branch:** `verboo/study/migration-solo-energia`
> **Fonte de evidência:** `evidence-data.md` (coleta real em produção via MCP read-only, 2026-09-10) + código do repositório (migrations, webhooks, frontend, python-agent) + `Planning/Sprints/sprint_10_migration_solo_energia.md` + `Planning/Benchmark/Jestor/Jestor.md`
> **Escopo:** somente leitura. Nenhum arquivo de código foi alterado.

---

## 1. Sumário executivo

A migração do Sprint 10 **foi bem-sucedida nos números que ela se propôs a garantir**: 1.251 leads e 1.260 oportunidades importados, 0 oportunidades sem etapa, distribuição por etapa batendo 1:1 com o export do Jestor, backup completo (468 leads · 56 oportunidades · 9.340 mensagens) e dedup por telefone + nome preservando pessoas distintas. As asserções SQL da migração passaram.

Porém, a base migrada carrega **dívidas de qualidade que precisam de sprint própria**:

| Dívida | Magnitude | Causa raiz |
| :--- | :--- | :--- |
| `opportunities.value` NULL | 798 de 1.262 (63%) + 1 com valor 0 | Export do Jestor sem `Valor da Oportunidade` na maioria das linhas (etapas Reciclo/Desqualificado) |
| Responsável só em `custom_data.responsavel_jestor` | 575 NULL · 390 "Mateus Sombra" · 224 luizhenriqueteixeira@hotmail.com · 65 fgmssolar@gmail.com · 8 estevamdequadros@gmail.com | `opportunities` não tem coluna de dono; migração preservou o texto cru |
| `lifecycle_stage` = `raw` | 1.251 de 1.251 | Coluna nova (Sprint 6.7) com DEFAULT `raw`; migração não fez backfill |
| `creation_source` = `import` | 1.251 de 1.251 | Correto (é o que a migração deve marcar) |
| Contatos sem telefone | 50 | UNIQUE parcial `(equipe_id, phone_normalized)` — telefones compartilhados foram rebaixados (telefone movido para `observations`) |
| `contact_type` | opportunity 1.177 · lead 74 | Correto pela regra do script (tem oportunidade → `opportunity`) |
| Telefone cru não normalizado | ex.: `(85) 99262-5840` | `phone_normalized` é canônico para dedup, mas a coluna `phone` guarda o formato cru do export |

Fora da migração, o estudo mapeia **quatro frentes de produto** que hoje estão vazias ou quebradas e travam o uso real da Solo Energia no software:

1. **Modelo relacional** — `companies`/`properties`/links existem no schema mas estão praticamente vazios (companies 1, properties 1, contact_company_links 0, opportunity_links 0); `custom_tables` tem 2 tabelas e 1 registro, sem sistema de relações (o benchmark Jestor mostra o alvo: Connected Records N:1, N:M bidirecional, Lookup, Roll-Up, User Attribution).
2. **Taxonomia de origem** — 13 valores crus de `source`/`origem` mapeados para 8 das 12 categorias do CHECK; a tabela `origin_taxonomy` está **vazia** (o editor de UI existe, nada foi semeado).
3. **Responsáveis/usuários** — `leads.responsible_id` NULL nos 1.251; `opportunities` não tem coluna de dono; o `responsavel_jestor` do Jestor (texto livre) nunca foi vinculado a `profiles`.
4. **Ingestão e Copilot** — cada mensagem inbound duplica contato em certas condições; o roteamento cria oportunidade antes de classificar (SPAM nunca é aplicado); o Copilot roda só via sync manual (cron e trigger reativos **comentados**), `ai_decisions` = 0, e `create_task` quebra com 23514 (`tasks_status_check`).

A tabela priorizada (P0/P1/P2) está na **Seção 10**.

---

## 2. Veredito da migração (Q1)

### 2.1 O que foi garantido (evidência)

| Métrica | Planejado | Real (evidência) | Status |
| :--- | ---: | ---: | :--- |
| Leads importados | 1.251 | 1.251 | ✅ |
| Oportunidades importadas | 1.260 | 1.260 (1.262 na contagem de produção, 2 a mais = pós-migração) | ✅ |
| Oportunidades sem etapa | 0 | 0 | ✅ |
| Backup antes do purge | — | 468 leads · 56 oportunidades · 9.340 mensagens | ✅ |
| Dedup por telefone + nome parecido | — | 38 pessoas preservadas (grupos ambíguos mantidos separados) | ✅ |
| Distribuição por etapa bate com Jestor | — | Reciclo 514 · Desqualificado 402 · Ganho 137 · Perdido 101 · Qualificação 31 · Contato Inicial 27 · Agendamento 22 · Envio Proposta 12 · Negociação 12 · Reunião 1 = **1.260** | ✅ |
| Asserções SQL (contagem leads/opps, stage NULL) | — | Passaram (a migration falha em vez de deixar meia base) | ✅ |

Evidência de código:
- `scripts/migrate_solo_energia.py` gera SQL revisável com `begin/commit`, guarda de "base não vazia" (`ABORT: base da Solo Energia nao esta vazia`) e bloco de asserções (`assert v = 1.251` / `assert v = 1.260` / `assert v = 0` para stage NULL).
- `supabase/migrations/20260909000400_sprint10_backup_purge_solo_energia.sql` faz backup via `CREATE TABLE AS` antes do purge, aborta se o backup vier vazio com base populada, e apaga na ordem certa (opportunities antes de leads, FK RESTRICT).
- `Planning/Sprints/sprint_10_migration_solo_energia.md` registra a execução: `backup 468/56/9.340 · importado 1.251/1.260 · 0 sem etapa · telefone 1.173 com phone_normalized`.

### 2.2 O que ficou quebrado / com dívida

**a) 798 oportunidades com `value` NULL (63%) + 1 com valor 0.**
O script faz `num(o.get("Valor da Oportunidade"))` e grava `null` quando a célula está vazia ou não-parseável (`scripts/migrate_solo_energia.py:141-153, 350, 432`). A maioria das linhas de Reciclo/Desqualificado não tem valor no Jestor. **Impacto:** ticket médio, funil de receita e forecast ficam cegos para 63% do funil. **Correção:** backfill a partir de `custom_data`/observações quando existir; para as demais, decidir política (não inventar valor; ou usar valor médio por etapa como estimativa explícita).

**b) `responsavel_jestor` só em `custom_data` (texto livre).**
A migração gravou `custom_data.responsavel_jestor = clean(o.get("Responsável"))` (`migrate_solo_energia.py:342`). Não há FK, não há coluna de dono em `opportunities`. Distribuição real: 575 NULL, 390 "Mateus Sombra", 224 `luizhenriqueteixeira@hotmail.com`, 65 `fgmssolar@gmail.com`, 8 `estevamdequadros@gmail.com`. **Impacto:** não dá para filtrar por vendedor, medir produtividade ou rotear. **Correção:** ver Seção 5 (Q4).

**c) `lifecycle_stage` = `raw` nos 1.251.**
A coluna nasceu no Sprint 6.7 com `DEFAULT 'raw'` (`20260621000000_sprint67_lifecycle_stage.sql`) e a migração não a tocou. **Impacto:** o funil "Predictable Revenue" invisível não tem nenhum lead avançado; qualquer dashboard de lifecycle mostra 100% raw. **Correção:** backfill por `opportunities.status` (won→`client`, lost→`lost`, open→`opportunity`; sem oportunidade→`mql`/`sql` conforme interação).

**d) 50 contatos sem telefone (UNIQUE).**
O UNIQUE parcial `(equipe_id, phone_normalized)` só admite um dono por número. O script rebaixa os demais: `phone` e `phone_normalized` zerados, número cru preservado em `observations` (`migrate_solo_energia.py:393-403`). **Impacto:** 50 contatos não recebem WhatsApp e não são encontráveis por telefone. **Correção:** revisar os grupos ambíguos (relatório da migração lista os nomes) e fundir no app quando forem a mesma pessoa; para os que realmente compartilham número (família/empresa), manter separados e documentar.

**e) `source` = `origem` = `origin_detail` para a maioria.**
O script grava `source`/`origem` = rótulo cru (`canal or 'Jestor'`) e `origin_category` pela tabela `ORIGIN_CATEGORY` (`migrate_solo_energia.py:412-414`). Ex.: Cake's Day tem `source=origem=origin_detail="Mensagem Whatsapp"`, `origin_category=outbound_message`. **Impacto:** seis colunas respondendo "de onde veio" (ver Q3). **Correção:** adotar `origin_category` + `origin_detail` como canônicos (decisão já escrita no Sprint 9, `20260830000500_sprint9_canonical_channel.sql`) e parar de escrever `source`/`origem` em código novo.

**f) Telefone cru não normalizado em alguns registros.**
Ex.: George Almeida `"(85) 99262-5840"` (não normalizado), Raphael Sampaio `"+5585999819722"`, Rosiane Cunha `"85998212918"` (10 dígitos sem 55). O trigger `trg_leads_sync_phone_normalized` recalcula `phone_normalized` no INSERT, mas a coluna `phone` (usada para exibição e envio) guarda o formato cru. **Impacto:** envio de WhatsApp sem DDI 55 é aceito pela API e a mensagem some (runbook do próprio script). **Correção:** normalizar `phone` na escrita (ou migration de backfill) mantendo `phone_normalized` em sincronia.

**g) Números placeholder.**
`5511911112222` carrega 5 pessoas (Igor, Hilda, Guilherme, Fabiane, Carlos); `5585999138804` carrega 18 nomes distintos. São placeholders de teste do Jestor, não telefones reais. **Impacto:** envio em massa atingiria números errados. **Correção:** marcar como placeholder (flag ou `observations`) e excluir de campanhas.

### 2.3 Veredito

**Migração bem-sucedida** para o contrato do Sprint 10 (importar 1.251/1.260 sem duplicar e rotear nas fases certas). **Não é "pronta para operação real"** sem as correções de valor, responsável, lifecycle e telefone acima — que são exatamente o que a visão do produto ("começar a usar de verdade todos os dias") exige.

---

## 3. Modelo relacional (Q2)

> Detalhamento completo em `modelo-relacional.md`.

### 3.1 Estado atual (evidência)

| Tabela | Linhas SE | Observação |
| :--- | ---: | :--- |
| `custom_tables` | 2 | Schema existe (Sprint 5.3), sem UI de builder |
| `custom_table_records` | 1 | — |
| `companies` | 1 | Schema existe (Sprint 4 EPIC 1) |
| `properties` | 1 | Schema existe |
| `contact_company_links` | 0 | — |
| `property_owner_links` | 1 | — |
| `opportunity_links` | 0 | — |
| `custom_table_links` | (schema) | N:M genérico com `relation_key` e UNIQUE de aresta |
| `origin_taxonomy` | 0 | Editor de UI existe, nada semeado |

O schema relacional **já existe** (`20260422000000_sprint4_epic1_foundations.sql`): `companies`, `properties`, `contact_company_links` (N:M com `role` e `is_primary`), `property_owner_links` (polimórfico contact/company), `opportunity_links` (company/property/contact com `relation`). O que falta é **população e UI**, não schema.

### 3.2 Benchmark Jestor (alvo)

`Planning/Benchmark/Jestor/Jestor.md` §2:
- **Connected Records (N:1)** — selecionar um registro de outra tabela.
- **N:M bidirecional** — relação sincroniza nos dois sentidos.
- **Lookup Fields** — puxar valor de um registro conectado (read-only).
- **Roll-Up Fields** — agregar valores de registros conectados (Sum, Count, Average, Min, Max).
- **User Attribution** — auto-atribuir registro a um usuário.
- **Multiple Users** — campo de seleção multi-valor de usuários.

### 3.3 Proposta de implementação

1. **Núcleo (companies/properties):** popular a partir da migração. O export do Jestor tem coluna `Propriedade` (quase toda `-`), mas `Oportunidade`/`Lead` carregam contexto de empresa. Criar `companies` por domínio de e-mail/CNPJ e `properties` por endereço/usina; ligar via `contact_company_links`/`property_owner_links` (hooks `useCreateContactAtomic`/`linkEntityToContact` já existem).
2. **Custom tables com relação:** estender `custom_tables.table_schema` com coluna `type: "relation"` (já tipada em `useCustomTables.ts` com `relationConfig.targetTable/displayField`) e persistir arestas em `custom_table_links` (N:M bidirecional: índices `idx_ctl_from`/`idx_ctl_to`, UNIQUE `uq_ctl_edge`). A UI de `CustomTableView` precisa de seletor de registro conectado.
3. **Lookup/Roll-Up:** campos computados via view SQL ou trigger — ex.: `opportunity_count`, `sum(value)` por company; `contact_count` por property. Não armazenar agregado em JSONB (fonte de divergência).
4. **User Attribution:** `leads.responsible_id` já existe; adicionar `opportunities.owner_id` (ver Q4) e campo "usuário" nos schemas de custom table.
5. **Bidirecionalidade:** `custom_table_links` já guarda `from/to` + `relation_key`; a UI deve exibir o registro conectado nos dois lados (query pelos dois índices).

---

## 4. Taxonomia de origem (Q3)

> Detalhamento completo em `taxonomia-origenes.md`.

### 4.1 Mapeamento dos 13 valores crus → `origin_category` (CHECK de 12)

| `source`/`origem` (Jestor) | Contagem | `origin_category` | Grupo MECE |
| :--- | ---: | :--- | :--- |
| Tráfego Pago | 640 | `paid_social` | inbound |
| Mensagem Whatsapp | 221 | `outbound_message` | outbound |
| Database | 87 | `api_import` | system |
| Indicação | 83 | `referral` | network |
| Jestor | 59 | `api_import` | system |
| Base Ativa | 54 | `outbound_message` | outbound |
| Landing Page - LL | 36 | `direct_brand` | inbound |
| Prospecção Ativa | 35 | `outbound_phone` | outbound |
| Site | 14 | `direct_brand` | inbound |
| Google ADS | 12 | `paid_search` | inbound |
| Lead Magnet - Billing | 5 | `direct_brand` | inbound |
| Lead Magnet - Billing (Partner) | 3 | `partner_channel` | network |
| Solo App | 2 | `api_import` | system |

O mapa é o do próprio script (`migrate_solo_energia.py:55-68`), com default `api_import` para rótulos fora do dicionário (caso "Jestor"). **Observação:** "Jestor" (59) é artefato de migração, não canal real — precisa ser remapeado para o canal verdadeiro (ou mantido como `api_import` com `origin_detail='Jestor'` e tratado como "base importada").

### 4.2 Problemas

1. **`origin_taxonomy` vazia.** A tabela (Sprint 5.2) e o editor `OriginTaxonomyEditor.tsx` existem, mas nenhuma linha foi semeada para a Solo Energia. O editor não tem o que mostrar.
2. **Seis colunas de origem.** `origin_category` (CHECK, canônico), `origin_detail` (texto livre), `origin` (legado), `source` (legado, AddContactModal ainda escreve), `origem` (legado), `channel` (é canal de contato, não origem — armadilha documentada no Sprint 9). Agrupar por qualquer uma dá um gráfico diferente.
3. **CHECK de 12 vs 8 usados.** 4 categorias nunca usadas: `organic_search`, `organic_social`, `outbound_email`, `offline_event` — ok, taxonomia é superset.

### 4.3 Proposta (MECE)

- **Manter** `origin_category` como enum canônico (CHECK de 12, grupos inbound/outbound/network/system — já definidos em `src/config/originTaxonomy.ts`).
- **Semear** `origin_taxonomy` com os 13 rótulos crus mapeados para `kind='origem'` + categoria, e os canais (`whatsapp`, `site`, `instagram`) para `kind='canal'` — assim o editor de UI passa a funcionar e o dashboard ganha dimensões em linguagem do cliente.
- **`origin_detail`** preserva o rótulo cru (decisão do Sprint 10, correta).
- **Parar de escrever** `source`/`origem` em código novo (AddContactModal, webhooks); migrar leituras para a view `acquisition_channel`/`contact_channel` do Sprint 9.
- **Regra de negócio:** origem é atributo do **contato** (identidade), não da oportunidade. `custom_data.fonte` da migração deve ser promovido para `leads.origin_category`/`origin_detail` quando a oportunidade for a única fonte.

---

## 5. Responsáveis / usuários (Q4)

### 5.1 Estado atual (evidência)

- `profiles`: `id → auth.users`, `equipe_id`, `nome_completo`, `email`, `telefone`, `cpf`, `cargo`, `role` (`user|admin|owner|super_admin` — CHECK em `20251228150000_v3_5_admin_rbac.sql`).
- `user_roles`: tabela de papéis (lida pelo frontend; `20251228001615_...`).
- `create-equipe-member`: edge function que cria usuário auth + vincula à equipe + atribui role (admin/owner/super_admin autorizados).
- `useTeamMembers`: lê `profiles` por `equipe_id` (nome + email).
- `leads.responsible_id` (FK `profiles`) e `leads.assigned_to` (FK `profiles`): **NULL nos 1.251**.
- `conversations.responsible_id` (FK `profiles`): **0 setados**.
- `opportunities`: **não tem coluna de dono**. O responsável vive só em `custom_data.responsavel_jestor` (texto livre): 575 NULL · 390 "Mateus Sombra" · 224 `luizhenriqueteixeira@hotmail.com` · 65 `fgmssolar@gmail.com` · 8 `estevamdequadros@gmail.com`.

### 5.2 O que falta

1. **Coluna de dono em `opportunities`** (`owner_id uuid REFERENCES profiles(id)`), espelhando `leads.responsible_id`. Sem isso, não existe "responsável da oportunidade" no modelo.
2. **Backfill** do `responsavel_jestor` → `profiles`:
   - por e-mail: `luizhenriqueteixeira@hotmail.com`, `fgmssolar@gmail.com`, `estevamdequadros@gmail.com` → `profiles.email`;
   - por nome: "Mateus Sombra" → `profiles.nome_completo` (ou `user_roles`/`equipes`).
   - Os 575 NULL ficam sem dono até atribuição manual/round-robin.
3. **UI de atribuição**: dropdown de responsável no card do Kanban / `OpportunityDetailModal`, filtro por responsável no pipeline, e atribuição round-robin ou por carga.
4. **Permissões**: `profiles.role` + `user_roles` já existem; falta expor gestão de membros na UI (a edge function existe, o frontend de convite não).

### 5.3 Proposta de campos/UI

- `opportunities.owner_id` (FK profiles, SET NULL) + índice `(equipe_id, owner_id)`.
- `leads.responsible_id` já existe — usar como fonte para "dono do contato"; `opportunities.owner_id` para "dono do negócio".
- UI: seletor de usuário (avatar + nome) no card e no modal; coluna "Responsável" na `OpportunityTable`; filtro global.
- RLS já isola por `equipe_id` — nenhuma mudança de segurança necessária.

---

## 6. Correções de campos (Q5)

### 6.1 Inventário de inconsistências

| Campo | Problema | Evidência | Correção |
| :--- | :--- | :--- | :--- |
| `phone` (cru) | Formatos mistos: `(85) 99262-5840`, `+5585999819722`, `85998212918`, `558596054686` | Amostra de leads | Normalizar na escrita (ou backfill) mantendo `phone_normalized` em sync; `phone` deve ser o número enviável (DDI 55) |
| `phone_normalized` | 50 contatos sem (rebaixados por UNIQUE) | Evidência | Revisar grupos ambíguos; fundir quando mesma pessoa |
| Números placeholder | `5511911112222` (5 pessoas), `5585999138804` (18 nomes) | Script §dedup | Flag `is_placeholder` ou `observations`; excluir de campanhas |
| `email` placeholder | `sememail@hotmail.com` × 9 (nomes distintos) | Evidência | Normalizar para NULL ou flag; não usar como chave de dedup |
| E-mails compartilhados | `ricardomaia_eletrotecnico@hotmail.com` × 9 (família/empresa) | Evidência | **Não** são duplicados — manter; dedup por e-mail deve exigir nome parecido |
| `source` vs `origem` vs `origin_category` vs `origin_detail` | 4 colunas de origem; sedimentos de sprints | Sprint 9 doc | Canônico = `origin_category` + `origin_detail`; parar de escrever `source`/`origem` |
| `lifecycle_stage` | 1.251 `raw` | Evidência | Backfill por `opportunities.status` (won→client, lost→lost, open→opportunity) |
| `contact_type` | opportunity 1.177 · lead 74 · contact 0 · spam 0 | Evidência | Correto para a migração; após roteamento (Q7), `contact`/`spam` passarão a existir |
| `creation_source` | 1.251 `import` | Evidência | Correto |
| `channel` | 1.251 `whatsapp` | Evidência | É canal de contato (inbox), não origem — não usar em gráfico de aquisição |

### 6.2 Regras de correção

1. **Telefone:** normalizar sempre na borda (webhooks já fazem via `normalizePhone`); adicionar migration de backfill para `phone` cru; validar com `normalize_phone_br` (porta exata, conferida em 400 números com 0 divergências — `sprint_10_migration_solo_energia.md`).
2. **E-mail:** dedup por e-mail só com nome parecido (evita fundir família/empresa); placeholder `sememail@hotmail.com` → NULL.
3. **Origem:** uma única fonte de verdade (`origin_category` + `origin_detail`); backfill dos 8 valores usados; remapear "Jestor" (59).
4. **Lifecycle:** backfill determinístico por status da oportunidade; trigger `fn_advance_lifecycle` (Sprint 6.7) passa a manter daí em diante.
5. **Placeholders:** flag explícita para números/emails de teste; bloqueio de envio.

---

## 7. Anti-duplicação na ingestão (Q6)

### 7.1 Fluxo atual (evidência de código)

| Webhook | Dedup de mensagem | Lookup de lead | Criação |
| :--- | :--- | :--- | :--- |
| `gpt-maker-webhook` | `gpt_message_id` + janela de conteúdo (60s customer / 300s agent) + fingerprint de eco outbound (30s) | `phone_normalized` → fallback `gpt_maker_chat_id` | INSERT com tratamento de 23505 (re-busca do vencedor) |
| `solo-wpp-webhook` | `provider_message_id` + janela + eco outbound | `phone_normalized` | INSERT com tratamento de 23505 e 23514 (degrade `solo_api`→`webhook`) |
| `crm-webhook` | — (API externa) | telefone | INSERT |

Ambos os webhooks WhatsApp criam **lead + conversa + oportunidade** para toda mensagem de cliente (`resolveActiveOpportunity(createIfMissing: true)`).

### 7.2 Por que "cada mensagem duplica o contato"

O bug reportado por Mateus tem três gatilhos, todos na mesma raiz: **o lookup de lead falha e o INSERT cria lead novo**:

1. **Sem telefone normalizável + chatId ausente/instável.** Se `normalizePhone(senderPhone)` retorna null (número < 8 dígitos, estrangeiro, ausente) e `contextId` não vem (ou muda a cada sessão), o lookup por `phone_normalized` e por `gpt_maker_chat_id` falham → **lead novo por mensagem**.
2. **Janela de dedup escopada a `lead.id`.** A verificação de conteúdo (`eq('lead_id', lead.id)`) só acha duplicatas dentro do MESMO lead. Quando o lead já foi duplicado (gatilho 1), a janela não enxerga a mensagem anterior (está em outro lead) → **círculo vicioso**: lead duplicado → dedup de mensagem falha → mais mensagens → mais leads.
3. **Oportunidade por lead.** `resolveActiveOpportunity` cria uma oportunidade nova para cada lead novo → duplicação em cascata no funil.

Nota: o UNIQUE parcial `(equipe_id, phone_normalized)` impede duplicação **quando há telefone** — por isso os duplicados reais são leads sem `phone_normalized` (os 50 rebaixados + novos inbound sem telefone).

### 7.3 Estratégia robusta proposta

1. **Upsert idempotente por telefone normalizado** (já existe) **+ UNIQUE parcial em `(equipe_id, gpt_maker_chat_id)`** `WHERE gpt_maker_chat_id IS NOT NULL` — fecha o buraco do chatId.
2. **UNIQUE em `messages`:** `(equipe_id, provider_message_id)` `WHERE provider_message_id IS NOT NULL` — dedup de mensagem no banco, não só na aplicação (idempotência real em retry).
3. **Reuso de `conversation_id`:** nunca criar conversa nova se existir `(lead_id, channel)` ou `gpt_maker_chat_id` (o upsert multi-nível já tenta; adicionar UNIQUE para tornar atômico).
4. **Dedup por telefone + nome + janela antes de criar:** se o telefone não resolve, buscar por `nome parecido + email` nos últimos N dias antes de INSERT; se achar, atualizar em vez de criar.
5. **Normalizar `phone` na borda** (já feito) e **persistir o telefone cru normalizado** para que o lookup por telefone nunca falhe por formato.
6. **Tratar `23505` como sucesso** (já feito nos dois webhooks) e **logar a origem da duplicata** para auditoria.

---

## 8. Roteamento inteligente (Q7)

### 8.1 Como o front agent decide hoje

- **Ingestão (webhooks):** toda mensagem de cliente vira lead + oportunidade (`resolveActiveOpportunity(createIfMissing: true)`). Não há gate de spam/noise na entrada — só filtros mecânicos (tool message, grupo/broadcast, payload vazio).
- **Classificação (`analyze-message`):** roda em background (se `is_crm_agent_enabled`) e extrai `intent`: `INTERESTED | SCHEDULED | DISQUALIFIED | SPAM | UNCHANGED` + campos (`name`, `email`, `consumo_medio`, `meeting_scheduled`...).
- **Ações aplicadas:** `DISQUALIFIED` → `lead_type='contact'` + `qualification_status='disqualified'` + oportunidade `lost`; `SCHEDULED` → move etapa; `INTERESTED` → move para qualificação. **`SPAM` não tem nenhum código que o aplique** — o intent é extraído e ignorado.
- **Copilot (python-agent):** o `workflow.py` tem gate de spam no Tower (`route.contact_type in {"spam","other"}` → `skipped_spam`), mas o Copilot só roda via sync manual (cron/trigger desligados — ver Q8).

### 8.2 Proposta de regras de roteamento

| Condição de entrada | Ação | `lead_type` | `contact_type` | `lifecycle_stage` | Oportunidade |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Sem telefone + sem nome + sem conteúdo | Ignorar (noise) | — | — | — | — |
| Grupo/broadcast/JID técnico | Skip (já feito) | — | — | — | — |
| Mensagem de ferramenta/agente | Skip (já feito) | — | — | — | — |
| Primeira mensagem com conteúdo real | Criar **lead** (sem oportunidade) | `lead` | `lead` | `raw` | **não criar** |
| Intent `SPAM` | Marcar spam, não criar oportunidade | `spam` | `spam` | `raw` | não criar |
| Intent `INTERESTED` | Criar oportunidade na 1ª etapa | `lead` | `opportunity` | `mql`/`sql` | criar |
| Intent `SCHEDULED` | Mover para etapa de reunião | `lead` | `opportunity` | `sql`/`opportunity` | avançar |
| Intent `DISQUALIFIED` | Marcar desqualificado | `contact` | `contact` | `lost` | fechar lost |
| Sem resposta em N dias | (cadência) | `lead` | `lead` | `raw` | — |

**Mudança estrutural:** a criação de oportunidade deve ser **adiada até a primeira classificação** (ou o webhook deve consultar a classificação antes de `resolveActiveOpportunity`). Isso elimina oportunidade para spam/noise e reduz o lixo no funil. O `analyze-message` deve aplicar `SPAM` de verdade (hoje não aplica) e o `contact_type`/`lifecycle_stage` devem ser a máquina de estados do roteamento.

---

## 9. Copilot: velocidade e telemetria (Q8)

### 9.1 Evidência

- `copilot_run_events`: **1.220 eventos** para SE. Kinds: `action_start` 431 · `action_done` 431 · `sweep_progress` 288 · `done` 53 · `awaiting_confirmation` 5 · `lifecycle_recompute` 2 · `dropped_unknown_field` 10.
- `ai_decisions`: **0**. `copilot_ingest_queue`: **0**. `copilot_agents`: 2. `copilot_knowledge`: 0.
- Erros vistos em `action_done`: `tasks_status_check` (23514), `structured output is not enabled for this plan`, `invalid or expired token`.

### 9.2 Diagnósticos

**a) `ai_decisions` = 0 — três causas somadas:**
1. O `workflow.py` só grava decisão quando há `applied_count > 0`, `pending_approval`, `observed` ou `suggest`. Retornos `skipped_spam`, `not_routed`, `route_failed` e `no_action` **não gravam nada** (`workflow.py:253, 260, 268`).
2. Com o bug do `create_task` (abaixo), as ações falham → `applied_count = 0` → nenhuma decisão gravada.
3. Se o LLM falha (structured output/token), o run aborta antes de gravar.

**b) Fila de ingestão vazia — infraestrutura desligada:**
- O cron `copilot_ingest_tick` (`20260608000600_sprint6_ingest_cron.sql`) está **comentado** (passos "UNCOMMENT TO ENABLE" não feitos).
- O trigger reativo `copilot_ingest_reactive` (`20260617000100_sprint63_reactive_ingest_trigger.sql`) está **comentado/desligado** (DROP TRIGGER + bloco inerte).
- Resultado: nada enfileira e nada drena; o Copilot só roda via **sync manual** (por isso existem run_events, mas fila 0 e decisões 0).

**c) Erro `tasks_status_check` (23514):**
`python-agent/app/skills/core_table.py:219` insere `"status": "pending"` em `tasks`, mas o CHECK `tasks_status_check` (Sprint 5.3) só aceita `a_fazer|fazendo|feito|parado` (`20260605000000_sprint5_3_task_statuses.sql`). **Toda `create_task` falha** com 23514 — é o erro mais frequente nos `action_done`.

**d) `structured output is not enabled for this plan`:**
O router Verboo responde `403 structured_output_not_enabled`. O fix já está no repo (`python-agent/app/llm.py:53-84` — `structured_output_kwargs` desliga structured output quando `LLM_BASE_URL` está setado, e o prompt carrega o contrato JSON; PR #8 `fix/copilot-structured-output-fallback`). Os eventos com esse erro provavelmente **antecedem o deploy do fix** ou vêm de caminho que ainda pede `output_schema`.

**e) `invalid or expired token`:**
`401` do router → `LLM_API_KEY` inválida/expirada. É **configuração**, não código. O `ModelProviderError` (`llm.py:34-49`) já converte isso em erro legível em vez de 422 falso.

### 9.3 Propostas

**Correções (P0):**
1. `create_task`: mapear `status` para `a_fazer` (ou alinhar o CHECK). Sem isso, o Copilot não consegue executar a ação mais comum.
2. Habilitar o cron de ingestão + trigger reativo (ou enfileirar a partir dos webhooks) para o Copilot rodar em background.
3. Gravar `ai_decisions` também para `no_action`/`failed` (auditoria completa; hoje 1.220 run_events sem nenhuma decisão é invisível).

**Telemetria (P1):**
4. Adicionar a `copilot_run_events`: `run_duration_ms`, latência por ação, `tokens_used`, `error_code` (23514 etc.) e `status` final do run — hoje `action_done` carrega erro no `payload`, mas não há campo estruturado para filtrar.
5. Contadores de `skipped_spam`/`not_routed`/`no_action` no HUD (para saber por que o Copilot "não faz nada").
6. Persistir decisão mesmo quando o run falha (gravar `status='failed'` com `error_details` — o `record_decision` já aceita).

**Velocidade (P1/P2):**
7. Modelos: `DOORMAN_MODEL`/`WORKER_MODEL`/`SHAPER_MODEL` já são env-overridable (`llm.py`); usar modelo flash para triagem e modelo maior só no re-plan estratégico (o `select_model`/`Stakes` já existe).
8. Batch: `sweep` processa 1 oportunidade por vez (sequencial, sem corrida); paralelizar por pipeline com fila por tenant quando houver volume.
9. Cache de contexto: `copilot_knowledge` = 0 — sem base de conhecimento, todo run re-envia contexto. Popular `knowledge_pgvector` (Sprint 6.1) reduz tokens por run.

---

## 10. Tabela priorizada de recomendações

| Prioridade | Item | Seção | Impacto | Esforço |
| :--- | :--- | :--- | :--- | :--- |
| **P0** | Fix `create_task` status → `a_fazer` (23514) | Q8 | Copilot volta a executar ações | S |
| **P0** | Habilitar ingestão em background (cron + trigger reativo) | Q8 | Copilot deixa de depender de sync manual | M |
| **P0** | Gravar `ai_decisions` para `no_action`/`failed` | Q8 | Auditoria e diagnóstico do Copilot | S |
| **P0** | Anti-duplicação: UNIQUE `(equipe_id, gpt_maker_chat_id)` + UNIQUE `messages.provider_message_id` | Q6 | Mata a duplicação de contato por mensagem | S |
| **P0** | Roteamento: adiar criação de oportunidade até classificação; aplicar `SPAM` | Q7 | Funil sem lixo; spam não vira oportunidade | M |
| **P0** | Backfill `opportunities.value` (798 NULL) | Q1 | Ticket médio/forecast voltam a funcionar | M |
| **P1** | `opportunities.owner_id` + backfill de `responsavel_jestor` → `profiles` | Q4 | Filtro por vendedor, produtividade, roteamento | M |
| **P1** | Backfill `lifecycle_stage` por status da oportunidade | Q1/Q5 | Funil Predictable Revenue visível | S |
| **P1** | Semear `origin_taxonomy` (13 rótulos + canais) | Q3 | Editor de UI e dashboard de origem funcionam | S |
| **P1** | Normalizar `phone` cru (backfill) + flag de placeholders | Q5 | Envio de WhatsApp confiável; campanhas seguras | M |
| **P1** | Telemetria: `run_duration_ms`, `tokens_used`, `error_code`, `status` em `copilot_run_events` | Q8 | HUD vira ferramenta de diagnóstico | M |
| **P2** | Modelo relacional: popular companies/properties + UI de relação em custom tables + Lookup/Roll-Up | Q2 | Paridade com Jestor (Connected Records) | L |
| **P2** | UI de atribuição de responsável (dropdown no card, filtro, round-robin) | Q4 | Operação diária | M |
| **P2** | Remapear origem "Jestor" (59) e parar de escrever `source`/`origem` | Q3/Q5 | Higiene de dados | S |
| **P2** | Popular `copilot_knowledge` (pgvector) para reduzir tokens por run | Q8 | Velocidade/custo do Copilot | L |

Legenda de esforço: S = dias, M = 1–2 semanas, L = sprint dedicada.

---

## 11. Arquivos de apoio

- `taxonomia-origenes.md` — desenho MECE da taxonomia de origem + mapeamento completo.
- `modelo-relacional.md` — modelo relacional proposto (núcleo, custom tables, Lookup/Roll-Up, User Attribution).

## 12. Fontes

- `docs/dev/projects/saas-salesengine-v1.0/SE-STUDY-001/verboo/evidence-data.md` (dados reais 2026-09-10)
- `Planning/Sprints/sprint_10_migration_solo_energia.md`
- `scripts/migrate_solo_energia.py`
- `supabase/migrations/` (sprint10, sprint4 foundations, epic1/2, sprint5.2/5.3/5.5, sprint6.x, sprint9, sprint8.2)
- `supabase/functions/gpt-maker-webhook/`, `solo-wpp-webhook/`, `crm-webhook/`, `analyze-message/`, `_shared/phone.ts`, `_shared/opportunities.ts`, `create-equipe-member/`
- `src/` (ImportModal, useLeads, useCustomTables, useOriginTaxonomy, useLeadDuplicateCheck, useCopilotSync, useCreateContactAtomic, CopilotCockpit, TelemetryHUD, originTaxonomy.ts)
- `python-agent/` (workflow.py, agno_workflow.py, llm.py, audit.py, events.py, sweep.py, ingest.py, decisions.py, skills/core_table.py)
- `Planning/Benchmark/Jestor/Jestor.md`