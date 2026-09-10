# SE-STUDY-001 — Estudo Migração Solo Energia (Jestor → Sales Engine)

| Campo | Valor |
| :--- | :--- |
| **Projeto** | saas-salesengine-v1.0 |
| **Tarefa** | SE-STUDY-001 |
| **Origem** | Telegram 2026-09-10 · Mateus (estudo completo read-only + validação migração Sprint 10) |
| **Agentes** | Verboo (estudo + tradução PT-BR) · OpenClaw (orquestração, evidência Supabase, commit/PR/Discord) |
| **Status** | ✅ Estudo entregue · PR aberto |
| **Branch** | `verboo/study/migration-solo-energia` |
| **PR** | https://github.com/mateus-esm/saas-salesengine-v1.0/pull/10 |

## Artefatos por agente

| Agente | Artefato | Path |
| :--- | :--- | :--- |
| Verboo | Estudo principal (8 perguntas + veredito + P0/P1/P2) | `verboo/estudio-migracion-solo-energia.md` |
| Verboo | Taxonomia de origens (MECE + mapeamento 13 valores) | `verboo/taxonomia-origenes.md` |
| Verboo | Modelo relacional proposto (benchmark Jestor) | `verboo/modelo-relacional.md` |
| OpenClaw | Evidência de dados reais (Supabase produção 2026-09-10) | `verboo/evidence-data.md` |

## Pendências (próxima sprint)

- P0: popular `origin_taxonomy` + quebrar Tráfego Pago no detail · owner_id em opportunities + mapear responsáveis · fix `tasks_status_check` (23514) no copilot · decidir RLS das tabelas backup (20 tabelas expostas).
- P1: limpeza placeholders (email/telefone) · fila de qualificação dos `s/nome` · upsert idempotente no inbound · routing spam vs opp · telemetria com duração/modelo.
- P2: Lookup/Roll-Up relacional · importador genérico com field-matching · Dashboard por canal/responsável.