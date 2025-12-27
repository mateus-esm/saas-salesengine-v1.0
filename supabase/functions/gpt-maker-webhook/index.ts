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

    // --- 1. FILTRAGEM DE RUÍDO (Resolvendo o "Treinamento na Tela") ---
    const role = payload.role || 'customer';
    
    // Ignora mensagens de sistema, logs ou instruções internas
    if (role === 'system' || role === 'tool' || payload.type === 'log') {
        return new Response(JSON.stringify({ skipped: true, reason: 'System message ignored' }), { headers: corsHeaders });
    }

    // --- 2. MAPEAMENTO ---
    const agentId = payload.agent_id || payload.assistantId || payload.agentId;
    const phone = payload.telefone || payload.phone || payload.remoteJid || payload.contactPhone;
    const name = payload.nome || payload.name || payload.pushName || payload.contactName || 'Lead WhatsApp';
    const chatId = payload.chat_id || payload.chatId || payload.id || payload.contextId;
    const msgId = payload.message_id || payload.id || payload.key?.id || payload.messageId;
    
    let messageContent = payload.mensagem || payload.message || payload.text?.body || '';

    // Validação
    if (!agentId || !phone) {
       // Retorna 200 para o GPT Maker não ficar tentando reenviar erro, mas loga o problema
       console.error("Payload incompleto ignorado:", payload);
       return new Response(JSON.stringify({ error: 'Missing data' }), { headers: corsHeaders });
    }

    // Identificar Equipe
    const { data: equipe } = await supabase.from('equipes').select('id').eq('gpt_maker_agent_id', agentId).maybeSingle();
    if (!equipe) throw new Error(`Agent ID '${agentId}' não encontrado.`);

    // Identificar/Criar Lead
    let { data: lead } = await supabase.from('leads').select('id, gpt_maker_chat_id').eq('phone', phone).maybeSingle();

    if (!lead) {
      const { data: newLead, error } = await supabase.from('leads').insert({
          equipe_id: equipe.id, name: name, phone: phone, 
          last_message_at: new Date().toISOString(),
          gpt_maker_chat_id: chatId || null, unread_count: 0
      }).select().single();
      if (error) throw error;
      lead = newLead;
    } else {
       // Atualiza timestamp e chat_id
       const updates: any = { last_message_at: new Date().toISOString() };
       if (!lead.gpt_maker_chat_id && chatId) updates.gpt_maker_chat_id = chatId;
       await supabase.from('leads').update(updates).eq('id', lead.id);
    }

    // --- 3. SALVAR MENSAGEM (Com Lógica Anti-Duplicidade do Efeito Eco) ---
    const senderType = (role === 'assistant' || role === 'system') ? 'agent' : 'customer';

    // Tratamento de mídia
    if (!messageContent && (payload.images?.length > 0 || payload.audios?.length > 0)) {
        if (payload.images?.length > 0) messageContent = '[Imagem]';
        else if (payload.audios?.length > 0) messageContent = '[Áudio]';
    }

    if (messageContent && lead) {
        let messageSaved = false;

        // SE FOR MENSAGEM DO AGENTE (ECO): Tenta achar a original que o SaaS enviou
        if (senderType === 'agent') {
            // Procura mensagem igual enviada nos últimos 60 segundos
            const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
            
            const { data: existingMsg } = await supabase
                .from('messages')
                .select('id')
                .eq('lead_id', lead.id)
                .eq('content', messageContent)
                .eq('sender_type', 'agent')
                .gt('created_at', oneMinuteAgo)
                .is('gpt_message_id', null) // Só as que ainda não tem ID externo
                .limit(1)
                .maybeSingle();

            if (existingMsg) {
                // ACHOU! É a mesma mensagem. Vamos apenas "carimbar" o ID nela.
                // Isso evita criar a duplicata.
                await supabase.from('messages').update({ 
                    gpt_message_id: msgId,
                    status: 'delivered' 
                }).eq('id', existingMsg.id);
                console.log('Mensagem fundida com sucesso (Anti-Eco).');
                messageSaved = true;
            }
        }

        // Se não achou duplicata (ou é cliente), insere nova
        if (!messageSaved) {
             const { error: msgError } = await supabase.from('messages').insert({
                lead_id: lead.id,
                content: messageContent,
                sender_type: senderType, 
                gpt_message_id: msgId,   
            });
            if (msgError) console.error('Erro ao salvar:', msgError);

            // Incrementa contador só se for Cliente
            if (senderType === 'customer') {
                await supabase.rpc('increment_unread_count', { row_id: lead.id });
            }
        }
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Webhook Error:', error);
    // Retorna 200 mesmo com erro para evitar loop de retentativa do GPT Maker se for erro de lógica nossa
    return new Response(JSON.stringify({ error: (error as Error).message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
