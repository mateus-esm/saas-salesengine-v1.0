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

    const { lead_id, chat_id, conversation_id } = await req.json()
    const token = Deno.env.get('GPT_MAKER_TOKEN')

    // Epic 1: resolve conversation + lead. If only conversation_id is given,
    // look up lead_id and chat_id from the conversation row.
    let resolvedLeadId: string | null = lead_id || null
    let resolvedConversationId: string | null = conversation_id || null
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
        .select('id')
        .eq('lead_id', resolvedLeadId)
        .neq('status', 'deleted')
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()
      if (conv) resolvedConversationId = conv.id
    }

    if (!resolvedChatId) {
      return new Response(JSON.stringify({ error: 'chat_id não encontrado' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // 1. Busca histórico na API do GPT Maker
    const url = `https://api.gptmaker.ai/v2/chat/${resolvedChatId}/messages?limit=50`
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
    })

    if (!response.ok) {
       console.error("Erro API GPT Maker:", await response.text());
       throw new Error('Failed to fetch history');
    }

    const externalMessages = await response.json();
    
    // Validação: Garante que é um array (conforme o payload real)
    const messagesArray = Array.isArray(externalMessages) ? externalMessages : (externalMessages.messages || []);

    let savedCount = 0

    // 2. Loop Adaptado ao Payload Real
    // GPT Maker list-messages may return arrays (images[], audios[], documents[], videos[])
    // OR legacy singular fields (imageUrl, audioUrl, documentUrl). Handle both.
    const extractFirstUrl = (arr: unknown): string | null => {
      if (!Array.isArray(arr) || arr.length === 0) return null
      const first = arr[0]
      if (typeof first === 'string') return first
      if (first && typeof first === 'object') {
        const o = first as Record<string, unknown>
        return (o.url as string) || (o.fileUrl as string) || (o.href as string) || null
      }
      return null
    }

    for (const msg of messagesArray) {
        let content = msg.text ?? msg.message ?? '';

        let mediaUrl: string | null = null;
        let mediaType: string | null = null;

        if (Array.isArray(msg.images) && msg.images.length > 0) {
            mediaUrl = extractFirstUrl(msg.images); mediaType = 'image';
        } else if (Array.isArray(msg.audios) && msg.audios.length > 0) {
            mediaUrl = extractFirstUrl(msg.audios); mediaType = 'audio';
        } else if (Array.isArray(msg.documents) && msg.documents.length > 0) {
            mediaUrl = extractFirstUrl(msg.documents); mediaType = 'document';
        } else if (Array.isArray(msg.videos) && msg.videos.length > 0) {
            mediaUrl = extractFirstUrl(msg.videos); mediaType = 'video';
        } else if (msg.imageUrl) {
            mediaUrl = msg.imageUrl; mediaType = 'image';
        } else if (msg.audioUrl) {
            mediaUrl = msg.audioUrl; mediaType = 'audio';
        } else if (msg.documentUrl) {
            mediaUrl = msg.documentUrl; mediaType = 'document';
        } else if (msg.videoUrl) {
            mediaUrl = msg.videoUrl; mediaType = 'video';
        }

        if (!content && !mediaUrl) continue;

        const senderType = (msg.role === 'user' || msg.role === 'customer') ? 'customer' : 'agent';
        const externalId = msg.id;
        const messageDate = msg.time ? new Date(msg.time).toISOString() : new Date().toISOString();

        if (!externalId) continue;

        // ── Anti-duplicação contra linha já escrita pelo send-chat-message ──
        // send-chat-message insere a linha com sender_id preenchido mas, quando
        // o GPT Maker responde apenas com {success:true} (sem messageId), a linha
        // fica com gpt_message_id NULL. Sem essa checagem, o upsert abaixo (que
        // resolve conflito só por gpt_message_id) insere uma SEGUNDA linha —
        // exibida como "Solo AI" porque não tem sender_id. Procuramos a linha
        // outbound correspondente e apenas preenchemos o gpt_message_id ausente.
        if (senderType === 'agent') {
          const msgTimeMs = new Date(messageDate).getTime()
          const windowStart = new Date(msgTimeMs - 120_000).toISOString()
          const windowEnd = new Date(msgTimeMs + 120_000).toISOString()

          let outboundQuery = supabase
            .from('messages')
            .select('id, content, media_url, media_type, gpt_message_id, sender_id, created_at')
            .eq('sender_type', 'agent')
            .not('sender_id', 'is', null)
            .is('gpt_message_id', null)
            .gte('created_at', windowStart)
            .lte('created_at', windowEnd)

          if (resolvedConversationId) {
            outboundQuery = outboundQuery.eq('conversation_id', resolvedConversationId)
          } else if (resolvedLeadId) {
            outboundQuery = outboundQuery.eq('lead_id', resolvedLeadId)
          }

          const { data: outboundCandidates } = await outboundQuery

          const match = (outboundCandidates || []).find((row) => {
            const contentEq = (row.content || '').trim().toLowerCase() === content.trim().toLowerCase()
            // Media-only echo: conteúdo vazio de ambos lados, mesmo tipo.
            const mediaEq = !!mediaUrl && !!row.media_url && row.media_type === mediaType
            return contentEq || mediaEq
          })

          if (match) {
            await supabase
              .from('messages')
              .update({ gpt_message_id: externalId })
              .eq('id', match.id)
            console.log('[SyncHistory] Outbound healed (gpt_message_id attached):', match.id, '→', externalId)
            savedCount++
            continue
          }
        }

        // Upsert padrão: cria se novo, atualiza media_url/media_type se já existia
        // com mesmo gpt_message_id (cenário de heal pós-array-fix).
        const { error } = await supabase.from('messages').upsert({
            lead_id: resolvedLeadId,
            conversation_id: resolvedConversationId,
            content: content,
            sender_type: senderType,
            gpt_message_id: externalId,
            created_at: messageDate,
            media_url: mediaUrl,
            media_type: mediaType
        }, {
            onConflict: 'gpt_message_id',
            ignoreDuplicates: false
        })

        if (!error) savedCount++
    }

    // 3. Fase 2 — Enriquecimento de metadados do chat
    // Busca picture, agentName e channel do GPT Maker e persiste no Supabase
    // Usa o endpoint de detalhe do chat (faz parte da API list-chats mas com ID específico)
    try {
      // Tentar endpoint de detalhe primeiro; se não existir, usar list-chats filtrado
      const chatMetaUrl = `https://api.gptmaker.ai/v2/chat/${resolvedChatId}`
      const chatMetaRes = await fetch(chatMetaUrl, {
        method: 'GET',
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
      })

      let chatMeta: Record<string, unknown> | null = null

      if (chatMetaRes.ok) {
        chatMeta = await chatMetaRes.json()
      }

      if (chatMeta) {
        const enrichment: Record<string, unknown> = {}

        if (chatMeta.picture) enrichment.profile_picture = chatMeta.picture
        if (chatMeta.agentName) enrichment.agent_name = chatMeta.agentName
        if (chatMeta.conversationType || chatMeta.type) {
          enrichment.channel = normalizeChannel(
            (chatMeta.conversationType || chatMeta.type) as string
          )
        }

        if (Object.keys(enrichment).length > 0 && resolvedLeadId) {
          await supabase.from('leads').update(enrichment).eq('id', resolvedLeadId)
          console.log('[SyncHistory] Lead enriquecido com metadados:', enrichment)
        }

        // Epic 1: mirror channel/agent_name onto the conversation row too
        if (resolvedConversationId) {
          const convEnrichment: Record<string, unknown> = {}
          if (enrichment.channel) convEnrichment.channel = enrichment.channel
          if (enrichment.agent_name) convEnrichment.agent_name = enrichment.agent_name
          if (Object.keys(convEnrichment).length > 0) {
            await supabase
              .from('conversations')
              .update(convEnrichment)
              .eq('id', resolvedConversationId)
          }
        }
      }
    } catch (enrichErr) {
      // Não falha o sync principal se o enriquecimento falhar
      console.warn('[SyncHistory] Erro no enriquecimento (ignorado):', enrichErr)
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

/**
 * Normaliza o canal de comunicação
 * GPT Maker: WHATSAPP, INSTAGRAM, WIDGET, TELEGRAM, etc.
 */
function normalizeChannel(raw: string): string {
  const lower = raw.toLowerCase()
  if (lower.includes('instagram')) return 'instagram'
  if (lower.includes('telegram')) return 'telegram'
  if (lower.includes('widget') || lower.includes('web')) return 'web'
  if (lower.includes('messenger') || lower.includes('facebook')) return 'messenger'
  return 'whatsapp'
}
