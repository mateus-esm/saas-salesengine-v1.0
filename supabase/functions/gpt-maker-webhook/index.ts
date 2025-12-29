import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    console.log('[Webhook] Payload recebido:', JSON.stringify(payload))

    // 1. Extração de Dados (Compatível com GPT Maker / Evolution / Z-API)
    // Adapte estes campos conforme o payload real do seu gateway
    const messageContent = payload.message || payload.content || payload.text || ''
    const senderName = payload.contactName || payload.pushName || 'Desconhecido'
    const senderPhone = payload.contactPhone || payload.phone || payload.from || ''
    const chatId = payload.contextId || payload.chatId || payload.id || ''
    
    // Normalização da data (Usa a data da mensagem ou agora)
    const messageDate = payload.date || payload.timestamp 
      ? new Date(payload.date || payload.timestamp).toISOString() 
      : new Date().toISOString()

    // Validação básica
    if (!senderPhone || !messageContent) {
      console.log('[Webhook] Payload ignorado: Sem telefone ou mensagem.')
      return new Response(JSON.stringify({ message: 'Ignored' }), { headers: corsHeaders, status: 200 })
    }

    // Inicializa Supabase Admin (Service Role)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 2. Gestão de Identidade do Lead (Upsert)
    // Busca ou Cria o Lead
    let { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('phone', senderPhone)
      .maybeSingle()

    if (leadError) {
      console.error('[Webhook] Erro ao buscar lead:', leadError)
      throw leadError
    }

    if (!lead) {
      console.log('[Webhook] Criando novo Lead (Source: AI Agent)...')
      const { data: newLead, error: createError } = await supabase
        .from('leads')
        .insert({
          name: senderName,
          phone: senderPhone,
          lead_type: 'lead', // Padrão inicial
          creation_source: 'ai_agent', // <--- FORÇA A IDENTIDADE CORRETA
          last_message_at: messageDate,
          gpt_maker_chat_id: chatId // Salva ID externo para referência
        })
        .select()
        .single()

      if (createError) {
        console.error('[Webhook] Erro ao criar lead:', createError)
        throw createError
      }
      lead = newLead
    } else {
      // Atualiza timestamp se lead já existe
      await supabase
        .from('leads')
        .update({ 
          last_message_at: messageDate,
          name: lead.name === 'Desconhecido' ? senderName : lead.name // Atualiza nome se possível
        })
        .eq('id', lead.id)
    }

    // 3. Salvar Mensagem no Histórico
    const { error: msgError } = await supabase
      .from('messages')
      .insert({
        lead_id: lead.id,
        content: messageContent,
        sender_type: 'customer', // Sempre customer aqui
        created_at: messageDate, // <--- DATA CORRETA (Corrige ordem do chat)
        gpt_maker_id: payload.messageId || null
      })

    if (msgError) console.error('[Webhook] Erro ao salvar mensagem:', msgError)

    // 4. Buscar Histórico Recente para Contexto da IA
    // Pegamos as últimas 10 mensagens para dar contexto
    const { data: historyData } = await supabase
      .from('messages')
      .select('sender_type, content, created_at')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .limit(10)

    // Formata histórico cronológico (mais antigo -> mais novo)
    const conversationHistory = historyData
      ? historyData.reverse().map(m => `${m.sender_type === 'customer' ? 'Cliente' : 'Atendente'}: ${m.content}`).join('\n')
      : ''

    // 5. GATILHO DA INTELIGÊNCIA ARTIFICIAL (A Correção Crítica)
    console.log(`[Webhook] Disparando IA para Lead: ${lead.id}`)

    const aiPayload = {
      lead_id: lead.id,
      message_content: messageContent,
      conversation_history: conversationHistory
    }

    // EdgeRuntime.waitUntil mantem o processo vivo em background
    EdgeRuntime.waitUntil(
      fetch(`${supabaseUrl}/functions/v1/analyze-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // 👇 AQUI ESTÁ A CHAVE QUE FALTAVA PARA O ERRO 401 👇
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify(aiPayload)
      })
      .then(async res => {
        if (!res.ok) {
          const txt = await res.text()
          console.error(`[Webhook] ❌ ERRO AO ACIONAR IA: ${res.status} - ${txt}`)
        } else {
          console.log(`[Webhook] ✅ IA acionada com sucesso (Status: ${res.status})`)
        }
      })
      .catch(err => {
        console.error(`[Webhook] 🚨 FALHA DE REDE/FETCH DA IA:`, err)
      })
    )

    // Retorna 200 OK imediatamente para o WhatsApp/Gateway não ficar travado
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('[Webhook] Erro Fatal:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
