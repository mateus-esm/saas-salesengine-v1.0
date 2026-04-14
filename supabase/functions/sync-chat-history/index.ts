import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { lead_id, chat_id } = await req.json()
    const token = Deno.env.get('GPT_MAKER_TOKEN')

    // 1. Busca histórico na API do GPT Maker
    const url = `https://api.gptmaker.ai/v2/chat/${chat_id}/messages?limit=50`

    const response = await fetch(url, {
      method: 'GET',
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
    })

    if (!response.ok) {
      console.error("Erro API GPT Maker:", await response.text());
      throw new Error('Failed to fetch history');
    }

    const externalMessages = await response.json();
    const messagesArray = Array.isArray(externalMessages) ? externalMessages : (externalMessages.messages || []);

    let savedCount = 0

    for (const msg of messagesArray) {
      let content = msg.text
      let mediaUrl: string | null = null
      let mediaType: string | null = null

      if (msg.imageUrl) {
        mediaUrl = msg.imageUrl; mediaType = 'image'; content = content || ''
      } else if (msg.audioUrl) {
        mediaUrl = msg.audioUrl; mediaType = 'audio'; content = content || ''
      } else if (msg.documentUrl) {
        mediaUrl = msg.documentUrl; mediaType = 'document'; content = content || ''
      }

      if (!content && !mediaUrl) continue

      const senderType = (msg.role === 'user' || msg.role === 'customer') ? 'customer' : 'agent'
      const externalId: string | null = msg.id || null
      const msgTime = msg.time ? new Date(msg.time) : new Date()
      const messageDate = msgTime.toISOString()
      const trimmedContent = (content || '').trim()

      // ── DEDUPLICAÇÃO EM DUAS CAMADAS ──────────────────────────────────────
      //
      // Camada 1: por gpt_message_id exacto
      // Cobre: webhook já inseriu, ou sync anterior já correu
      if (externalId) {
        const { data: existingById } = await supabase
          .from('messages')
          .select('id')
          .eq('lead_id', lead_id)
          .eq('gpt_message_id', externalId)
          .maybeSingle()

        if (existingById) {
          savedCount++
          continue
        }
      }

      // Camada 2: por conteúdo + sender_type + janela de ±30 s
      // Cobre o caso crítico: mensagem do agente inserida via send-chat-message
      // com gpt_message_id=null — não é detectada pela Camada 1.
      const windowStart = new Date(msgTime.getTime() - 30_000).toISOString()
      const windowEnd   = new Date(msgTime.getTime() + 30_000).toISOString()

      let existingId: string | null = null
      let existingHasGptId: boolean = false

      if (trimmedContent) {
        const { data } = await supabase
          .from('messages')
          .select('id, gpt_message_id')
          .eq('lead_id', lead_id)
          .eq('sender_type', senderType)
          .eq('content', trimmedContent)
          .gte('created_at', windowStart)
          .lte('created_at', windowEnd)
          .limit(1)
          .maybeSingle() as { data: { id: string; gpt_message_id: string | null } | null }

        if (data) {
          existingId = data.id
          existingHasGptId = !!data.gpt_message_id
        }
      } else if (mediaUrl) {
        const { data } = await supabase
          .from('messages')
          .select('id, gpt_message_id')
          .eq('lead_id', lead_id)
          .eq('sender_type', senderType)
          .eq('media_url', mediaUrl)
          .gte('created_at', windowStart)
          .lte('created_at', windowEnd)
          .limit(1)
          .maybeSingle() as { data: { id: string; gpt_message_id: string | null } | null }

        if (data) {
          existingId = data.id
          existingHasGptId = !!data.gpt_message_id
        }
      }

      if (existingId) {
        // Patch: se o row existente ainda não tem gpt_message_id, aproveita e actualiza
        if (externalId && !existingHasGptId) {
          await supabase
            .from('messages')
            .update({ gpt_message_id: externalId })
            .eq('id', existingId)
          console.log('[Sync] Patched gpt_message_id em row existente:', existingId, '→', externalId)
        }
        savedCount++
        continue
      }

      // ── INSERT (mensagem genuinamente nova) ───────────────────────────────
      const { error } = await supabase.from('messages').insert({
        lead_id,
        content,
        sender_type: senderType,
        gpt_message_id: externalId,
        created_at: messageDate,
        media_url: mediaUrl,
        media_type: mediaType
      })

      if (!error) {
        savedCount++
        console.log('[Sync] Nova mensagem inserida:', externalId || 'no-id', senderType)
      } else {
        console.error('[Sync] Erro ao inserir:', error.message)
      }
    }

    return new Response(JSON.stringify({ success: true, synced: savedCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Sync Error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
