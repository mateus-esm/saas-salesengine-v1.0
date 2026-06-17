import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveActiveOpportunity } from "../_shared/opportunities.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

interface LeadPayload {
  name: string;
  email?: string;
  phone?: string;
  source?: string;
  opportunity_value?: number;
  tags?: string[];
  observations?: string;
  custom_fields?: Record<string, unknown>;
  meeting_scheduled?: boolean;
  next_contact?: string;
}

interface UpdatePayload {
  lead_id: string;
  updates: Partial<LeadPayload>;
}

// Sprint 4 EPIC 0 — sales-specific fields that must NOT be written to
// public.leads anymore. They belong on the opportunity.
const SALES_FIELDS_ON_OPPORTUNITY = new Set([
  'opportunity_value',
  'meeting_scheduled',
  'next_contact',
  'stage_id',
  'meeting_done',
  'meeting_date',
  'lead_score',
]);

interface InboundWebhookConfig {
  id: string;
  equipe_id: string;
  pipeline_id: string | null;
  field_mappings: Array<{
    source_field: string;
    target_field: string;
    target_type: string;
  }>;
}

interface InboundPayload {
  [key: string]: unknown;
}

/** Convert a raw string value to a clean number, stripping currency symbols and handling Brazilian/European number formats. */
export function parseNumericValue(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === 'number') return raw;
  
  let cleaned = String(raw).replace(/[R$\s]/g, ''); // Remove R$, $, spaces
  
  if (/,/.test(cleaned) && /\./.test(cleaned)) {
    const commaIndex = cleaned.indexOf(',');
    const dotIndex = cleaned.indexOf('.');
    if (commaIndex < dotIndex) {
      // US format: 15,000.00
      cleaned = cleaned.replace(/,/g, '');
    } else {
      // Brazilian format: 15.000,00
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    }
  } else if (/,/.test(cleaned)) {
    // Only comma is present: check if it has exactly 3 digits (thousand separator)
    const parts = cleaned.split(',');
    if (parts[1] && parts[1].length === 3) {
      cleaned = cleaned.replace(/,/g, '');
    } else {
      cleaned = cleaned.replace(',', '.');
    }
  } else if (/\./.test(cleaned)) {
    // Only dot is present: check if it has exactly 3 digits (thousand separator in BR)
    const parts = cleaned.split('.');
    if (parts[1] && parts[1].length === 3) {
      cleaned = cleaned.replace(/\./g, '');
    }
  }
  
  const val = Number(cleaned);
  return isNaN(val) ? undefined : val;
}
function applyFieldMappings(
  payload: InboundPayload,
  mappings: InboundWebhookConfig['field_mappings'],
): { leadData: Record<string, unknown>; oppNativeData: Record<string, unknown>; oppCustomData: Record<string, unknown> } {
  const leadData: Record<string, unknown> = {};
  const oppNativeData: Record<string, unknown> = {};
  const oppCustomData: Record<string, unknown> = {};

  for (const mapping of mappings) {
    const value = payload[mapping.source_field];
    if (value === undefined || value === null) continue;

    if (mapping.target_type === 'lead') {
      leadData[mapping.target_field] = value;
    } else if (mapping.target_type === 'lead_custom') {
      leadData.custom_fields = { ...(leadData.custom_fields as Record<string, unknown> || {}), [mapping.target_field]: value };
    } else if (mapping.target_type === 'opportunity') {
      oppNativeData[mapping.target_field] = value;
    } else if (mapping.target_type === 'custom_data') {
      oppCustomData[mapping.target_field] = value;
    }
  }

  return { leadData, oppNativeData, oppCustomData };
}

/** After lead creation, fire configured outbound webhooks and log results. */
async function dispatchOutboundWebhooks(
  supabase: SupabaseClient,
  equipeId: string,
  leadId: string,
  opportunityId: string | null,
  leadData: Record<string, unknown>,
) {
  const { data: configs, error } = await supabase
    .from('webhook_configs')
    .select('id, url, headers')
    .eq('equipe_id', equipeId)
    .eq('trigger_event', 'lead_created')
    .eq('active', true);

  if (error) {
    console.error('[crm-webhook] Error fetching outbound webhook configs:', error);
    return;
  }

  const payload = {
    event: 'lead_created',
    lead_id: leadId,
    opportunity_id: opportunityId,
    equipe_id: equipeId,
    data: leadData,
    created_at: new Date().toISOString(),
  };

  for (const config of configs || []) {
    try {
      const res = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.headers as Record<string, string> || {}),
        },
        body: JSON.stringify(payload),
      });

      await supabase.from('webhook_logs').insert({
        equipe_id: equipeId,
        webhook_config_id: config.id,
        direction: 'outbound',
        event_type: 'lead_created',
        payload,
        response_status: res.status,
        response_body: await res.text(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[crm-webhook] Error dispatching to webhook ${config.id}:`, message);

      await supabase.from('webhook_logs').insert({
        equipe_id: equipeId,
        webhook_config_id: config.id,
        direction: 'outbound',
        event_type: 'lead_created',
        payload,
        error_message: message,
      });
    }
  }
}

function splitLeadAndOpportunityFields(updates: Partial<LeadPayload>) {
  const leadUpdates: Record<string, unknown> = {};
  const oppCustomData: Record<string, unknown> = {};
  let oppValue: number | undefined;
  let oppMeetingScheduled: boolean | undefined;
  let oppNextContact: string | undefined;

  for (const [k, v] of Object.entries(updates)) {
    if (!SALES_FIELDS_ON_OPPORTUNITY.has(k)) {
      leadUpdates[k] = v;
      continue;
    }
    if (k === 'opportunity_value' && typeof v === 'number') oppValue = v;
    else if (k === 'meeting_scheduled' && typeof v === 'boolean') oppMeetingScheduled = v;
    else if (k === 'next_contact' && typeof v === 'string') oppNextContact = v;
    else oppCustomData[k] = v;
  }

  return { leadUpdates, oppValue, oppMeetingScheduled, oppNextContact, oppCustomData };
}

if (import.meta.main) {
  serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const action = pathParts[pathParts.length - 1] || 'create';
    const body = await req.json();

    // --- Inbound route (configurable field mappings via webhook_configs) ---
    // Check for /inbound/{config_id} BEFORE secret-based auth.
    // Inbound webhooks authenticate by config_id (UUID), not webhook_secret.
    if (pathParts.includes('inbound') && pathParts.length >= 2) {
      // URL sanitization: strip query params (?fbclid=) and trailing slashes
      const sanitizeConfigId = (raw: string) => raw.split('?')[0].replace(/\/$/, '');
      const configId = sanitizeConfigId(pathParts[pathParts.length - 1]);

      // 1. Look up webhook_config
      const { data: config, error: configError } = await supabase
        .from('webhook_configs')
        .select('id, equipe_id, pipeline_id, field_mappings')
        .eq('id', configId)
        .eq('inbound_function', 'receive_lead')
        .maybeSingle();

      if (configError || !config) {
        return new Response(
          JSON.stringify({ error: 'Webhook config not found or not configured for inbound' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const payload = body as InboundPayload;

      // 2. Apply field mappings (separates lead, native opp, and custom_data)
      const { leadData, oppNativeData, oppCustomData } = applyFieldMappings(
        payload,
        (config.field_mappings || []) as InboundWebhookConfig['field_mappings'],
      );

      // 3. Ensure minimum required fields
      if (!leadData.name) {
        return new Response(
          JSON.stringify({ error: 'name is required (map a source field to name)' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 4. Create or update lead (dedup by phone to avoid unique constraint crash)
      const checkPhone = leadData.phone ? String(leadData.phone).replace(/\D/g, '') : null;
      let leadId = '';
      let isNewLead = true;

      if (checkPhone) {
        const { data: existingLead } = await supabase
          .from('leads')
          .select('id, custom_fields')
          .eq('equipe_id', config.equipe_id)
          .eq('phone', checkPhone)
          .maybeSingle();

        if (existingLead) {
          leadId = existingLead.id;
          isNewLead = false;
          const leadUpdate: Record<string, unknown> = {};
          if (leadData.email) leadUpdate.email = leadData.email;
          if (leadData.observations) leadUpdate.observations = leadData.observations;
          if (leadData.tags) leadUpdate.tags = leadData.tags;
          leadUpdate.custom_fields = {
            ...(existingLead.custom_fields as Record<string, unknown> || {}),
            ...(leadData.custom_fields as Record<string, unknown> || {}),
          };

          const { error: updateErr } = await supabase
            .from('leads')
            .update(leadUpdate)
            .eq('id', leadId);
          if (updateErr) console.error('[crm-webhook] Error updating existing lead:', updateErr);
        }
      }

      if (!leadId) {
        const leadRow = {
          equipe_id: config.equipe_id,
          name: leadData.name,
          email: leadData.email || null,
          phone: checkPhone || leadData.phone || null,
          source: leadData.source || 'webhook_inbound',
          origem: 'webhook',
          atendido_por_agente: false,
          tags: leadData.tags || [],
          observations: leadData.observations || null,
          custom_fields: (leadData.custom_fields as Record<string, unknown>) || {},
        };

        const { data: newLead, error: leadError } = await supabase
          .from('leads')
          .insert(leadRow)
          .select()
          .single();

        if (leadError) {
          console.error('[crm-webhook] Error creating lead via inbound:', leadError);
          return new Response(
            JSON.stringify({ error: 'Failed to create lead', details: leadError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        leadId = newLead.id;
      }

      // 5. Resolve pipeline: config.pipeline_id or equipe.default_pipeline_id
      let pipelineId = config.pipeline_id;
      if (!pipelineId) {
        const { data: equipe } = await supabase
          .from('equipes')
          .select('default_pipeline_id')
          .eq('id', config.equipe_id)
          .maybeSingle();
        pipelineId = equipe?.default_pipeline_id || null;
      }

      let opportunityId: string | null = null;
      if (pipelineId) {
        try {
          const opp = await resolveActiveOpportunity(supabase, {
            equipe_id: config.equipe_id,
            lead_id: leadId,
            createIfMissing: true,
          });
          opportunityId = opp?.opportunity_id ?? null;

          if (opp?.opportunity_id) {
            const oppUpdate: Record<string, unknown> = {};

            if (oppNativeData.value !== undefined) {
              const parsedValue = parseNumericValue(oppNativeData.value);
              if (parsedValue !== undefined) oppUpdate.value = parsedValue;
            }

            if (Object.keys(oppCustomData).length > 0) {
              const { data: current } = await supabase
                .from('opportunities')
                .select('custom_data')
                .eq('id', opp.opportunity_id)
                .maybeSingle();
              oppUpdate.custom_data = { ...(current?.custom_data || {}), ...oppCustomData };
            }

            if (Object.keys(oppUpdate).length > 0) {
              await supabase.from('opportunities').update(oppUpdate).eq('id', opp.opportunity_id);
            }
          }
        } catch (oppErr) {
          console.error('[crm-webhook] Error creating opportunity for inbound:', oppErr);
        }
      }

      // 6. Log activity
      await supabase.from('lead_activities').insert({
        lead_id: leadId,
        tipo: 'webhook_inbound',
        descricao: isNewLead ? 'Lead criado via inbound webhook' : 'Lead atualizado via inbound webhook',
        metadata: { config_id: config.id, opportunity_id: opportunityId, is_new: isNewLead },
      });

      // 7. Dispatch outbound webhooks (→ n8n)
      await dispatchOutboundWebhooks(
        supabase,
        config.equipe_id,
        leadId,
        opportunityId,
        { ...leadData, ...oppNativeData, custom_data: oppCustomData },
      );

      return new Response(
        JSON.stringify({
          success: true,
          lead_id: leadId,
          opportunity_id: opportunityId,
          is_new: isNewLead,
          message: isNewLead ? 'Lead created via inbound webhook' : 'Lead updated via inbound webhook',
        }),
        { status: isNewLead ? 201 : 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const webhookSecret = req.headers.get('x-webhook-secret') || url.searchParams.get('secret');

    if (!webhookSecret) {
      return new Response(
        JSON.stringify({ error: 'Missing webhook secret' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: equipe, error: equipeError } = await supabase
      .from('equipes')
      .select('id, nome, default_pipeline_id')
      .eq('webhook_secret', webhookSecret)
      .maybeSingle();

    if (equipeError || !equipe) {
      console.error('Invalid webhook secret or equipe not found');
      return new Response(
        JSON.stringify({ error: 'Invalid webhook secret' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Webhook for equipe: ${equipe.nome}, action: ${action}`);

    if (action === 'create' || req.method === 'POST' && !body.lead_id) {
      const payload = body as LeadPayload;

      if (!payload.name) {
        return new Response(
          JSON.stringify({ error: 'name is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Sprint 4 EPIC 0 — create ONLY the contact identity. No stage_id.
      // Sales-specific fields land on the Opportunity once it exists.
      const leadData = {
        equipe_id: equipe.id,
        name: payload.name,
        email: payload.email || null,
        phone: payload.phone || null,
        source: payload.source || 'webhook',
        origem: 'webhook',
        atendido_por_agente: false,
        tags: payload.tags || [],
        observations: payload.observations || null,
        custom_fields: payload.custom_fields || {},
      };

      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .insert(leadData)
        .select()
        .single();

      if (leadError) {
        console.error('Error creating lead:', leadError);
        return new Response(
          JSON.stringify({ error: 'Failed to create lead', details: leadError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create opportunity if tenant has a default pipeline configured.
      let opportunityId: string | null = null;
      if (equipe.default_pipeline_id) {
        try {
          const opp = await resolveActiveOpportunity(supabase, {
            equipe_id: equipe.id,
            lead_id: lead.id,
            createIfMissing: true,
          });
          opportunityId = opp?.opportunity_id ?? null;

          // If the payload carried sales-specific fields, write them to the
          // new opportunity (not the lead).
          if (opp?.opportunity_id) {
            const oppPatch: Record<string, unknown> = {};
            const oppCustom: Record<string, unknown> = {};
            if (typeof payload.opportunity_value === 'number') {
              oppPatch.value = payload.opportunity_value;
            }
            if (typeof payload.meeting_scheduled === 'boolean') {
              oppCustom.meeting_scheduled = payload.meeting_scheduled;
            }
            if (typeof payload.next_contact === 'string' && payload.next_contact) {
              oppCustom.next_contact = payload.next_contact;
            }

            if (Object.keys(oppCustom).length > 0) {
              const { data: current } = await supabase
                .from('opportunities')
                .select('custom_data')
                .eq('id', opp.opportunity_id)
                .maybeSingle();
              oppPatch.custom_data = { ...(current?.custom_data || {}), ...oppCustom };
            }

            if (Object.keys(oppPatch).length > 0) {
              await supabase.from('opportunities').update(oppPatch).eq('id', opp.opportunity_id);
            }
          }
        } catch (oppErr) {
          console.error('Error creating opportunity:', oppErr);
        }
      }

      await supabase.from('lead_activities').insert({
        lead_id: lead.id,
        tipo: 'webhook',
        descricao: 'Lead criado via webhook',
        metadata: { source: payload.source || 'webhook', opportunity_id: opportunityId },
      });

      return new Response(
        JSON.stringify({
          success: true,
          lead_id: lead.id,
          opportunity_id: opportunityId,
          message: 'Lead created',
        }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'update' || body.lead_id) {
      const payload = body as UpdatePayload;

      if (!payload.lead_id) {
        return new Response(
          JSON.stringify({ error: 'lead_id is required for updates' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: existingLead, error: checkError } = await supabase
        .from('leads')
        .select('id')
        .eq('id', payload.lead_id)
        .eq('equipe_id', equipe.id)
        .maybeSingle();

      if (checkError || !existingLead) {
        return new Response(
          JSON.stringify({ error: 'Lead not found or access denied' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Sprint 4 EPIC 0 — partition updates: identity fields stay on leads,
      // sales fields route to the active opportunity.
      const { leadUpdates, oppValue, oppMeetingScheduled, oppNextContact, oppCustomData } =
        splitLeadAndOpportunityFields(payload.updates || {});

      if (Object.keys(leadUpdates).length > 0) {
        const { error: updateError } = await supabase
          .from('leads')
          .update(leadUpdates)
          .eq('id', payload.lead_id);

        if (updateError) {
          console.error('Error updating lead:', updateError);
          return new Response(
            JSON.stringify({ error: 'Failed to update lead', details: updateError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      const hasOppUpdate =
        oppValue !== undefined ||
        oppMeetingScheduled !== undefined ||
        oppNextContact !== undefined ||
        Object.keys(oppCustomData).length > 0;

      let opportunityId: string | null = null;
      if (hasOppUpdate) {
        const opp = await resolveActiveOpportunity(supabase, {
          equipe_id: equipe.id,
          lead_id: payload.lead_id,
          createIfMissing: !!equipe.default_pipeline_id,
        });

        if (opp) {
          opportunityId = opp.opportunity_id;
          const oppPatch: Record<string, unknown> = {};
          if (oppValue !== undefined) oppPatch.value = oppValue;

          const customPatch: Record<string, unknown> = { ...oppCustomData };
          if (oppMeetingScheduled !== undefined) customPatch.meeting_scheduled = oppMeetingScheduled;
          if (oppNextContact !== undefined) customPatch.next_contact = oppNextContact;

          if (Object.keys(customPatch).length > 0) {
            const { data: current } = await supabase
              .from('opportunities')
              .select('custom_data')
              .eq('id', opp.opportunity_id)
              .maybeSingle();
            oppPatch.custom_data = { ...(current?.custom_data || {}), ...customPatch };
          }

          if (Object.keys(oppPatch).length > 0) {
            await supabase.from('opportunities').update(oppPatch).eq('id', opp.opportunity_id);
          }
        } else {
          console.warn(
            '[crm-webhook] Sales fields recebidos mas lead sem opportunity ativa e sem default_pipeline_id — ignorados.',
          );
        }
      }

      await supabase.from('lead_activities').insert({
        lead_id: payload.lead_id,
        tipo: 'webhook_update',
        descricao: 'Lead atualizado via webhook',
        metadata: {
          updates: Object.keys(payload.updates || {}),
          opportunity_id: opportunityId,
        },
      });

      return new Response(
        JSON.stringify({ success: true, opportunity_id: opportunityId, message: 'Lead updated' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  });
}
