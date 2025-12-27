import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to trigger analyze-message in background
async function triggerAnalysis(supabaseUrl: string, lead_id: string, message_content: string, conversation_history: string) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/analyze-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
      },
      body: JSON.stringify({ lead_id, message_content, conversation_history })
    });
    const result = await response.json();
    console.log('[gpt-maker-webhook] Analysis result:', result);
  } catch (err) {
    console.error('[gpt-maker-webhook] Analysis failed:', err);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const payload = await req.json();
    console.log('[gpt-maker-webhook] Payload:', JSON.stringify(payload));

    // --- 1. FILTRAGEM DE RUÍDO ---
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
      console.error("[gpt-maker-webhook] Payload incompleto:", payload);
      return new Response(JSON.stringify({ error: 'Missing data' }), { headers: corsHeaders });
    }

    // Identificar Equipe
    const { data: equipe } = await supabase.from('equipes').select('id').eq('gpt_maker_agent_id', agentId).maybeSingle();
    if (!equipe) throw new Error(`Agent ID '${agentId}' não encontrado.`);

    // Identificar/Criar Lead
    let { data: lead } = await supabase.from('leads').select('id, gpt_maker_chat_id').eq('phone', phone).maybeSingle();

    if (!lead) {
      const { data: newLead, error } = await supabase.from('leads').insert({
        equipe_id: equipe.id,
        name: name,
        phone: phone,
        last_message_at: new Date().toISOString(),
        gpt_maker_chat_id: chatId || null,
        lead_type: 'lead', // New leads start as 'lead', AI will reclassify if needed
        creation_source: 'ai_agent' // Track that this lead was created by AI agent
      }).select().single();
      if (error) throw error;
      lead = newLead;
    } else {
      // Atualiza timestamp e chat_id
      const updates: any = { last_message_at: new Date().toISOString() };
      if (!lead.gpt_maker_chat_id && chatId) updates.gpt_maker_chat_id = chatId;
      await supabase.from('leads').update(updates).eq('id', lead.id);
    }

    // --- 3. SALVAR MENSAGEM ---
    const senderType = (role === 'assistant' || role === 'system') ? 'agent' : 'customer';

    // Tratamento de mídia
    if (!messageContent && (payload.images?.length > 0 || payload.audios?.length > 0)) {
      if (payload.images?.length > 0) messageContent = '[Imagem]';
      else if (payload.audios?.length > 0) messageContent = '[Áudio]';
    }

    let shouldTriggerAnalysis = false;

    if (messageContent && lead) {
      let messageSaved = false;

      // SE FOR MENSAGEM DO AGENTE (ECO): Tenta achar a original
      if (senderType === 'agent') {
        const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();

        const { data: existingMsg } = await supabase
          .from('messages')
          .select('id')
          .eq('lead_id', lead.id)
          .eq('content', messageContent)
          .eq('sender_type', 'agent')
          .gt('created_at', oneMinuteAgo)
          .is('gpt_message_id', null)
          .limit(1)
          .maybeSingle();

        if (existingMsg) {
          // Mensagem já existe, apenas atualiza o ID externo
          await supabase.from('messages').update({
            gpt_message_id: msgId
          }).eq('id', existingMsg.id);
          console.log('[gpt-maker-webhook] Mensagem fundida (Anti-Eco).');
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
        if (msgError) console.error('[gpt-maker-webhook] Erro ao salvar:', msgError);

        // Só analisa mensagens de CLIENTES
        if (senderType === 'customer') {
          shouldTriggerAnalysis = true;
        }
      }
    }

    // --- 4. TRIGGER ANALYSIS (ASYNC) ---
    if (shouldTriggerAnalysis && lead) {
      // Get recent conversation for context
      const { data: recentMessages } = await supabase
        .from('messages')
        .select('content, sender_type, created_at')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false })
        .limit(10);

      const conversationHistory = recentMessages
        ?.reverse()
        .map(m => `[${m.sender_type}]: ${m.content}`)
        .join('\n') || '';

      // Fire and forget - don't wait for analysis
      // Using EdgeRuntime.waitUntil pattern
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

      // Schedule async analysis
      setTimeout(() => {
        triggerAnalysis(supabaseUrl, lead.id, messageContent, conversationHistory);
      }, 100);
    }

    return new Response(JSON.stringify({ success: true, lead_id: lead?.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[gpt-maker-webhook] Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
