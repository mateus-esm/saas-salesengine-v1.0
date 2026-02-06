import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.28.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============ CONFIGURAÇÕES ============
const CONFIG = {
  MIN_NEW_MESSAGES: 2,        // Mínimo de msgs novas para disparar análise
  CONTEXT_MESSAGES: 5,        // Msgs antigas para contexto
  NEW_MESSAGES_LIMIT: 10,     // Máximo de msgs novas a analisar
  COOLDOWN_MINUTES: 3,        // Intervalo mínimo entre análises do mesmo lead
};

// Tool schema compacto
const EXTRACTION_TOOL = {
  type: "function" as const,
  function: {
    name: "save_crm_data",
    description: "Extrai dados do lead",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        consumo_medio: { type: "string" },
        tipo_telhado: { type: "string", enum: ["Cerâmica", "Fibrocimento", "Metálico", "Laje", "Outro"] },
        valor_conta: { type: "string" },
        meeting_scheduled: { type: "boolean" },
        meeting_date: { type: "string" },
        meeting_link: { type: "string" },
        intent: { type: "string", enum: ["INTERESTED", "SCHEDULED", "DISQUALIFIED", "SPAM", "UNCHANGED"] }
      },
      required: ["intent"]
    }
  }
};

const SYSTEM_PROMPT = `Analise o chat de energia solar. Msgs novas marcadas com [NOVO].
- meeting_scheduled=true se CONFIRMOU horário
- intent: SCHEDULED/INTERESTED/DISQUALIFIED/SPAM ou UNCHANGED se nada relevante
- Extraia dados mencionados: nome, email, consumo, telhado, valor
Hoje:`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const auditLog = {
    lead_id: null as string | null,
    equipe_id: null as string | null,
    decision_type: 'started',
    input_summary: '',
    output_action: {} as Record<string, any>,
    status: 'processing',
    error_details: null as string | null,
    confidence_score: 0,
    tokens_used: 0
  };

  try {
    const { lead_id, force = false } = await req.json();
    auditLog.lead_id = lead_id;

    // ============ CACHE CHECK: Última análise ============
    const { data: lastAnalysis } = await supabase
      .from('ai_decisions')
      .select('created_at')
      .eq('lead_id', lead_id)
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastAnalyzedAt = lastAnalysis?.created_at || '1970-01-01';

    // ============ COOLDOWN: Evita spam de análises ============
    if (!force && lastAnalysis) {
      const cooldownMs = CONFIG.COOLDOWN_MINUTES * 60 * 1000;
      const timeSinceLastAnalysis = Date.now() - new Date(lastAnalyzedAt).getTime();

      if (timeSinceLastAnalysis < cooldownMs) {
        console.log(`[Cache] Cooldown ativo. Última análise há ${Math.round(timeSinceLastAnalysis/1000)}s`);
        return new Response(JSON.stringify({
          skipped: true,
          reason: 'cooldown',
          retry_after_seconds: Math.ceil((cooldownMs - timeSinceLastAnalysis) / 1000)
        }), { headers: corsHeaders });
      }
    }

    // ============ BUSCAR MENSAGENS NOVAS ============
    const { count: newMsgCount } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('lead_id', lead_id)
      .gt('created_at', lastAnalyzedAt);

    // Se não houver mensagens novas suficientes, skip
    if (!force && (newMsgCount || 0) < CONFIG.MIN_NEW_MESSAGES) {
      console.log(`[Cache] Apenas ${newMsgCount} msgs novas (mínimo: ${CONFIG.MIN_NEW_MESSAGES})`);
      auditLog.decision_type = 'cache_hit';
      auditLog.status = 'skipped';
      auditLog.output_action = { new_messages: newMsgCount, threshold: CONFIG.MIN_NEW_MESSAGES };

      return new Response(JSON.stringify({
        skipped: true,
        reason: 'insufficient_new_messages',
        new_messages: newMsgCount
      }), { headers: corsHeaders });
    }

    // ============ BUSCAR LEAD ============
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, name, email, custom_fields, meeting_date, equipe_id, pipeline_stages(name)')
      .eq('id', lead_id)
      .single();

    if (leadError || !lead) throw new Error(`Lead not found`);
    auditLog.equipe_id = lead.equipe_id;

    // ============ BUSCAR CONTEXTO + MENSAGENS NOVAS ============
    // 1. Mensagens de contexto (antigas, antes da última análise)
    const { data: contextMsgs } = await supabase
      .from('messages')
      .select('content, sender_type, created_at')
      .eq('lead_id', lead_id)
      .lte('created_at', lastAnalyzedAt)
      .order('created_at', { ascending: false })
      .limit(CONFIG.CONTEXT_MESSAGES);

    // 2. Mensagens novas (após última análise)
    const { data: newMsgs } = await supabase
      .from('messages')
      .select('content, sender_type, created_at')
      .eq('lead_id', lead_id)
      .gt('created_at', lastAnalyzedAt)
      .order('created_at', { ascending: true })
      .limit(CONFIG.NEW_MESSAGES_LIMIT);

    if (!newMsgs || newMsgs.length === 0) {
      auditLog.status = 'skipped';
      auditLog.output_action = { reason: "Sem mensagens novas" };
      return new Response(JSON.stringify({ skipped: true }), { headers: corsHeaders });
    }

    // ============ MONTAR HISTÓRICO COMPACTO ============
    // Formato: Contexto antigo + separador + Mensagens novas marcadas
    const contextHistory = (contextMsgs || [])
      .reverse()
      .map(m => `${m.sender_type === 'customer' ? 'C' : 'B'}:${m.content}`)
      .join('\n');

    const newHistory = newMsgs
      .map(m => `[NOVO]${m.sender_type === 'customer' ? 'C' : 'B'}:${m.content}`)
      .join('\n');

    const history = contextHistory
      ? `${contextHistory}\n---\n${newHistory}`
      : newHistory;

    auditLog.input_summary = `${contextMsgs?.length || 0}ctx+${newMsgs.length}new`;
    console.log(`[Pipeline] ${auditLog.input_summary} msgs`);

    // ============ CHAMAR IA ============
    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
    const today = new Date().toISOString().split('T')[0];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT + today },
        { role: "user", content: history }
      ],
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "function", function: { name: "save_crm_data" } },
      max_tokens: 250
    });

    auditLog.tokens_used = completion.usage?.total_tokens || 0;
    console.log(`[Pipeline] Tokens: ${auditLog.tokens_used}`);

    const toolCall = completion.choices[0].message.tool_calls?.[0];

    if (!toolCall) {
      auditLog.decision_type = 'skipped';
      auditLog.output_action = { reason: "No tool call" };
      auditLog.status = 'success';
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    const data = JSON.parse(toolCall.function.arguments);
    console.log(`[Pipeline] Extraído:`, JSON.stringify(data));

    // ============ EARLY EXIT: Nada mudou ============
    if (data.intent === 'UNCHANGED') {
      auditLog.decision_type = 'unchanged';
      auditLog.output_action = { intent: 'UNCHANGED' };
      auditLog.status = 'success';
      auditLog.confidence_score = 1.0;
      console.log(`[Pipeline] Sem mudanças relevantes`);
      return new Response(JSON.stringify({ success: true, unchanged: true }), { headers: corsHeaders });
    }

    auditLog.confidence_score = 1.0;
    const updates: any = {};

    // 1. Dados cadastrais
    if (data.name && data.name !== lead.name) updates.name = data.name;
    if (data.email && data.email !== lead.email) updates.email = data.email;

    // 2. Custom fields
    const cf: any = {};
    if (data.consumo_medio) cf.consumo_medio = data.consumo_medio;
    if (data.tipo_telhado) cf.tipo_telhado = data.tipo_telhado;
    if (data.valor_conta) cf.valor_conta = data.valor_conta;

    if (Object.keys(cf).length > 0) {
      updates.custom_fields = { ...(lead.custom_fields || {}), ...cf };
    }

    // 3. Agendamento
    const isScheduled = data.meeting_scheduled || data.intent === 'SCHEDULED';

    if (isScheduled) {
      const { data: stage } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('name', 'Reunião Agendada')
        .eq('equipe_id', lead.equipe_id)
        .maybeSingle();

      updates.meeting_scheduled = true;
      if (data.meeting_date) updates.meeting_date = data.meeting_date;
      else if (!lead.meeting_date) updates.meeting_date = new Date().toISOString();
      if (data.meeting_link) updates.meeting_notes = `[IA] ${data.meeting_link}`;
      if (stage) {
        updates.stage_id = stage.id;
        console.log(`[Pipeline] Reunião → ${stage.id}`);
      }
    }
    // 4. Qualificação
    else if (data.intent === 'INTERESTED') {
      const currentStage = lead.pipeline_stages?.name;
      if (!currentStage || currentStage === 'Novo Lead') {
        const { data: qualStage } = await supabase
          .from('pipeline_stages')
          .select('id')
          .eq('name', 'Qualificação')
          .eq('equipe_id', lead.equipe_id)
          .maybeSingle();

        if (qualStage) {
          updates.stage_id = qualStage.id;
          console.log(`[Pipeline] → Qualificação`);
        }
      }
    }

    // 5. Desqualificação
    if (data.intent === 'DISQUALIFIED') {
      updates.lead_type = 'contact';
      updates.qualification_status = 'disqualified';
    }

    // 6. Aplicar updates
    if (Object.keys(updates).length > 0) {
      await supabase.from('leads').update(updates).eq('id', lead_id);
      auditLog.decision_type = 'crm_update';
      auditLog.output_action = { changes: updates, intent: data.intent, tokens: auditLog.tokens_used };
      auditLog.status = 'success';
    } else {
      auditLog.decision_type = 'no_action';
      auditLog.output_action = { intent: data.intent };
      auditLog.status = 'success';
    }

    return new Response(JSON.stringify({
      success: true,
      intent: data.intent,
      updates: Object.keys(updates).length,
      tokens: auditLog.tokens_used
    }), { headers: corsHeaders });

  } catch (error) {
    console.error('[Pipeline] Erro:', error);
    auditLog.status = 'error';
    auditLog.decision_type = 'system_failure';
    auditLog.error_details = (error as Error).message;
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: corsHeaders });
  } finally {
    // 7. Salvar Auditoria 
    if (auditLog.lead_id) {
        const { error: auditError } = await supabase.from('ai_decisions').insert({
          lead_id: auditLog.lead_id,
          equipe_id: auditLog.equipe_id,
          decision_type: auditLog.decision_type,
          input_summary: auditLog.input_summary,
          output_action: auditLog.output_action || {}, 
          status: auditLog.status,
          error_details: auditLog.error_details,
          confidence_score: auditLog.confidence_score // Preenchendo a coluna existente
        });
        if (auditError) console.error("Erro Auditoria:", auditError);
    }
  }
});