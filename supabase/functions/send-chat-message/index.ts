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
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Recebe dados do Frontend
    const { content, chat_id, lead_id, action } = await req.json()
    const token = Deno.env.get('GPT_MAKER_TOKEN')

    // 1. AÇÃO: Assumir ou Encerrar Atendimento (Botão de Ação)
    if (action === 'take_control' || action === 'stop_control') {
      const endpoint = action === 'take_control' ? 'start-human' : 'stop-human'
      const url = `https://api.gptmaker.ai/v2/chat/${chat_id}/${endpoint}`

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      })

      if (!response.ok) throw new Error(`Erro GPT Maker: ${await response.text()}`)
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 2. AÇÃO: Enviar Mensagem de Texto
    // Primeiro, salvamos no banco para a UI atualizar rápido (Optimistic UI)
    const { data: msg, error: dbError } = await supabase
      .from('messages')
      .insert({
        lead_id,
        content,
        sender_type: 'agent', // Mensagem enviada por nós
        status: 'sending'
      })
      .select()
      .single()

    if (dbError) throw dbError

    // Agora enviamos para a API Oficial
    const url = `https://api.gptmaker.ai/v2/chat/${chat_id}/send-message`
    const gptResponse = await fetch(url, {
      method: 'POST',
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ message: content }) // Payload conforme documentação
    })

    if (!gptResponse.ok) {
      // Se falhar, atualiza status no banco para erro
      await supabase.from('messages').update({ status: 'error' }).eq('id', msg.id)
      throw new Error(`Erro no envio: ${await gptResponse.text()}`)
    }

    // Sucesso: atualiza status
    await supabase.from('messages').update({ status: 'sent' }).eq('id', msg.id)

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
