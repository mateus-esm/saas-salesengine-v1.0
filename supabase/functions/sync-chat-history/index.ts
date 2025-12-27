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

    // 1. Busca histórico (Limite maior para garantir)
    const url = `https://api.gptmaker.ai/v2/chat/${chat_id}/messages?limit=100`
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
    })

    if (!response.ok) throw new Error('Failed to fetch history')

    const data = await response.json()
    // Ajuste conforme o retorno da API do GPT Maker (verifique se é data.messages ou data direto)
    const externalMessages = Array.isArray(data) ? data : (data.messages || [])

    let savedCount = 0

    // 2. Loop Inteligente (UPSERT)
    for (const msg of externalMessages) {
        // Mapeamento Seguro
        const content = msg.message || msg.content || msg.body || '';
        if (!content) continue; // Pula mensagens vazias

        const senderType = (msg.role === 'user' || msg.fromMe === false) ? 'customer' : 'agent';
        
        // O PULO DO GATO: Usamos o ID original da mensagem
        const externalId = msg.id || msg.key?.id || msg.messageId; 
        
        // DATA CORRETA: Usamos a data da mensagem, não a de "agora"
        // Isso garante a ORDEM CORRETA no chat
        const messageDate = msg.createdAt || msg.timestamp || msg.date || new Date().toISOString();

        if (externalId) {
            // Tenta inserir usando UPSERT (Ignora se já existir graças ao onConflict)
            const { error } = await supabase.from('messages').upsert({
                lead_id: lead_id,
                content: content,
                sender_type: senderType,
                status: 'delivered',
                gpt_message_id: externalId, // A chave anti-duplicidade
                created_at: messageDate     // A chave da ordem correta
            }, { 
                onConflict: 'gpt_message_id', // Se bater esse ID...
                ignoreDuplicates: true        // ...não faz nada (preserva o que já existe)
            })
            
            if (!error) savedCount++
        }
    }

    return new Response(JSON.stringify({ success: true, new_messages: savedCount }), {
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
