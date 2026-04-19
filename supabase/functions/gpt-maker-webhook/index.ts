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
    const rawContent = payload.message || payload.content || payload.text || ''
    let messageContent = typeof rawContent === 'string' ? rawContent.trim() : ''
    const senderPhone = payload.contactPhone || payload.phone || payload.from || ''
    const senderName = payload.contactName || payload.pushName || 'Desconhecido'
    const messageDate = payload.date ? new Date(payload.date).toISOString() : new Date().toISOString()
    const chatId = payload.contextId || null
    const assistantId = payload.assistantId || null
    const messageId = payload.messageId || null

    // 2b. Metadados de Enriquecimento (Fase 2 — Omnichannel)
    // GPT Maker envia estes campos no payload do webhook
    const profilePicture: string | null = payload.picture || payload.contactPicture || payload.profilePic || null
    const agentName: string | null = payload.agentName || payload.assistantName || null
    // Canal: conversationType (WHATSAPP, INSTAGRAM, WIDGET...) ou type do payload
    const rawChannel = payload.conversationType || payload.channelType || payload.platform || payload.source || payload.channel || payload.origin || null
    const channel: string = normalizeChannel(rawChannel, payload)
    console.log('[Webhook] Canal detectado:', channel, '| rawChannel:', rawChannel, '| conversationType:', payload.conversationType, '| platform:', payload.platform, '| source:', payload.source)

    // 3. Extrair dados de mídia do payload
    // GPT Maker pode enviar mídia em diferentes formatos
    let mediaUrl = payload.mediaUrl || payload.media?.url || payload.fileUrl || payload.audioUrl || payload.imageUrl || null
    let mediaType = normalizeMediaType(
      payload.mediaType || payload.media?.type || payload.type || payload.messageType || null,
      mediaUrl
    )

    // Fallback: Inferir mediaType a partir do texto (WPP default placeholders) e limpar texto inútil
    if (messageContent) {
        const lowerMsg = messageContent.toLowerCase();
        if (!mediaType) {
            if (lowerMsg.includes('[imagem') || lowerMsg.includes('foto')) mediaType = 'image';
            else if (lowerMsg.includes('[áudio') || lowerMsg.includes('[audio') || lowerMsg.includes('voz')) mediaType = 'audio';
            else if (lowerMsg.includes('[documento') || lowerMsg.includes('[arquivo') || lowerMsg.includes('[vídeo') || lowerMsg.includes('[video')) {
                 mediaType = (lowerMsg.includes('vídeo') || lowerMsg.includes('video')) ? 'video' : 'document';
            }
        }
        
        // Se temos mídia, limpar a string inútil '[Imagem Encaminhada]' para não poluir UI
        if (mediaUrl || mediaType) {
            if (messageContent === '[Imagem Encaminhada]' || 
                messageContent === '[Mensagem de voz]' || 
                messageContent === '[Mensagem de Voz]' || 
                messageContent === '[Áudio Encaminhado]' || 
                messageContent === '[Documento Anexo]' ||
                messageContent === '[Imagem]' ||
                messageContent === '[Áudio]') {
                messageContent = '';
            }
        }
    }
    
    console.log('[Webhook] Mídia detectada:', { mediaUrl, mediaType, cleanContent: messageContent })

    // 4. Ignorar mensagens vazias (mas permitir mensagens com mídia)
    // Relaxed check: senderPhone CAN be null/empty now, as long as we have chatId
    if ((!senderPhone && !chatId) || (!messageContent && !mediaUrl)) {
      console.log('[Webhook] Ignorando mensagem invalida (sem telefone/chatId ou vazia)')
      return new Response(JSON.stringify({ ignored: true, reason: 'invalid_payload' }), { 
        headers: corsHeaders, 
        status: 200 
      })
    }

    let senderType = 'customer'
    if (payload.role === 'assistant' || payload.fromMe === true) {
      senderType = 'agent'
      console.log(`[Webhook] Mensagem do agente/sistema (role: ${payload.role}, fromMe: ${payload.fromMe})`)
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
      // ── RETRY anti-race-condition ─────────────────────────────────────────
      // Quando mensagens chegam em sequência rápida, dois webhooks concorrentes
      // podem AMBOS chegar aqui sem encontrar o lead (a primeira INSERT ainda não
      // fez commit quando a segunda SELECT rodou). Esperamos 250ms e tentamos
      // novamente ANTES de criar, evitando leads duplicados para o mesmo contacto.
      await new Promise(resolve => setTimeout(resolve, 250))

      if (senderPhone) {
        const { data: retryByPhone } = await supabase
          .from('leads')
          .select('id, gpt_maker_chat_id, phone')
          .eq('phone', senderPhone)
          .eq('equipe_id', equipeId)
          .maybeSingle()
        if (retryByPhone) {
          lead = retryByPhone
          console.log('[Webhook] Lead encontrado no retry por telefone:', lead.id)
        }
      }

      if (!lead && chatId) {
        const { data: retryByChat } = await supabase
          .from('leads')
          .select('id, gpt_maker_chat_id, phone')
          .eq('gpt_maker_chat_id', chatId)
          .eq('equipe_id', equipeId)
          .maybeSingle()
        if (retryByChat) {
          lead = retryByChat
          console.log('[Webhook] Lead encontrado no retry por Chat ID:', lead.id)
        }
      }
    }

    if (!lead) {
      console.log('[Webhook] Lead não encontrado após retry, criando novo...')

      // Fallback name if missing
      const finalName = senderName || (senderPhone ? `Lead ${senderPhone}` : 'Novo Visitante')

      const { data: newLead, error: createError } = await supabase
        .from('leads')
        .insert({
          phone: senderPhone || null,
          name: finalName,
          equipe_id: equipeId,
          gpt_maker_chat_id: chatId,
          lead_type: 'lead',
          creation_source: 'ai_agent',
          source: 'IA',
          origem: 'IA',
          last_message_at: messageDate,
          // Fase 2: Enriquecimento omnichannel
          channel: channel,
          profile_picture: profilePicture,
          agent_name: agentName
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
      // Atualizar chat_id, last_message_at e metadados de enriquecimento se necessário
      const updates: Record<string, unknown> = { last_message_at: messageDate }
      
      // If we found by phone but lead has no chat_id, or chat_id changed
      if (chatId && lead.gpt_maker_chat_id !== chatId) {
        updates.gpt_maker_chat_id = chatId
      }
      
      // If we found by chat_id but now we have a phone (unlikely but possible merge)
      if (senderPhone && !lead.phone) {
        updates.phone = senderPhone
      }

      // Fase 2: Enriquecimento — atualizar metadados quando disponíveis
      if (profilePicture) updates.profile_picture = profilePicture
      if (agentName) updates.agent_name = agentName
      if (channel !== 'whatsapp' || !lead.gpt_maker_chat_id) {
        // Atualiza o canal sempre que recebemos info explícita
        updates.channel = channel
      }
      
      await supabase
        .from('leads')
        .update(updates)
        .eq('id', lead.id)
      
      console.log('[Webhook] Lead existente atualizado:', lead.id, '| channel:', channel)
    }

    if (!lead) throw new Error("Falha inesperada: Lead nulo após processamento");

    // 9b. EPIC 1 — Upsert conversation
    // Strategy: look for an existing conversation for (lead_id, channel) that is
    // not deleted. If archived, auto-reopen on new inbound (per product decision).
    let conversationId: string | null = null
    {
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id, status, gpt_maker_chat_id, agent_name, atendido_por_agente')
        .eq('lead_id', lead.id)
        .eq('channel', channel)
        .neq('status', 'deleted')
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()

      if (existingConv) {
        conversationId = existingConv.id
        const convUpdates: Record<string, unknown> = {
          last_message_at: messageDate,
        }
        // Auto-reopen archived on new inbound
        if (existingConv.status === 'archived') {
          convUpdates.status = 'active'
          convUpdates.archived_at = null
          console.log('[Webhook] Auto-reabrindo conversa arquivada:', conversationId)
        }
        if (chatId && existingConv.gpt_maker_chat_id !== chatId) {
          convUpdates.gpt_maker_chat_id = chatId
        }
        if (agentName && existingConv.agent_name !== agentName) {
          convUpdates.agent_name = agentName
        }
        await supabase
          .from('conversations')
          .update(convUpdates)
          .eq('id', conversationId)
      } else {
        const { data: newConv, error: convError } = await supabase
          .from('conversations')
          .insert({
            lead_id: lead.id,
            equipe_id: equipeId,
            channel,
            status: 'active',
            atendido_por_agente: false,
            agent_name: agentName,
            gpt_maker_chat_id: chatId,
            last_message_at: messageDate,
            unread_count: 0,
          })
          .select('id')
          .single()

        if (convError) {
          console.error('[Webhook] Erro ao criar conversa:', convError)
          throw convError
        }
        conversationId = newConv.id
        console.log('[Webhook] Nova conversa criada:', conversationId)
      }
    }

    // 10. Verificar duplicata ANTES de inserir
    // GPT Maker ecoa mensagens de volta causando duplicação.
    // O campo gpt_message_id NEM SEMPRE é preenchido (GPT Maker retorna {success:true} sem ID),
    // então a deduplicação por conteúdo é a linha de defesa principal.

    let skipInsert = false

    // ── DEDUPLICAÇÃO ROBUSTA ──
    // Verificação 1: por gpt_message_id (funciona quando GPT Maker retorna o ID)
    if (messageId) {
      const { data: existingById } = await supabase
        .from('messages')
        .select('id')
        .eq('gpt_message_id', messageId)
        .limit(1)
        .maybeSingle()

      if (existingById) {
        console.log('[Webhook] Dedup por gpt_message_id:', messageId)
        skipInsert = true
      }
    }

    // Verificação 2: por conteúdo + janela de tempo
    //
    // Para mensagens de AGENTE: 5 minutos — ecos do GPT Maker podem chegar com atraso.
    //   Busca em TODOS os sender_types (cobre eco com role errado).
    //
    // Para mensagens de CLIENTE: 60 segundos — janela suficiente para bloquear retries
    //   do GPT Maker (que ocorrem em segundos) mas permite que o cliente envie a mesma
    //   mensagem novamente após 1 minuto (ex: "ok", "sim", "obrigado").
    //   Busca apenas entre mensagens de clientes (evita falsos positivos cross-sender).
    if (!skipInsert) {
      const DEDUP_WINDOW_MS = senderType === 'agent' ? 300_000 : 60_000
      const cutoff = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString()
      const incomingContent = (messageContent || '').trim().toLowerCase()

      let recentQuery = supabase
        .from('messages')
        .select('id, content, created_at, media_url, sender_type')
        .eq('lead_id', lead.id)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(20)

      // Clientes: filtrar por sender_type para evitar falsos positivos
      if (senderType === 'customer') {
        recentQuery = recentQuery.eq('sender_type', 'customer')
      }
      // Agentes: sem filtro de sender_type — cobre eco com role errado

      const { data: recentMsgs } = await recentQuery

      if (recentMsgs && recentMsgs.length > 0) {
        for (const existing of recentMsgs) {
          const existingContent = (existing.content || '').trim().toLowerCase()

          // Match de texto: ambos com conteúdo igual OU ambos vazios (mídia pura)
          const textMatch = incomingContent
            ? existingContent === incomingContent
            : existingContent === ''

          // Match de mídia: URLs iguais (quando presente nos dois lados)
          const mediaMatch = mediaUrl && existing.media_url
            ? existing.media_url === mediaUrl
            : false

          if (textMatch || mediaMatch) {
            console.log('[Webhook] Dedup por conteúdo/mídia — ignorando duplicata:',
              existing.id, { textMatch, mediaMatch, senderType,
                snippet: incomingContent.substring(0, 60) })
            skipInsert = true
            break
          }
        }
      }
    }

    // 11. Salvar mensagem com dados de mídia (apenas se não for duplicata)
    if (!skipInsert) {
      const { error: msgError } = await supabase.from('messages').insert({
        lead_id: lead.id,
        conversation_id: conversationId,
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
        console.log('[Webhook] Mensagem salva com sucesso, sender_type:', senderType, 'media_type:', mediaType, 'conv:', conversationId)
      }
    }

    // 12. Incrementar contador de não lidos (apenas para mensagens do cliente E se não foi duplicata)
    if (senderType === 'customer' && !skipInsert) {
      // Epic 1: unread count now lives on the conversation
      if (conversationId) {
        const { error: convRpcError } = await supabase.rpc(
          'increment_conversation_unread_count',
          { conv_id: conversationId }
        )
        if (convRpcError) {
          console.error('[Webhook] Erro ao incrementar unread_count da conversa:', convRpcError)
        }
      }
      // Dual-write: keep lead-level unread in sync during transition
      const { error: rpcError } = await supabase.rpc('increment_unread_count', {
        row_id: lead.id
      })
      if (rpcError) {
        console.error('[Webhook] Erro ao incrementar unread_count (legado):', rpcError)
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

/**
 * Normaliza o canal de comunicação
 * GPT Maker retorna conversationType como: WHATSAPP, INSTAGRAM, WIDGET, TELEGRAM, etc.
 */
function normalizeChannel(raw: string | null, payload?: any): string {
  if (raw) {
    const lower = raw.toLowerCase()
    if (lower.includes('instagram')) return 'instagram'
    if (lower.includes('telegram')) return 'telegram'
    if (lower.includes('widget') || lower.includes('web')) return 'web'
    if (lower.includes('messenger') || lower.includes('facebook')) return 'messenger'
    if (lower.includes('whatsapp')) return 'whatsapp'
  }
  // Deep scan: check entire payload for channel hints
  if (payload) {
    const payloadStr = JSON.stringify(payload).toLowerCase()
    if (payloadStr.includes('instagram')) return 'instagram'
    if (payloadStr.includes('telegram')) return 'telegram'
    if (payloadStr.includes('messenger')) return 'messenger'
  }
  return 'whatsapp' // default
}
