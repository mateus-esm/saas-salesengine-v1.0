import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Tratamento de CORS
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Recebe dados do Frontend
    const { content, chat_id, lead_id, conversation_id, action, media_url, media_type, sender_id } = await req.json()
    const token = Deno.env.get('GPT_MAKER_TOKEN')

    // CENÁRIO 1: Botão Manual de Parar/Retomar Robô (Caso queira usar)
    if (action === 'take_control' || action === 'stop_control') {
      const endpoint = action === 'take_control' ? 'start-human' : 'stop-human'
      const url = `https://api.gptmaker.ai/v2/chat/${chat_id}/${endpoint}`

      await fetch(url, {
        method: 'PUT',
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
      })

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Epic 1: resolve conversation context. Prefer explicit conversation_id;
    // fall back to most-recent active conversation for the lead.
    let resolvedConversationId: string | null = conversation_id || null
    let resolvedLeadId: string | null = lead_id || null
    let resolvedChatId: string | null = chat_id || null

    if (resolvedConversationId && (!resolvedLeadId || !resolvedChatId)) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('id, lead_id, gpt_maker_chat_id')
        .eq('id', resolvedConversationId)
        .maybeSingle()
      if (conv) {
        resolvedLeadId = resolvedLeadId || conv.lead_id
        resolvedChatId = resolvedChatId || conv.gpt_maker_chat_id
      }
    } else if (!resolvedConversationId && resolvedLeadId) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('id, gpt_maker_chat_id')
        .eq('lead_id', resolvedLeadId)
        .neq('status', 'deleted')
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()
      if (conv) {
        resolvedConversationId = conv.id
        resolvedChatId = resolvedChatId || conv.gpt_maker_chat_id
      }
    }

    // CENÁRIO 2: Envio de Mensagem (A Mágica do Auto-Handover)
    // 1º Passo: Salvar no Banco IMEDIATAMENTE (Para a UI ficar rápida)
    const { data: msg, error: dbError } = await supabase
      .from('messages')
      .insert({
        lead_id: resolvedLeadId,
        conversation_id: resolvedConversationId,
        content,
        sender_type: 'agent',
        sender_id: sender_id || null,
        media_url: media_url || null,
        media_type: media_type || null
      })
      .select()
      .single()

    if (dbError) throw dbError

    // Bump conversation last_message_at
    if (resolvedConversationId) {
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', resolvedConversationId)
    }

    // Se não tiver chat_id (lead não sincronizado), paramos aqui
    if (!resolvedChatId) {
      return new Response(JSON.stringify(msg), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 2º Passo: AUTOMATICAMENTE Pausar o Robô (Start Human Mode)
    // Não esperamos o atendente pedir. Se ele falou, ele assumiu.
    try {
      await fetch(`https://api.gptmaker.ai/v2/chat/${resolvedChatId}/start-human`, {
        method: 'PUT',
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
      })
      console.log('Robô pausado automaticamente para o chat:', resolvedChatId)
    } catch (err) {
      console.error('Falha ao pausar robô (mas vamos enviar a mensagem mesmo assim):', err)
    }

    // 3º Passo: Enviar a mensagem para o WhatsApp do Cliente
    const body: Record<string, any> = {}
    if (content) body.message = content
    
    if (media_url) {
      // Extrai o nome do arquivo ignorando a hash de timestamp que colocamos antes do "_"
      const rawFileName = media_url.split('/').pop()?.split('?')[0] || 'documento';
      const cleanName = decodeURIComponent(rawFileName.includes('_') ? rawFileName.split('_').slice(1).join('_') : rawFileName);
      const lowerUrl = media_url.toLowerCase();

      if (media_type === 'image') {
        body.image = media_url
        body.fileName = cleanName
      } else if (media_type === 'audio') {
        // Sempre enviar como campo 'audio' com a URL pública do Supabase Storage.
        // O GPT Maker recebe a URL, faz download e repassa ao WhatsApp.
        // O campo correto conforme docs da API: { audio: "<URL>" }
        // Não usar 'document' pois o WhatsApp não aceita WebM como documento.
        body.audio = media_url
        // Nunca enviar 'message' junto com áudio pois a API do WPP recusa caption em voice note.
        delete body.message
      } else if (media_type === 'video') {
        body.video = media_url
        body.fileName = cleanName
      } else {
        body.document = media_url
        body.fileName = cleanName
      }
    }

    console.log('[SendMsg] Payload para GPT Maker:', JSON.stringify(body))
    console.log('[SendMsg] chat_id:', chat_id, '| media_type:', media_type, '| media_url:', media_url)

    const gptResponse = await fetch(`https://api.gptmaker.ai/v2/chat/${resolvedChatId}/send-message`, {
      method: 'POST',
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })

    const gptRawText = await gptResponse.text()
    console.log(`[SendMsg] GPT Maker status: ${gptResponse.status} | body: ${gptRawText}`)

    if (!gptResponse.ok) {
      console.error('[SendMsg] ERRO na entrega ao WhatsApp:', gptResponse.status, gptRawText)
    } else {
      // Captura o messageId do GPT Maker de forma resiliente
      try {
        const respData = JSON.parse(gptRawText)
        if (respData && respData.messageId) {
           await supabase.from('messages').update({ gpt_message_id: respData.messageId }).eq('id', msg.id)
           msg.gpt_message_id = respData.messageId // atualizar pra UI
        }
      } catch (err) {
        console.error('[SendMsg] Nao foi possivel extrair messageId do GPT Maker', err)
      }
    }

    return new Response(JSON.stringify(msg), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
