import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Tratamento de CORS
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const payload = await req.json();
    console.log('Webhook Payload:', JSON.stringify(payload));

    // 1. Validação Básica
    if (!payload.agent_id) throw new Error('agent_id is required');

    // 2. Identificar a Equipe pelo Agente
    const { data: equipe } = await supabase
      .from('equipes')
      .select('id, nome')
      .eq('gpt_maker_agent_id', payload.agent_id)
      .single();

    if (!equipe) throw new Error('Agent ID não vinculado a nenhuma equipe');

    // 3. Identificar ou Criar o Lead (UPSERT Inteligente)
    // GPT Maker pode mandar 'phone', 'telefone', 'remoteJid'
    const phone = payload.telefone || payload.phone || payload.remoteJid; 
    const name = payload.nome || payload.name || payload.pushName || 'Lead WhatsApp';
    // O chat_id geralmente vem como 'id' ou 'chatId' no payload da conversa/contato
    const chatId = payload.chat_id || payload.chatId || payload.id; 

    if (!phone) throw new Error('Phone number not found in payload');

    // Tenta buscar lead existente
    let { data: lead } = await supabase
      .from('leads')
      .select('id, gpt_maker_chat_id')
      .eq('phone', phone)
      .maybeSingle();

    if (!lead) {
      // A) Se não existe, CRIA NOVO
      const { data: newLead, error: createError } = await supabase
        .from('leads')
        .insert({
          equipe_id: equipe.id,
          name: name,
          phone: phone,
          email: payload.email || null,
          source: 'whatsapp_bot',
          last_message_at: new Date().toISOString(),
          gpt_maker_chat_id: chatId || null, // Salva o Chat ID importante para envio
          unread_count: 0 // Começa com 0, vamos incrementar abaixo
        })
        .select()
        .single();

      if (createError) throw createError;
      if (!newLead) throw new Error('Failed to create lead');
      lead = newLead;
    } else {
      // B) Se existe, ATUALIZA (Timestamp e ChatID se faltar)
      const updates: any = { last_message_at: new Date().toISOString() };
      
      // Se o lead antigo não tinha chat_id e agora veio, atualiza
      if (!lead.gpt_maker_chat_id && chatId) {
        updates.gpt_maker_chat_id = chatId;
      }
      
      await supabase.from('leads').update(updates).eq('id', lead.id);
    }

    // 4. Salvar a Mensagem e Incrementar Contador
    const messageContent = payload.mensagem || payload.message || payload.text?.body;
    
    // Tenta pegar o ID ÚNICO que vem no payload do webhook (Variável conforme versão da API)
    const msgId = payload.message_id || payload.id || payload.key?.id || payload.messageId;

    if (messageContent && lead) {
      // A) Salva a mensagem (com gpt_message_id para evitar duplicidade futura)
      const { error: msgError } = await supabase.from('messages').insert({
        lead_id: lead.id,
        content: messageContent,
        sender_type: 'customer', // Veio do cliente
        status: 'delivered',
        gpt_message_id: msgId // <-- A VACINA CONTRA DUPLICIDADE
      });
      
      if (msgError) {
        console.error('Erro ao salvar mensagem (possível duplicidade ou erro de banco):', msgError);
        // Não damos throw aqui para garantir que o contador seja incrementado mesmo se o insert falhar (ex: edge case)
        // Ou se preferir rigor, pode parar aqui. Mas geralmente em webhook tentamos processar o resto.
      }

      // B) Incrementa o contador de não lidas (Badge Vermelho)
      // Chama a função RPC segura que criamos no SQL
      const { error: rpcError } = await supabase.rpc('increment_unread_count', { 
        row_id: lead.id 
      });
      
      if (rpcError) console.error('Erro ao incrementar badge:', rpcError);
    }

    return new Response(JSON.stringify({ success: true, lead_id: lead?.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error('Webhook Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
