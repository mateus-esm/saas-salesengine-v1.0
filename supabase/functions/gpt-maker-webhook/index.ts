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

    // 1. TRADUÇÃO DOS CAMPOS (O Segredo da Compatibilidade)
    // O código agora tenta todas as variações possíveis que o GPT Maker manda
    
    const agentId = payload.agent_id || payload.assistantId || payload.agentId;
    
    const phone = payload.telefone || payload.phone || payload.remoteJid || payload.contactPhone;
    
    const name = payload.nome || payload.name || payload.pushName || payload.contactName || 'Lead WhatsApp';
    
    const chatId = payload.chat_id || payload.chatId || payload.id || payload.contextId;

    const msgId = payload.message_id || payload.id || payload.key?.id || payload.messageId;

    const role = payload.role || 'customer'; // assistant, system, user

    // Conteúdo da mensagem
    let messageContent = payload.mensagem || payload.message || payload.text?.body || '';

    // Validação
    if (!agentId) throw new Error('agent_id (or assistantId) is required');
    if (!phone) throw new Error('Phone number not found in payload');

    // 2. Identificar a Equipe
    const { data: equipe } = await supabase
      .from('equipes')
      .select('id, nome')
      .eq('gpt_maker_agent_id', agentId)
      .single();

    if (!equipe) {
        console.error(`Agent ID ${agentId} não encontrado nas equipes.`);
        throw new Error('Agent ID não vinculado a nenhuma equipe');
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
    // IMPORTANTE: Definir quem mandou (Cliente ou Robô?)
    // Se role for 'assistant', é o robô ('agent'). Se for 'user', é o cliente ('customer').
    const senderType = (role === 'assistant' || role === 'system') ? 'agent' : 'customer';

    // Se a mensagem veio vazia, mas tem anexos (lógica extra)
    if (!messageContent && (payload.images?.length > 0 || payload.audios?.length > 0)) {
        if (payload.images?.length > 0) messageContent = '[Imagem Recebida]';
        else if (payload.audios?.length > 0) messageContent = '[Áudio Recebido]';
    }

    // Só salva se tiver conteúdo (ignora eventos de status vazios)
    if (messageContent && lead) {
      const { error: msgError } = await supabase.from('messages').insert({
        lead_id: lead.id,
        content: messageContent,
        sender_type: senderType, // Dinâmico!
        gpt_message_id: msgId,   // Vacina anti-duplicidade
        status: 'delivered'      // Você pode ajustar isso se quiser
      });
      
      if (msgError) console.error('Erro ao salvar mensagem:', msgError);

      // Incrementa contador (apenas se for mensagem do CLIENTE)
      // Se for mensagem do robô (agent), não precisa notificar como não lida.
      if (senderType === 'customer') {
          const { error: rpcError } = await supabase.rpc('increment_unread_count', { 
            row_id: lead.id 
          });
          if (rpcError) console.error('Erro RPC:', rpcError);
      }
    } else {
        console.log('Mensagem vazia ignorada.');
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
