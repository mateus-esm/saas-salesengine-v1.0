# Casa Flow — estado no banco (consultado em 2026-09-26 ~00:40 UTC, só leitura)

## cadence_sequences
[
 {
  "id": "5396de90-d294-4e4f-a7b0-40ff41dff8b7",
  "name": "Novo Lead - Meta ADS (Cadastro)",
  "active": true,
  "trigger_entry_ids": [
   "7e6576a0-696f-40a9-841c-d64721979181"
  ],
  "created_at": "2026-09-25 23:10:57.693521+00",
  "updated_at": "2026-09-25 23:10:57.693521+00",
  "nunca_editada": true
 },
 {
  "id": "ad36c612-cc76-4e1c-a74e-d8129b69bd1b",
  "name": "Novo Lead",
  "active": false,
  "trigger_entry_ids": [
   "7e6576a0-696f-40a9-841c-d64721979181"
  ],
  "created_at": "2026-09-25 23:14:27.545345+00",
  "updated_at": "2026-09-25 23:14:27.545345+00",
  "nunca_editada": true
 }
]

## crm_entries (portas do time)
[
 {
  "id": "99f0afc8-70c7-4cae-9a4c-1533d674d52a",
  "name": "Agente de IA",
  "kind": "agent"
 },
 {
  "id": "10a34b8d-1af1-43b5-a016-350ee59f1449",
  "name": "Landing Page - Lead Land",
  "kind": "webhook"
 },
 {
  "id": "7e6576a0-696f-40a9-841c-d64721979181",
  "name": "Manual",
  "kind": "manual"
 },
 {
  "id": "dcf93cfc-fe10-4570-804b-5e542ebde515",
  "name": "Meta ADS - Cadastro",
  "kind": "webhook"
 },
 {
  "id": "5a0349b1-efd4-4d17-b9ab-4f8502ff8574",
  "name": "Meta ADS - Cadastro",
  "kind": "webhook"
 }
]

## conversation_open_events (telefone mascarado)
[
 {
  "created_at": "2026-09-25 23:13:03.074402+00",
  "status": "failed",
  "error_code": "channel_type_unsupported",
  "trigger_source": "manual",
  "phone": "5585*****23",
  "message": "Oi",
  "error_message": "O canal 3F32F1093C8681A460108E59734FC41E é do tipo Z_API. O provider só abre conversa em canal de WhatsApp não oficial (WHATSAPP)."
 },
 {
  "created_at": "2026-09-25 23:14:56.443165+00",
  "status": "failed",
  "error_code": "channel_type_unsupported",
  "trigger_source": "manual",
  "phone": "5585*****23",
  "message": "Ola teste",
  "error_message": "O canal 3F32F1093C8681A460108E59734FC41E é do tipo Z_API. O provider só abre conversa em canal de WhatsApp não oficial (WHATSAPP)."
 },
 {
  "created_at": "2026-09-25 23:20:57.828496+00",
  "status": "failed",
  "error_code": "channel_type_unsupported",
  "trigger_source": "lead_intake",
  "phone": "5581*****66",
  "message": null,
  "error_message": "O canal 3F32F1093C8681A460108E59734FC41E é do tipo Z_API. O provider só abre conversa em canal de WhatsApp não oficial (WHATSAPP)."
 },
 {
  "created_at": "2026-09-25 23:31:04.257244+00",
  "status": "failed",
  "error_code": "channel_type_unsupported",
  "trigger_source": "lead_intake",
  "phone": "5527*****31",
  "message": null,
  "error_message": "O canal 3F32F1093C8681A460108E59734FC41E é do tipo Z_API. O provider só abre conversa em canal de WhatsApp não oficial (WHATSAPP)."
 },
 {
  "created_at": "2026-09-26 00:11:01.303466+00",
  "status": "failed",
  "error_code": "channel_type_unsupported",
  "trigger_source": "lead_intake",
  "phone": "5513*****91",
  "message": null,
  "error_message": "O canal 3F32F1093C8681A460108E59734FC41E é do tipo Z_API. O provider só abre conversa em canal de WhatsApp não oficial (WHATSAPP)."
 }
]

## outreach_jobs do lead manual (nunca reivindicado: não há cron outreach-tick)
[
 {
  "status": "queued",
  "attempts": 0,
  "run_after": "2026-09-25 23:12:28.064164+00",
  "claimed_at": null,
  "created_at": "2026-09-25 23:12:27.674305+00"
 }
]

## cron.job (não existe outreach-tick)
[
 {
  "jobname": "sprint7_health_tick",
  "schedule": "*/5 * * * *",
  "active": true
 },
 {
  "jobname": "sprint8_billing_tick",
  "schedule": "0 12 * * *",
  "active": true
 },
 {
  "jobname": "sprint8_dispatch_tick",
  "schedule": "* * * * *",
  "active": true
 },
 {
  "jobname": "sprint8_reconcile_tick",
  "schedule": "30 4 * * *",
  "active": true
 },
 {
  "jobname": "sprint9_reports_tick",
  "schedule": "0 * * * *",
  "active": true
 },
 {
  "jobname": "crm-timers",
  "schedule": "*/15 * * * *",
  "active": true
 },
 {
  "jobname": "copilot-tick",
  "schedule": "* * * * *",
  "active": true
 }
]
