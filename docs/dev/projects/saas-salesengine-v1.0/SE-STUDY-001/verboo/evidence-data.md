# Evidencia de dados reais — Supabase produção (2026-09-10)

> Coletado por OpenClaw via MCP read-only. Equipe Solo Energia: `939d7dd8-592c-4fda-946e-3568f2909904` (niche `solon`, is_legacy=true).

## Equipes (todas)
- Solo Energia (939d7dd8…, legacy, 2025-12-26), Cinemas Benficas, Lucas Castelo Nutricionista, Be My Guest, Rema Digital, Jornada do R1, Casa Flow, WI Advogados (no legacy, 2026-09-02).

## Leads SE (1.251)
- deleted: 0. contact_type: opportunity 1.177, lead 74, contact 0, spam 0, archived 0.
- lead_type: lead 1.251. lifecycle_stage: raw 1.251. creation_source: import 1.251. channel: whatsapp 1.251.
- responsible_id NULL: 1.251. assigned_to NULL: 1.251. conversations.responsible_id set: 0.

## Oportunidades SE (1.262)
- sem_pipeline: 0, sem_stage: 0, valor NULL: 798, valor 0: 1.
- status: open 622, won 137, lost 503, outro 0.
- custom_data mostra: `{fonte, origem_migracao:"jestor_sprint10", proximo_contato, responsavel_jestor (email ou nome), link_proposta, data_envio_proposta}`.

## Pipelines SE
- `Solo Energia | Usinas - Micro Geração` (fd7b9821-c639-427d-8682-de3e158c18cb, 11 stages).
- `Carregamento Veicular` (92c863c8-95d8-4d71-8bda-01dc5d2d4883, 6 stages).

## Fontes (source/origem) — 13 valores
Tráfego Pago 640 · Mensagem Whatsapp 221 · Database 87 · Indicação 83 · Jestor 59 · Base Ativa 54 · Landing Page - LL 36 · Prospecção Ativa 35 · Site 14 · Google ADS 12 · Lead Magnet - Billing 5 · Lead Magnet - Billing (Partner) 3 · Solo App 2.

## origin_category (CHECK constraint) — 8 valores usados
paid_social 640 · outbound_message 275 · api_import 148 · referral 83 · direct_brand 55 · outbound_phone 35 · paid_search 12 · partner_channel 3.
(Valores permitidos por CHECK: organic_search, organic_social, paid_search, paid_social, direct_brand, outbound_phone, outbound_message, outbound_email, referral, partner_channel, offline_event, api_import.)

## Duplicados por email (top)
- sememail@hotmail.com: 9 (nomes distintos — placeholder)
- ricardomaia_eletrotecnico@hotmail.com: 9 (família/empresa compartem email)
- gabriel.maia@yahoo.com.br: 4
- Outros pares: lima_gracasantos, marquinhos15, mateus@soloenergia.com.br, samiasombra28, tiberiocipriano, cearapallets, vaniazevedom, eliofilho14, itamarcordeiroteixeira.
- Duplicados por phone_normalized: 0 (unique constraint parcial aplicado).
- Duplicados por phone cru: 0 (todos normalizados).

## Mostra de leads importados (campos clave)
- Cake's Day: phone 558596054686, source=origem=origin_detail="Mensagem Whatsapp", origin_category=outbound_message, contact_type=opportunity.
- George Almeida: phone "(85) 99262-5840" (NÃO normalizado), source="Landing Page - LL", origin_category=direct_brand.
- Raphael Sampaio: phone "+5585999819722", source="Prospecção Ativa", origin_category=outbound_phone.
- Rosiane Cunha: phone "85998212918" (10 dígitos, sem 55), source="Tráfego Pago", origin_category=paid_social.
- jozias Queiroz dos Santos: phone "+5585994093938", source="Tráfego Pago", origin_category=paid_social.

## Copilot SE
- copilot_agents: 2. copilot_ingest_queue: 0. copilot_run_events: 1.220. copilot_knowledge: 0. ai_decisions: 0.
- copilot_run_events columns: id, equipe_id, run_id, opportunity_id, seq, kind, payload, created_at.

## Relacional SE
- custom_tables: 2. custom_table_records: 1. companies: 1. properties: 1. contact_company_links: 0. property_owner_links: 1. opportunity_links: 0.
- origin_taxonomy: 0 linhas (vazia).

## Webhooks de ingesta (código repo)
- gpt-maker-webhook: dedup por gpt_message_id + janela temporal (60s customer / 300s agent).
- solo-wpp-webhook: dedup por provider_message_id + janela temporal + outbound echo.
- crm-webhook: dedup por telefone para evitar crash de unique constraint.
- Problema reportado por Mateus: cada mensagem entrante duplica o contato na base.

## Migração Sprint 10 (mergeada PR #9, d148b4f)
- Backup: 468 leads · 56 oportunidades · 9.340 mensagens.
- Importado: 1.251 leads · 1.260 oportunidades · 0 sem etapa.
- Dedup: telefone + nome parecido (preserva 38 pessoas).
- Mapa etapas: Reciclo 514, Desqualificado 402, Ganho 137, Perdido 101, Qualificação 31, Contato Inicial 27, Agendamento 22, Envio de Proposta 12, Negociação 12, Reunião 1.
- UNIQUE (equipe_id, phone_normalized) parcial. trg_leads_sync_phone_normalized recalcula no INSERT.
- normalize_phone_br: remove 55 se len>=12, insere 9 em 10 dígitos, devolve 8/9 sem DDI.

## Benchmark Jestor (Planning/Benchmark/Jestor/Jestor.md)
- Relações: Connected Records N:1, N:M bidireccional, Lookup, Roll-Up, User Attribution, Multiple Users.
- SE atual: custom tables sem sistema de relações.
- Field types ausentes: Currency, User/Multiple Users, Checklist, Formula, Rating/Goal, Signature.
- Automations: trigger-action, botões, schedulers, fluxos de aprovação.