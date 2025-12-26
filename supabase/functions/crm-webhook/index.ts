import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    
    // Get webhook secret from header or query param
    const webhookSecret = req.headers.get('x-webhook-secret') || url.searchParams.get('secret');
    
    if (!webhookSecret) {
      return new Response(
        JSON.stringify({ error: 'Missing webhook secret' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find equipe by webhook_secret
    const { data: equipe, error: equipeError } = await supabase
      .from('equipes')
      .select('id, nome')
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
      // Create new lead
      const payload = body as LeadPayload;
      
      if (!payload.name) {
        return new Response(
          JSON.stringify({ error: 'name is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get first stage for this equipe
      const { data: firstStage } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('equipe_id', equipe.id)
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle();

      const leadData = {
        equipe_id: equipe.id,
        stage_id: firstStage?.id || null,
        name: payload.name,
        email: payload.email || null,
        phone: payload.phone || null,
        source: payload.source || 'webhook',
        origem: 'webhook',
        atendido_por_agente: false,
        tags: payload.tags || [],
        observations: payload.observations || null,
        custom_fields: payload.custom_fields || {},
        opportunity_value: payload.opportunity_value || 0,
        meeting_scheduled: payload.meeting_scheduled || false,
        next_contact: payload.next_contact || null,
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

      // Create activity
      await supabase.from('lead_activities').insert({
        lead_id: lead.id,
        tipo: 'webhook',
        descricao: 'Lead criado via webhook',
        metadata: { source: payload.source || 'webhook' },
      });

      return new Response(
        JSON.stringify({ success: true, lead_id: lead.id, message: 'Lead created' }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'update' || body.lead_id) {
      // Update existing lead
      const payload = body as UpdatePayload;
      
      if (!payload.lead_id) {
        return new Response(
          JSON.stringify({ error: 'lead_id is required for updates' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify lead belongs to this equipe
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

      const { error: updateError } = await supabase
        .from('leads')
        .update(payload.updates)
        .eq('id', payload.lead_id);

      if (updateError) {
        console.error('Error updating lead:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to update lead', details: updateError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create activity
      await supabase.from('lead_activities').insert({
        lead_id: payload.lead_id,
        tipo: 'webhook_update',
        descricao: 'Lead atualizado via webhook',
        metadata: { updates: Object.keys(payload.updates) },
      });

      return new Response(
        JSON.stringify({ success: true, message: 'Lead updated' }),
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