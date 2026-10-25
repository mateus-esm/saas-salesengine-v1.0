# Modelo relacional proposto (Q2)

> Arquivo de apoio de `estudio-migracion-solo-energia.md` · SE-STUDY-001 · 2026-09-10
> Fonte: `evidence-data.md` (estado real) + `20260422000000_sprint4_epic1_foundations.sql` (schema núcleo) + `20260605000003_sprint5_3_custom_tables.sql` + `20260621001000_sprint67_custom_table_links.sql` + `Planning/Benchmark/Jestor/Jestor.md` (benchmark).

---

## 1. Estado atual (evidência 2026-09-10)

| Tabela | Linhas SE | Schema | UI |
| :--- | ---: | :--- | :--- |
| `companies` | 1 | ✅ (`20260422000000_sprint4_epic1_foundations.sql`) | Parcial (hook `useCreateContactAtomic`/`linkEntityToContact`) |
| `properties` | 1 | ✅ | Parcial |
| `contact_company_links` | 0 | ✅ (N:M, `role`, `is_primary`) | Parcial |
| `property_owner_links` | 1 | ✅ (polimórfico owner contact/company) | Parcial |
| `opportunity_links` | 0 | ✅ (company/property/contact + `relation`) | — |
| `custom_tables` | 2 | ✅ (Sprint 5.3) | `CustomTableView`/`CustomTableManager` |
| `custom_table_records` | 1 | ✅ | ✅ |
| `custom_table_links` | — | ✅ (N:M genérico, `relation_key`, UNIQUE de aresta) | — |

Conclusão: **o schema relacional já existe**; o que falta é população, UI de relações e campos computados. O benchmark Jestor marca o alvo de produto.

---

## 2. Benchmark Jestor (alvo)

`Planning/Benchmark/Jestor/Jestor.md` §2:

| Feature | Descrição | Estado SE |
| :--- | :--- | :--- |
| Connected Records (N:1) | Selecionar um registro de outra tabela | Schema pronto; falta UI de seletor |
| N:M bidirecional | Relação sincronizada nos dois sentidos | `custom_table_links` pronto; falta UI nos dois lados |
| Lookup Fields | Puxar valor de um registro conectado (read-only) | Não existe |
| Roll-Up Fields | Agregar valores de registros conectados (Sum/Count/Avg/Min/Max) | Não existe |
| User Attribution | Auto-atribuir registro a um usuário | `leads.responsible_id` existe; falta em `opportunities` e custom tables |
| Multiple Users | Campo multi-valor de usuários | Não existe |

---

## 3. Modelo proposto

### 3.1 Núcleo (companies / properties / links)

```
leads (identidade, Tier 1)
  ├─ responsible_id → profiles            [ya existe]
  ├─ contact_company_links (N:M) ── companies
  │     contact_id, company_id, role, is_primary
  ├─ property_owner_links (N:M) ── properties
  │     owner_id, owner_type (contact|company), property_id, is_primary
  └─ opportunity_links (N:M) ── opportunities
        company_id | property_id | contact_id, opportunity_id, relation

opportunities (Tier 3)
  ├─ lead_id → leads (RESTRICT)
  ├─ owner_id → profiles                  [PROPUESTO — ver Q4]
  └─ custom_data (JSONB, keyed por field_id)
```

Ações:
1. **Povoar** `companies`/`properties` a partir da migração (domínio de e-mail/CNPJ → company; usina/endereço → property).
2. **UI de vínculo** no detalhe de contato e no card de oportunidade (reutilizar `linkEntityToContact`/`unlinkEntityFromContact`, que já são idempotentes).
3. **Bidirecionalidade:** ao vincular pela oportunidade, escrever também o link de contato (hoje `useCreateContactAtomic` documenta que vincular dentro do pipeline só escrevia `opportunity_links` e não aparecia na grade de contatos — o fix já está em `linkEntityToContact`).

### 3.2 Custom tables com relações

```
custom_tables.table_schema[]:
  { key, label, type: "relation",
    relationConfig: { targetTable, targetTableSlug, targetTableId, displayField } }

custom_table_links (N:M genérico):
  (equipe_id, from_table, from_id, to_table, to_id, relation_key)
  UNIQUE (equipe_id, from_table, from_id, to_table, to_id, relation_key) — arista única
  Índices from/to — consulta bidireccional
```

Ações:
1. O tipo `relation` **já está tipado** em `useCustomTables.ts` (`relationConfig`). Falta o seletor de registro conectado em `CustomTableView`.
2. Persistir arestas em `custom_table_links` (já existe) e **expor o registro conectado nos dois lados** (query por `idx_ctl_from` e `idx_ctl_to`).
3. Para N:1 (um registro aponta para outro), basta uma aresta; para N:M, duas arestas ou uma com `relation_key` simétrica.

### 3.3 Lookup e Roll-Up (campos computados)

Não armazenar agregados em JSONB (fonte de divergência). Implementar como:

- **Lookup:** view SQL que une `custom_table_records.data->>'field'` com o registro conectado (`displayField`). Read-only.
- **Roll-Up:** view SQL com `GROUP BY` sobre a aresta — ex.:
  - `opportunity_count` e `SUM(opportunities.value)` por `companies.id`;
  - `contact_count` por `properties.id`;
  - `count`/`sum`/`avg`/`min`/`max` sobre qualquer relação N:M em custom tables.
- Alternativa: trigger que mantém um contador na tabela pai (mais rápido de ler, mais código de manutenção). Recomendação: **views** primeiro (zero risco de divergência), materializar só se o volume exigir.

### 3.4 User Attribution

- `leads.responsible_id` (já existe) = dono do contato.
- `opportunities.owner_id` (proposto, Q4) = dono do negócio.
- Custom tables: coluna `type: "user"` / `"users"` (multi-valor) em `table_schema`, resolvida contra `profiles` da equipe.
- Atribuição automática: round-robin por carga ou por pipeline ao criar oportunidade (regra configurável).

### 3.5 Prioridade de implementação

| Passo | O quê | Depende de |
| :--- | :--- | :--- |
| 1 | `opportunities.owner_id` + backfill de `responsavel_jestor` | Q4 |
| 2 | Povoar companies/properties + UI de vínculo no detalhe de contato | — |
| 3 | Seletor de relação em `CustomTableView` + persistência em `custom_table_links` | — |
| 4 | Views de Lookup/Roll-Up (count/sum por company/property) | passos 2–3 |
| 5 | Campo user/users em custom tables + atribuição automática | passo 1 |