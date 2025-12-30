import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const payload = await req.json()
    console.log('[Webhook] Recebido:', payload) // Log 1

    // 1. DADOS
    const messageContent = payload.message || payload.content || payload.text || ''
    const senderPhone = payload.contactPhone || payload.phone || payload.from || ''
    const senderName = payload.contactName || payload.pushName || 'Desconhecido'
    
    if (!senderPhone || !messageContent) {
      return new Response(JSON.stringify({ error: 'No data' }), { status: 200, headers: corsHeaders })
    }

    // 2. CONEXÃO COM BANCO (Admin)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 3. BUSCA/CRIA LEAD (Prioridade Máxima)
    let { data: lead } = await supabase.from('leads').select('id').eq('phone', senderPhone).maybeSingle()

    if (!lead) {
      const { data: newLead, error } = await supabase.from('leads').insert({
        phone: senderPhone,
        name: senderName,
        creation_source: 'ai_agent',
        lead_type: 'lead'
      }).select('id').single()
      
      if (error) {
        console.error('[Webhook] Erro ao criar lead:', error)
        // Se falhar criar lead, não tem como salvar mensagem. Retorna erro.
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders })
      }
      lead = newLead
    }

    // 4. SALVA MENSAGEM (Obrigatório aparecer no Chat)
    const { error: msgError } = await supabase.from('messages').insert({
      lead_id: lead.id,
      content: messageContent,
      sender_type: 'customer',
      created_at: payload.date ? new Date(payload.date).toISOString() : new Date().toISOString()
    })

    if (msgError) console.error('[Webhook] Erro Message:', msgError)

    // 5. GATILHO DA IA (Desacoplado)
    // Aqui usamos waitUntil. Se a IA falhar, o webhook JÁ salvou a mensagem e o lead.
    const aiUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/analyze-message`
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    EdgeRuntime.waitUntil(
      (async () => {
        try {
          console.log('[Webhook] Chamando IA...')
          const res = await fetch(aiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceKey}` // Autenticação Admin
            },
            body: JSON.stringify({
              lead_id: lead.id,
              message_content: messageContent,
              conversation_history: '' // Simplificado por enquanto
            })
          })
          const text = await res.text()
          console.log('[Webhook] Resposta IA:', res.status, text)
        } catch (e) {
          console.error('[Webhook] Falha ao chamar IA:', e)
        }
      })()
    )

    // 6. RESPOSTA FINAL (Sucesso)
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('[Webhook] CRASH:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
