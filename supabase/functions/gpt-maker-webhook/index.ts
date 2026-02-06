import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

declare const EdgeRuntime: {
  waitUntil: (promise: Promise<void>) => void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const payload = await req.json()
    console.log('[Webhook] Recebido:', JSON.stringify(payload, null, 2))

    // 1. Ignorar mensagens de ferramentas (logs internos do agente)
    if (payload.role === 'tool') {
      console.log('[Webhook] Ignorando mensagem tool (log interno)')
      return new Response(JSON.stringify({ ignored: true, reason: 'tool_message' }), { 
        headers: corsHeaders, 
        status: 200 
      })
    }

    // 2. Normalização de Dados
    const messageContent = payload.message || payload.content || payload.text || ''
    const senderPhone = payload.contactPhone || payload.phone || payload.from || ''
    const senderName = payload.contactName || payload.pushName || 'Desconhecido'
    const messageDate = payload.date ? new Date(payload.date).toISOString() : new Date().toISOString()
    const chatId = payload.contextId || null
    const assistantId = payload.assistantId || null
    const messageId = payload.messageId || null

    // 3. Extrair dados de mídia do payload
    // GPT Maker pode enviar mídia em diferentes formatos
    const mediaUrl = payload.mediaUrl || payload.media?.url || payload.fileUrl || payload.audioUrl || payload.imageUrl || null
    const mediaType = normalizeMediaType(
      payload.mediaType || payload.media?.type || payload.type || payload.messageType || null,
      mediaUrl
    )
    
    console.log('[Webhook] Mídia detectada:', { mediaUrl, mediaType })

    // 4. Ignorar mensagens vazias (mas permitir mensagens com mídia)
    // Relaxed check: senderPhone CAN be null/empty now, as long as we have chatId
    if ((!senderPhone && !chatId) || (!messageContent && !mediaUrl)) {
      console.log('[Webhook] Ignorando mensagem invalida (sem telefone/chatId ou vazia)')
      return new Response(JSON.stringify({ ignored: true, reason: 'invalid_payload' }), { 
        headers: corsHeaders, 
        status: 200 
      })
    }

    // 5. Mapear sender_type corretamente baseado no role
    let senderType = 'customer'
    if (payload.role === 'assistant') {
      senderType = 'agent'
      console.log('[Webhook] Mensagem do agente IA')
    } else {
      console.log('[Webhook] Mensagem do cliente')
    }

    // 6. Inicializa Supabase Admin
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 7. Buscar equipe pelo assistantId (gpt_maker_agent_id)
    let equipeId: string | null = null
    let isAgentEnabled = false

    if (assistantId) {
      const { data: equipe, error: equipeError } = await supabase
        .from('equipes')
        .select('id, is_crm_agent_enabled')
        .eq('gpt_maker_agent_id', assistantId)
        .maybeSingle()
      
      if (equipeError) {
        console.error('[Webhook] Erro ao buscar equipe:', equipeError)
      }
      equipeId = equipe?.id || null
      isAgentEnabled = equipe?.is_crm_agent_enabled || false
      console.log('[Webhook] Equipe encontrada:', equipeId, 'Agent Enabled:', isAgentEnabled)
    }

    if (!equipeId) {
      console.error('[Webhook] Equipe não encontrada para assistantId:', assistantId)
      return new Response(JSON.stringify({ 
        error: 'Equipe não encontrada',
        assistantId: assistantId 
      }), { 
        headers: corsHeaders, 
        status: 400 
      })
    }

    // 8. Buscar lead existente
    // Strategy: 
    // - Try by phone AND equipe_id first (if phone exists)
    // - If not found (or no phone), try by gpt_maker_chat_id AND equipe_id
    let lead: { id: string; gpt_maker_chat_id: string | null; phone: string | null } | null = null
    
    if (senderPhone) {
      const { data: leadByPhone } = await supabase
        .from('leads')
        .select('id, gpt_maker_chat_id, phone')
        .eq('phone', senderPhone)
        .eq('equipe_id', equipeId)
        .maybeSingle()
      
      if (leadByPhone) {
        lead = leadByPhone
        console.log('[Webhook] Lead encontrado por telefone:', lead.id)
      }
    }

    if (!lead && chatId) {
      const { data: leadByChat } = await supabase
        .from('leads')
        .select('id, gpt_maker_chat_id, phone')
        .eq('gpt_maker_chat_id', chatId)
        .eq('equipe_id', equipeId)
        .maybeSingle()
      
      if (leadByChat) {
        lead = leadByChat
        console.log('[Webhook] Lead encontrado por Chat ID:', lead.id)
      }
    }

    // 9. Criar novo lead se não existir
    if (!lead) {
      console.log('[Webhook] Lead não encontrado, criando novo...')
      
      // Fallback name if missing
      const finalName = senderName || (senderPhone ? `Lead ${senderPhone}` : 'Novo Visitante')
      
      const { data: newLead, error: createError } = await supabase
        .from('leads')
        .insert({
          phone: senderPhone || null, // Can be null now
          name: finalName,
          equipe_id: equipeId,
          gpt_maker_chat_id: chatId,
          lead_type: 'lead',
          creation_source: 'ai_agent',
          source: 'IA',
          origem: 'IA',
          last_message_at: messageDate
        })
        .select('id, gpt_maker_chat_id, phone')
        .single()

      if (createError) {
        console.error('[Webhook] Erro ao criar lead:', createError)
        throw createError
      }
      lead = newLead
      console.log('[Webhook] Novo lead criado:', lead.id)
    } else {
      // Atualizar chat_id e last_message_at se necessário
      const updates: Record<string, unknown> = { last_message_at: messageDate }
      
      // If we found by phone but lead has no chat_id, or chat_id changed
      if (chatId && lead.gpt_maker_chat_id !== chatId) {
        updates.gpt_maker_chat_id = chatId
      }
      
      // If we found by chat_id but now we have a phone (unlikely but possible merge)
      if (senderPhone && !lead.phone) {
        updates.phone = senderPhone
      }
      
      await supabase
        .from('leads')
        .update(updates)
        .eq('id', lead.id)
      
      console.log('[Webhook] Lead existente atualizado:', lead.id)
    }

    if (!lead) throw new Error("Falha inesperada: Lead nulo após processamento");

    // 10. Verificar duplicata ANTES de inserir
    // Mensagens de agente enviadas pelo Chat UI já foram salvas pelo send-chat-message
    // GPT Maker ecoa essas mensagens de volta, causando duplicação

    let skipInsert = false

    if (senderType === 'agent') {
      // Verifica se já existe mensagem similar nos últimos 30 segundos
      const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString()

      const { data: existingMsg } = await supabase
        .from('messages')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('sender_type', 'agent')
        .eq('content', messageContent)
        .gte('created_at', thirtySecondsAgo)
        .limit(1)
        .maybeSingle()

      if (existingMsg) {
        console.log('[Webhook] Mensagem de agente duplicada detectada, ignorando:', existingMsg.id)
        skipInsert = true
      }
    }

    // Também verifica por gpt_message_id se disponível
    if (!skipInsert && messageId) {
      const { data: existingById } = await supabase
        .from('messages')
        .select('id')
        .eq('gpt_message_id', messageId)
        .limit(1)
        .maybeSingle()

      if (existingById) {
        console.log('[Webhook] Mensagem com mesmo gpt_message_id já existe, ignorando:', messageId)
        skipInsert = true
      }
    }

    // 11. Salvar mensagem com dados de mídia (apenas se não for duplicata)
    if (!skipInsert) {
      const { error: msgError } = await supabase.from('messages').insert({
        lead_id: lead.id,
        content: messageContent,
        sender_type: senderType,
        gpt_message_id: messageId,
        media_url: mediaUrl,
        media_type: mediaType,
        created_at: messageDate
      })

      if (msgError) {
        console.error('[Webhook] Erro ao salvar mensagem:', msgError)
      } else {
        console.log('[Webhook] Mensagem salva com sucesso, sender_type:', senderType, 'media_type:', mediaType)
      }
    }

    // 12. Incrementar contador de não lidos (apenas para mensagens do cliente E se não foi duplicata)
    if (senderType === 'customer' && !skipInsert) {
      const { error: rpcError } = await supabase.rpc('increment_unread_count', {
        row_id: lead.id
      })
      if (rpcError) {
        console.error('[Webhook] Erro ao incrementar unread_count:', rpcError)
      }
    }

    // 13. Disparar IA em background (apenas para mensagens NOVAS do cliente e se agente estiver ativo)
    if (lead && senderType === 'customer' && !skipInsert) {
      if (!isAgentEnabled) {
        console.log('[Webhook] Agente CRM desativado para esta equipe. Ignorando análise IA.')
      } else {
        const aiUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/analyze-message`
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

        EdgeRuntime.waitUntil(
          fetch(aiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceKey}`
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
    }

    return new Response(JSON.stringify({ success: true, lead_id: lead.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    const errorMessage = (error as Error).message
    console.error('[Webhook] Erro Fatal:', errorMessage)
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

/**
 * Normaliza o tipo de mídia para valores conhecidos
 */
function normalizeMediaType(type: string | null, url: string | null): string | null {
  if (!type && !url) return null
  
  // Se tem tipo definido, normaliza
  if (type) {
    const lowerType = type.toLowerCase()
    if (lowerType.includes('image') || lowerType === 'photo') return 'image'
    if (lowerType.includes('audio') || lowerType === 'voice' || lowerType === 'ptt') return 'audio'
    if (lowerType.includes('video')) return 'video'
    if (lowerType.includes('document') || lowerType.includes('file')) return 'document'
  }
  
  // Tenta inferir pelo URL
  if (url) {
    const lowerUrl = url.toLowerCase()
    if (/\.(jpg|jpeg|png|gif|webp|svg)/.test(lowerUrl)) return 'image'
    if (/\.(mp3|wav|ogg|opus|m4a|aac)/.test(lowerUrl)) return 'audio'
    if (/\.(mp4|webm|mov|avi)/.test(lowerUrl)) return 'video'
    if (/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt)/.test(lowerUrl)) return 'document'
  }
  
  return null
}
