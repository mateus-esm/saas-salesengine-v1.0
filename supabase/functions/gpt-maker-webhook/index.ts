import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Declare EdgeRuntime for TypeScript
declare const EdgeRuntime: {
  waitUntil(promise: Promise<any>): void;
};

// Helper to trigger analyze-message in background with proper Authorization
// This function returns a Promise that we will pass to waitUntil
async function triggerAnalysis(supabaseUrl: string, serviceRoleKey: string, lead_id: string, message_content: string, conversation_history: string) {
  console.log(`[gpt-maker-webhook] Triggering background analysis for lead ${lead_id}...`);
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/analyze-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey
      },
      body: JSON.stringify({ lead_id, message_content, conversation_history })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[gpt-maker-webhook] Analysis HTTP error:', response.status, errorText);
    } else {
      const result = await response.json();
      console.log('[gpt-maker-webhook] Analysis triggered successfully. Result:', result);
    }
  } catch (err) {
    console.error('[gpt-maker-webhook] Analysis trigger failed:', err);
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
      // NEW: Enforce creation_source: 'ai_agent'
      const { data: newLead, error } = await supabase.from('leads').insert({
        equipe_id: equipe.id,
        name: name,
        phone: phone,
        last_message_at: new Date().toISOString(),
        gpt_maker_chat_id: chatId || null,
        lead_type: 'lead',
        creation_source: 'ai_agent' // CRITICAL: Identify source as AI
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

    const shouldTriggerAnalysis = (senderType === 'customer' && messageContent);

    if (messageContent && lead) {
      // Check for duplicates (anti-echo)
      let messageSaved = false;
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
          await supabase.from('messages').update({ gpt_message_id: msgId }).eq('id', existingMsg.id);
          console.log('[gpt-maker-webhook] Mensagem fundida (Anti-Eco).');
          messageSaved = true;
        }
      }

      if (!messageSaved) {
        const { error: msgError } = await supabase.from('messages').insert({
          lead_id: lead.id,
          content: messageContent,
          sender_type: senderType,
          gpt_message_id: msgId,
        });
        if (msgError) console.error('[gpt-maker-webhook] Erro ao salvar:', msgError);
      }
    }

    // --- 4. TRIGGER ANALYSIS (ROBUST ASYNC) ---
    if (shouldTriggerAnalysis && lead) {
      // Context
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

      // CRITICAL FIX: Use EdgeRuntime.waitUntil instead of setTimeout
      // This ensures the background task completes even after response is sent
      console.log('[gpt-maker-webhook] Scheduling analysis with EdgeRuntime.waitUntil');
      EdgeRuntime.waitUntil(
        triggerAnalysis(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          lead.id,
          messageContent,
          conversationHistory
        )
      );
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
