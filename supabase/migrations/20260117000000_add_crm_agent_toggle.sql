
alter table "public"."equipes" add column if not exists "is_crm_agent_enabled" boolean not null default false;
