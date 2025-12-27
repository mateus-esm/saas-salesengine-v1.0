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
    // O endpoint deve retornar a lista que você mandou (Array de objetos)
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
    
    // Validação: Garante que é um array (conforme seu payload mostra [ ... ])
    const messagesArray = Array.isArray(externalMessages) ? externalMessages : (externalMessages.messages || []);

    let savedCount = 0

    // 2. Loop Adaptado ao seu Payload Real
    for (const msg of messagesArray) {
        
        // Mapeamento baseado no seu JSON:
        // "text": "<string>"
        // "imageUrl": "<string>"
        // "audioUrl": "<string>"
        
        let content = msg.text;
        
        // Tratamento para Mídia (se o texto vier vazio, mas tiver imagem/audio)
        if (!content && msg.imageUrl) content = '[Imagem] ' + msg.imageUrl;
        else if (!content && msg.audioUrl) content = '[Áudio] ' + msg.audioUrl;
        else if (!content && msg.documentUrl) content = '[Documento] ' + msg.documentUrl;
        
        if (!content) continue; // Pula se realmente não tiver nada

        // "role": "<string>" -> Definir quem enviou
        // Geralmente 'user' ou 'customer' é o cliente. Todo o resto assumimos que é o sistema/agente.
        const senderType = (msg.role === 'user' || msg.role === 'customer') ? 'customer' : 'agent';
        
        // "id": "<string>" -> ID Único para evitar duplicidade
        const externalId = msg.id; 
        
        // "time": 123 -> Converter Timestamp para Data ISO do Supabase
        // Assumindo que o timestamp é milissegundos (padrão JS). Se for segundos, multiplicar por 1000.
        const messageDate = msg.time ? new Date(msg.time).toISOString() : new Date().toISOString();

        if (externalId) {
            const { error } = await supabase.from('messages').upsert({
                lead_id: lead_id,
                content: content,
                sender_type: senderType,
                status: 'delivered', // Histórico passado já foi entregue
                gpt_message_id: externalId, // A chave anti-duplicidade
                created_at: messageDate     // Mantém a ordem cronológica original
            }, { 
                onConflict: 'gpt_message_id', 
                ignoreDuplicates: true 
            })
            
            if (!error) savedCount++
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
