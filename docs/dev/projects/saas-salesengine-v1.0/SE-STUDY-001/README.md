# SE-STUDY-001 — Estudio Migración Solo Energia (Jestor → Sales Engine)

| Campo | Valor |
| :--- | :--- |
| **Projeto** | saas-salesengine-v1.0 |
| **Tarefa** | SE-STUDY-001 |
| **Origem** | Telegram 2026-09-10 · Mateus (estudio completo read-only + validación migración Sprint 10) |
| **Agentes** | Verboo (estudio + traducción PT-BR) · OpenClaw (orquestración, evidencia Supabase, commit/PR/Discord) |
| **Status** | ✅ Estudio entregado · PR abierto |
| **Branch** | `verboo/study/migration-solo-energia` |
| **PR** | (ver thread Discord) |

## Artefactos por agente

| Agente | Artefacto | Path |
| :--- | :--- | :--- |
| Verboo | Estudio principal (8 preguntas + veredicto + P0/P1/P2) | `verboo/estudio-migracion-solo-energia.md` |
| Verboo | Taxonomía de orígenes (MECE + mapeo 13 valores) | `verboo/taxonomia-origenes.md` |
| Verboo | Modelo relacional propuesto (benchmark Jestor) | `verboo/modelo-relacional.md` |
| OpenClaw | Evidencia de datos reales (Supabase producción 2026-09-10) | `verboo/evidence-data.md` |

## Pendientes (siguiente sprint)

- P0: popular `origin_taxonomy` + romper Tráfego Pago en detail · owner_id en opportunities + mapear responsables · fix `tasks_status_check` (23514) en copilot · decidir RLS de tablas backup (20 tablas expuestas).
- P1: limpieza placeholders (email/telefono) · fila de calificación de `s/nome` · upsert idempotente inbound · routing spam vs opp · telemetría con duración/modelo.
- P2: Lookup/Roll-Up relacional · importador genérico con field-matching · Dashboard por canal/responsable.