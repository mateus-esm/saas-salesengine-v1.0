import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const payload = await req.json();
    console.log('Webhook Payload:', JSON.stringify(payload));

    // 1. MAPEAMENTO INTELIGENTE DE CAMPOS
    // Tenta pegar o ID do Agente em qualquer variação possível
    const agentId = payload.agent_id || payload.assistantId || payload.agentId;
    
    // Tenta pegar o Telefone
    const phone = payload.telefone || payload.phone || payload.remoteJid || payload.contactPhone;
    
    // Tenta pegar o Nome
    const name = payload.nome || payload.name || payload.pushName || payload.contactName || 'Lead WhatsApp';
    
    // Tenta pegar o Chat ID (Context ID)
    const chatId = payload.chat_id || payload.chatId || payload.id || payload.contextId;

    // Tenta pegar o ID da Mensagem
    const msgId = payload.message_id || payload.id || payload.key?.id || payload.messageId;

    // Tenta pegar o Role (quem mandou)
    const role = payload.role || 'customer'; // assistant, system, user

    // Tenta pegar o Conteúdo
    let messageContent = payload.mensagem || payload.message || payload.text?.body || '';

    // VALIDAÇÃO BLINDADA
    if (!agentId) throw new Error('agent_id (or assistantId) is required - Payload received: ' + JSON.stringify(payload));
    if (!phone) throw new Error('Phone number not found in payload');

    // 2. Identificar a Equipe
    // ATENÇÃO: Verifique se o ID '3DF0B5F10DF2C09007869A6EC31B5F97' está na tabela equipes!
    const { data: equipe } = await supabase
      .from('equipes')
      .select('id, nome')
      .eq('gpt_maker_agent_id', agentId)
      .single();

    if (!equipe) {
        throw new Error(`Agent ID '${agentId}' não encontrado na tabela 'equipes'. Cadastre este ID no banco.`);
    }

    // 3. Identificar ou Criar o Lead (UPSERT)
    let { data: lead } = await supabase
      .from('leads')
      .select('id, gpt_maker_chat_id')
      .eq('phone', phone)
      .maybeSingle();

    if (!lead) {
      // Cria novo lead
      const { data: newLead, error: createError } = await supabase
        .from('leads')
        .insert({
          equipe_id: equipe.id,
          name: name,
          phone: phone,
          email: payload.email || null,
          source: 'whatsapp_bot',
          last_message_at: new Date().toISOString(),
          gpt_maker_chat_id: chatId || null,
          unread_count: 0
        })
        .select()
        .single();

      if (createError) throw createError;
      lead = newLead;
    } else {
      // Atualiza existente
      const updates: any = { last_message_at: new Date().toISOString() };
      if (!lead.gpt_maker_chat_id && chatId) updates.gpt_maker_chat_id = chatId;
      
      await supabase.from('leads').update(updates).eq('id', lead.id);
    }

    // 4. Salvar a Mensagem
    const senderType = (role === 'assistant' || role === 'system') ? 'agent' : 'customer';

    // Tratamento para mídias se texto vier vazio
    if (!messageContent && (payload.images?.length > 0 || payload.audios?.length > 0)) {
        if (payload.images?.length > 0) messageContent = '[Imagem Recebida]';
        else if (payload.audios?.length > 0) messageContent = '[Áudio Recebido]';
    }

    if (messageContent && lead) {
      const { error: msgError } = await supabase.from('messages').insert({
        lead_id: lead.id,
        content: messageContent,
        sender_type: senderType, 
        gpt_message_id: msgId,   
        // status: 'delivered' <-- Removido pois sua tabela não tem essa coluna ainda
      });
      
      if (msgError) console.error('Erro ao salvar mensagem:', msgError);

      // Incrementa contador APENAS se for Cliente
      if (senderType === 'customer') {
          const { error: rpcError } = await supabase.rpc('increment_unread_count', { 
            row_id: lead.id 
          });
          if (rpcError) console.error('Erro RPC:', rpcError);
      }
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
