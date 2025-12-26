import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Processing scheduled automations...');

    // Get all pending automations that are due
    const now = new Date().toISOString();
    const { data: automations, error: fetchError } = await supabase
      .from('scheduled_automations')
      .select(`
        id,
        equipe_id,
        lead_id,
        tipo,
        payload,
        leads (
          id,
          name,
          email,
          phone,
          equipe_id
        ),
        equipes (
          id,
          nome
        )
      `)
      .eq('executed', false)
      .lte('scheduled_for', now)
      .limit(50);

    if (fetchError) {
      console.error('Error fetching automations:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch automations' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!automations || automations.length === 0) {
      console.log('No pending automations');
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No pending automations' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${automations.length} automations to process`);

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const automation of automations) {
      try {
        console.log(`Processing automation ${automation.id} - tipo: ${automation.tipo}`);

        // Process based on type
        switch (automation.tipo) {
          case 'meeting_reminder':
            // Log the reminder (in production, would send WhatsApp/email)
            console.log(`Meeting reminder for lead ${automation.lead_id}`);
            
            // Create activity
            await supabase.from('lead_activities').insert({
              lead_id: automation.lead_id,
              tipo: 'automation',
              descricao: 'Lembrete de reunião processado',
              metadata: automation.payload,
            });
            break;

          case 'follow_up':
            console.log(`Follow-up for lead ${automation.lead_id}`);
            
            await supabase.from('lead_activities').insert({
              lead_id: automation.lead_id,
              tipo: 'automation',
              descricao: 'Follow-up automático processado',
              metadata: automation.payload,
            });
            break;

          case 'next_contact_reminder':
            console.log(`Next contact reminder for lead ${automation.lead_id}`);
            
            await supabase.from('lead_activities').insert({
              lead_id: automation.lead_id,
              tipo: 'automation',
              descricao: 'Lembrete de próximo contato',
              metadata: automation.payload,
            });
            break;

          default:
            console.log(`Unknown automation type: ${automation.tipo}`);
        }

        // Mark as executed
        const { error: updateError } = await supabase
          .from('scheduled_automations')
          .update({ 
            executed: true, 
            executed_at: new Date().toISOString() 
          })
          .eq('id', automation.id);

        if (updateError) {
          throw updateError;
        }

        results.push({ id: automation.id, success: true });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error processing automation ${automation.id}:`, error);
        results.push({ id: automation.id, success: false, error: errorMessage });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`Processed ${successCount}/${automations.length} automations successfully`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: automations.length,
        successful: successCount,
        results 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Process automations error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});