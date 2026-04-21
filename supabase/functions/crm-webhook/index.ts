import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

    const body = await req.json();

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
