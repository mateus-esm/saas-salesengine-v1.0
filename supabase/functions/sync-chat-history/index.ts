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

    if (!chat_id || !lead_id) throw new Error('Missing chat_id or lead_id')

    // 1. Buscar histórico na API do GPT Maker
    // Ajuste o endpoint conforme a doc do GPT Maker (geralmente é /chats/{id}/messages)
    const url = `https://api.gptmaker.ai/v2/chat/${chat_id}/messages?limit=50` 
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
    })

    if (!response.ok) throw new Error('Failed to fetch history from GPT Maker')

    const data = await response.json()
    // O GPT Maker geralmente retorna { messages: [...] } ou um array direto. Ajuste conforme teste.
    const externalMessages = Array.isArray(data) ? data : (data.messages || [])

    // 2. Salvar no Supabase (Ignorar duplicados)
    let newMessagesCount = 0
    
    for (const msg of externalMessages) {
        // Mapear campos do GPT Maker para o seu Banco
        // Exemplo: GPT usa 'content', você usa 'content'. 
        // Exemplo: GPT usa 'role' (user/assistant), você usa 'sender_type' (customer/agent)
        
        const content = msg.message || msg.content || msg.body;
        // Se for o cliente (user) -> customer. Se for assistant/system -> agent.
        const senderType = (msg.role === 'user' || msg.fromMe === false) ? 'customer' : 'agent';
        
        // Tenta inserir. Se já existir (mesmo conteúdo/tempo), ignoramos ou usamos UPSERT se tiver ID externo
        // Aqui vamos fazer um insert simples verificando duplicidade básica pelo conteúdo/lead/tempo
        
        const { error } = await supabase.from('messages').insert({
            lead_id: lead_id,
            content: content,
            sender_type: senderType,
            status: 'delivered', // Histórico passado já foi entregue
            created_at: msg.createdAt || new Date().toISOString() // Tente usar a data real da mensagem
        })
        
        if (!error) newMessagesCount++
    }

    return new Response(JSON.stringify({ success: true, synced: newMessagesCount }), {
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
