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
    for (const msg of messagesArray) {
        let content = msg.text;
        
        let mediaUrl = null;
        let mediaType = null;
        
        if (msg.imageUrl) {
            mediaUrl = msg.imageUrl;
            mediaType = 'image';
            content = content || '';
        } else if (msg.audioUrl) {
            mediaUrl = msg.audioUrl;
            mediaType = 'audio';
            content = content || '';
        } else if (msg.documentUrl) {
            mediaUrl = msg.documentUrl;
            mediaType = 'document';
            content = content || '';
        }
        
        if (!content && !mediaUrl) continue;

        const senderType = (msg.role === 'user' || msg.role === 'customer') ? 'customer' : 'agent';
        const externalId = msg.id; 
        const messageDate = msg.time ? new Date(msg.time).toISOString() : new Date().toISOString();

        if (externalId) {
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
                ignoreDuplicates: true
            })

            if (!error) savedCount++
        }
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
