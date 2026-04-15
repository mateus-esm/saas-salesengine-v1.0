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
                lead_id: lead_id,
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
      const chatMetaUrl = `https://api.gptmaker.ai/v2/chat/${chat_id}`
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

        if (Object.keys(enrichment).length > 0) {
          await supabase.from('leads').update(enrichment).eq('id', lead_id)
          console.log('[SyncHistory] Lead enriquecido com metadados:', enrichment)
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
