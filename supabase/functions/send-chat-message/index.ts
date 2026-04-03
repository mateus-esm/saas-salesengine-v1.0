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
    const { content, chat_id, lead_id, action, media_url, media_type } = await req.json()
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

    // CENÁRIO 2: Envio de Mensagem (A Mágica do Auto-Handover)
    // 1º Passo: Salvar no Banco IMEDIATAMENTE (Para a UI ficar rápida)
    const { data: msg, error: dbError } = await supabase
      .from('messages')
      .insert({
        lead_id,
        content,
        sender_type: 'agent',
        media_url: media_url || null,
        media_type: media_type || null
      })
      .select()
      .single()

    if (dbError) throw dbError

    // Se não tiver chat_id (lead não sincronizado), paramos aqui
    if (!chat_id) {
      return new Response(JSON.stringify(msg), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 2º Passo: AUTOMATICAMENTE Pausar o Robô (Start Human Mode)
    // Não esperamos o atendente pedir. Se ele falou, ele assumiu.
    try {
      await fetch(`https://api.gptmaker.ai/v2/chat/${chat_id}/start-human`, {
        method: 'PUT',
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
      })
      console.log('Robô pausado automaticamente para o chat:', chat_id)
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
        // WhatsApp rejeita áudio WebM como voice note (PTT).
        // Se o arquivo é .webm, enviar como document (arquivo) que chega como playable.
        // Se é .ogg/.mp3/.aac, enviar como audio nativo (voice note).
        const isWebm = lowerUrl.includes('.webm');
        if (isWebm) {
          console.log('[SendMsg] Áudio WebM detectado, enviando como document (fallback WPP)')
          body.document = media_url
          body.fileName = cleanName
        } else {
          body.audio = media_url
        }
        // Nunca enviar 'message' junto com áudio/voice note pois a API de WPP recusa com caption
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

    const gptResponse = await fetch(`https://api.gptmaker.ai/v2/chat/${chat_id}/send-message`, {
      method: 'POST',
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })

    if (!gptResponse.ok) {
      console.error('Erro ao entregar no WhatsApp:', await gptResponse.text())
      // Opcional: Atualizar status da mensagem no banco para 'failed'
    } else {
      // Captura o messageId do GPT Maker de forma resiliente
      try {
        const respData = await gptResponse.json()
        if (respData && respData.messageId) {
           await supabase.from('messages').update({ gpt_message_id: respData.messageId }).eq('id', msg.id)
           msg.gpt_message_id = respData.messageId // atualizar pra UI
        }
      } catch (err) {
        console.error('Nao foi possivel extrair messageId do GPT Maker', err)
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
