import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const payload = await req.json();
    console.log('Webhook Payload:', JSON.stringify(payload));

    // 1. Validação Básica
    if (!payload.agent_id) throw new Error('agent_id is required');

    // 2. Identificar a Equipe pelo Agente
    const { data: equipe } = await supabase
      .from('equipes')
      .select('id, nome')
      .eq('gpt_maker_agent_id', payload.agent_id)
      .single();

    if (!equipe) throw new Error('Agent ID não vinculado a nenhuma equipe');

    // 3. Identificar ou Criar o Lead (UPSERT pelo Telefone)
    const phone = payload.telefone || payload.phone;
    const name = payload.nome || payload.name || 'Lead WhatsApp';

    // Tenta buscar lead existente
    let { data: lead } = await supabase
      .from('leads')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();

    if (!lead) {
      // Se não existe, cria
      const { data: newLead, error: createError } = await supabase
        .from('leads')
        .insert({
          equipe_id: equipe.id,
          name: name,
          phone: phone,
          email: payload.email || null,
          source: 'whatsapp_bot',
          last_message_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) throw createError;
      lead = newLead;
    } else {
      // Se existe, atualiza o timestamp
      await supabase.from('leads').update({ last_message_at: new Date().toISOString() }).eq('id', lead.id);
    }

    // 4. Salvar a Mensagem no Chat (CRUCIAL PARA O REALTIME)
    const messageContent = payload.mensagem || payload.message;
    if (messageContent) {
      const { error: msgError } = await supabase.from('messages').insert({
        lead_id: lead.id,
        content: messageContent,
        sender_type: 'customer', // Veio do cliente
        status: 'delivered'
      });
      if (msgError) console.error('Erro ao salvar mensagem:', msgError);
    }

    return new Response(JSON.stringify({ success: true, lead_id: lead.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error('Webhook Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
