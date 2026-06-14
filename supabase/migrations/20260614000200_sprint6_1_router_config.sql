-- 20260614000200_sprint6_1_router_config.sql
-- Strategic-tier routing controls for the Sprint 6.1 cognition router.

alter table public.pipeline_agent_rules
  add column if not exists strategic_model text,
  add column if not exists escalate_threshold numeric(3,2) default 0.60,
  add column if not exists deal_value_strategic_threshold numeric(14,2);

comment on column public.pipeline_agent_rules.strategic_model is
  'Optional model override for high-stakes Copilot reasoning; NULL falls back to service settings.';
comment on column public.pipeline_agent_rules.escalate_threshold is
  'Cheap-tier confidence below this threshold escalates high-stakes leaves to the strategic model.';
comment on column public.pipeline_agent_rules.deal_value_strategic_threshold is
  'Deal value at or above this amount forces strategic-tier routing; NULL disables value-only escalation.';
