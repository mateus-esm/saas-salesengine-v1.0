-- SE-STAGEHOOK-001 — liga "Negócio ganho → Solo Pro" na Solo Energia.
-- Cria o webhook (mesma URL do n8n que o Jestor usa hoje) e o liga a
-- "Ao entrar na etapa" do Ganho de "Solo Energia | Usinas - MMGD".
-- Rode UMA vez: `supabase db query --linked -f supabase/scripts/2026-10-01_solo_pro_deal_won_webhook.sql`
-- Para desligar: update webhook_configs set active = false where name = 'Solo Pro · Negócio ganho';
with new_hook as (
  select gen_random_uuid() id
), ins as (
  insert into public.webhook_configs (id, equipe_id, name, url, trigger_event, active, headers, payload_template)
  select id, '939d7dd8-592c-4fda-946e-3568f2909904', 'Solo Pro · Negócio ganho',
         'http://72.61.219.156:5678/webhook/e8fa1d22-8c6c-447b-acb9-e21540467544',
         'stage_entered:' || id, true, '{}'::jsonb, '"{{payload}}"'::jsonb
  from new_hook returning id
)
update public.pipeline_stages_v2 s
   set webhook_triggers = coalesce(s.webhook_triggers, '[]'::jsonb)
       || jsonb_build_array(jsonb_build_object('event','on_stage_entered','webhook_id',(select id from ins)))
 where s.id = '26af9e9c-9ee3-4391-b746-5c60b785b074'
   and s.equipe_id = '939d7dd8-592c-4fda-946e-3568f2909904'
returning s.name, s.webhook_triggers;
