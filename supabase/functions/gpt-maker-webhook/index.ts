import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// 1. Correção de Build: Declaração Global
declare const EdgeRuntime: {
  waitUntil: (promise: Promise<any>) => void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const payload = await req.json()
    console.log('[Webhook] Recebido:', payload)

    // Normalização de Dados
    const messageContent = payload.message || payload.content || payload.text || ''
    const senderPhone = payload.contactPhone || payload.phone || payload.from || ''
    const senderName = payload.contactName || payload.pushName || 'Desconhecido'
    const messageDate = payload.date ? new Date(payload.date).toISOString() : new Date().toISOString()

    if (!senderPhone || !messageContent) {
      return new Response(JSON.stringify({ ignored: true }), { headers: corsHeaders, status: 200 })
    }

    // Inicializa Supabase Admin
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Upsert Lead
    let { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id')
      .eq('phone', senderPhone)
      .maybeSingle()

    if (leadError) throw leadError

    if (!lead) {
      const { data: newLead, error: createError } = await supabase
        .from('leads')
        .insert({
          phone: senderPhone,
          name: senderName,
          lead_type: 'lead',
          creation_source: 'ai_agent',
          last_message_at: messageDate
        })
        .select('id')
        .single()

      if (createError) throw createError
      lead = newLead
    }

    // Salva Mensagem
    const { error: msgError } = await supabase.from('messages').insert({
      lead_id: lead.id,
      content: messageContent,
      sender_type: 'customer',
      created_at: messageDate
    })
    if (msgError) console.error('[Webhook] Erro msg:', msgError)

    // DISPARO DA IA (Background)
    if (lead) {
      const aiUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/analyze-message`
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

      // O waitUntil garante que este fetch rode mesmo após o return
      EdgeRuntime.waitUntil(
        fetch(aiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}` // <--- A CHAVE DO SUCESSO
          },
          body: JSON.stringify({
            lead_id: lead.id,
            message_content: messageContent,
            conversation_history: ''
          })
        }).then(async res => {
          if (!res.ok) {
            const text = await res.text();
            console.error('[Webhook] Falha IA:', res.status, text);
          } else {
            console.log('[Webhook] IA Disparada com sucesso');
          }
        }).catch(err => console.error('[Webhook] Erro Fetch IA:', err))
      )
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    // 2. Correção de Build: Tipagem do Erro
    const errorMessage = (error as Error).message
    console.error('[Webhook] Erro Fatal:', errorMessage)
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
