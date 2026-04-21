import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.28.0";
import {
  resolveActiveOpportunity,
  resolveStageByTypeAndName,
} from "../_shared/opportunities.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============ CONFIG ============
const CONFIG = {
  MIN_NEW_MESSAGES: 2,
  CONTEXT_MESSAGES: 5,
  NEW_MESSAGES_LIMIT: 10,
  COOLDOWN_MINUTES: 3,
};

// Sprint 4 EPIC 0 — stage name hints are hardcoded this sprint. Epic 4/5
// moves them to pipeline_agent_rules so admins can customize per pipeline.
const STAGE_NAME_HINTS = {
  scheduled: 'Reunião Agendada',
  qualified: 'Qualificação',
};

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
    opportunity_id: null as string | null,
    decision_type: 'started',
    input_summary: '',
    output_action: {} as Record<string, unknown>,
    status: 'processing',
    error_details: null as string | null,
    confidence_score: 0,
    tokens_used: 0
  };

  try {
    const { lead_id, force = false } = await req.json();
    auditLog.lead_id = lead_id;

    // ============ COOLDOWN ============
    const { data: lastAnalysis } = await supabase
      .from('ai_decisions')
      .select('created_at')
      .eq('lead_id', lead_id)
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastAnalyzedAt = lastAnalysis?.created_at || '1970-01-01';

    if (!force && lastAnalysis) {
      const cooldownMs = CONFIG.COOLDOWN_MINUTES * 60 * 1000;
      const timeSinceLastAnalysis = Date.now() - new Date(lastAnalyzedAt).getTime();

      if (timeSinceLastAnalysis < cooldownMs) {
        console.log(`[Pipeline] Cooldown ativo. Última análise há ${Math.round(timeSinceLastAnalysis/1000)}s`);
        return new Response(JSON.stringify({
          skipped: true,
          reason: 'cooldown',
          retry_after_seconds: Math.ceil((cooldownMs - timeSinceLastAnalysis) / 1000)
        }), { headers: corsHeaders });
      }
    }

    // ============ NEW MESSAGES GUARD ============
    const { count: newMsgCount } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('lead_id', lead_id)
      .gt('created_at', lastAnalyzedAt);

    if (!force && (newMsgCount || 0) < CONFIG.MIN_NEW_MESSAGES) {
      console.log(`[Pipeline] Apenas ${newMsgCount} msgs novas (mínimo: ${CONFIG.MIN_NEW_MESSAGES})`);
      auditLog.decision_type = 'cache_hit';
      auditLog.status = 'skipped';
      auditLog.output_action = { new_messages: newMsgCount, threshold: CONFIG.MIN_NEW_MESSAGES };

      return new Response(JSON.stringify({
        skipped: true,
        reason: 'insufficient_new_messages',
        new_messages: newMsgCount
      }), { headers: corsHeaders });
    }

    // ============ LOAD CONTACT (identity only) ============
    // Sprint 4 EPIC 0 — stop reading lead.pipeline_stages(name) / lead.stage_id.
    // Current stage + sales state live on the Opportunity now.
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, name, email, equipe_id')
      .eq('id', lead_id)
      .maybeSingle();

    if (leadError || !lead) throw new Error(`Lead not found`);
    auditLog.equipe_id = lead.equipe_id;

    // ============ RESOLVE ACTIVE OPPORTUNITY ============
    // Auto-create when the tenant has a default_pipeline_id configured
    // (mirrors webhook behavior). Epic 5 replaces this with the per-pipeline
    // `auto_create_opportunity` flag from pipeline_agent_rules.
    const opp = await resolveActiveOpportunity(supabase, {
      equipe_id: lead.equipe_id,
      lead_id: lead.id,
      createIfMissing: true,
    });
    auditLog.opportunity_id = opp?.opportunity_id ?? null;

    if (!opp) {
      console.log('[Pipeline] Sem Opportunity ativa e sem default_pipeline_id. Apenas identidade será atualizada.');
    }

    // Current opportunity custom_data (needed to merge extracted fields).
    let currentCustomData: Record<string, unknown> = {};
    let currentStageId: string | null = null;
    if (opp) {
      const { data: currentOpp } = await supabase
        .from('opportunities')
        .select('custom_data, stage_id')
        .eq('id', opp.opportunity_id)
        .maybeSingle();
      currentCustomData = (currentOpp?.custom_data as Record<string, unknown>) || {};
      currentStageId = currentOpp?.stage_id || null;
    }

    // ============ CONTEXT + NEW MESSAGES ============
    const { data: contextMsgs } = await supabase
      .from('messages')
      .select('content, sender_type, created_at')
      .eq('lead_id', lead_id)
      .lte('created_at', lastAnalyzedAt)
      .order('created_at', { ascending: false })
      .limit(CONFIG.CONTEXT_MESSAGES);

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

    // ============ CALL AI ============
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

    if (data.intent === 'UNCHANGED') {
      auditLog.decision_type = 'unchanged';
      auditLog.output_action = { intent: 'UNCHANGED' };
      auditLog.status = 'success';
      auditLog.confidence_score = 1.0;
      console.log(`[Pipeline] Sem mudanças relevantes`);
      return new Response(JSON.stringify({ success: true, unchanged: true }), { headers: corsHeaders });
    }

    auditLog.confidence_score = 1.0;

    // ============ IDENTITY UPDATES (leads) ============
    const leadUpdates: Record<string, unknown> = {};
    if (data.name && data.name !== lead.name) leadUpdates.name = data.name;
    if (data.email && data.email !== lead.email) leadUpdates.email = data.email;

    // DISQUALIFIED → identity: mark as contact + qualification_status.
    // Opportunity (below) is marked status='lost'.
    if (data.intent === 'DISQUALIFIED') {
      leadUpdates.lead_type = 'contact';
      leadUpdates.qualification_status = 'disqualified';
    }

    // ============ OPPORTUNITY UPDATES ============
    const oppPatch: Record<string, unknown> = {};
    const oppCustomPatch: Record<string, unknown> = {};

    // Extracted custom fields — legacy keys for now; Epic 1 maps to field_id.
    if (data.consumo_medio) oppCustomPatch.consumo_medio = data.consumo_medio;
    if (data.tipo_telhado) oppCustomPatch.tipo_telhado = data.tipo_telhado;
    if (data.valor_conta) oppCustomPatch.valor_conta = data.valor_conta;

    const isScheduled = data.meeting_scheduled || data.intent === 'SCHEDULED';

    if (isScheduled) {
      oppCustomPatch.meeting_scheduled = true;
      if (data.meeting_date) {
        oppCustomPatch.meeting_date = data.meeting_date;
      } else if (!currentCustomData.meeting_date) {
        oppCustomPatch.meeting_date = new Date().toISOString();
      }
      if (data.meeting_link) oppCustomPatch.meeting_notes = `[IA] ${data.meeting_link}`;

      if (opp) {
        const target = await resolveStageByTypeAndName(supabase, {
          equipe_id: lead.equipe_id,
          pipeline_id: opp.pipeline_id,
          stage_type: 'open',
          nameHint: STAGE_NAME_HINTS.scheduled,
        });
        if (target && target.id !== currentStageId) {
          oppPatch.stage_id = target.id;
          console.log(`[Pipeline] Opp → stage SCHEDULED: ${target.name}`);
        }
      }
    } else if (data.intent === 'INTERESTED' && opp) {
      // Only advance if we're still sitting on the pipeline's first open stage.
      const { data: firstStage } = await supabase
        .from('pipeline_stages_v2')
        .select('id')
        .eq('equipe_id', lead.equipe_id)
        .eq('pipeline_id', opp.pipeline_id)
        .is('deleted_at', null)
        .eq('stage_type', 'open')
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (firstStage && currentStageId === firstStage.id) {
        const target = await resolveStageByTypeAndName(supabase, {
          equipe_id: lead.equipe_id,
          pipeline_id: opp.pipeline_id,
          stage_type: 'open',
          nameHint: STAGE_NAME_HINTS.qualified,
        });
        if (target && target.id !== currentStageId) {
          oppPatch.stage_id = target.id;
          console.log(`[Pipeline] Opp → stage QUALIFIED: ${target.name}`);
        }
      }
    }

    if (data.intent === 'DISQUALIFIED' && opp) {
      oppPatch.status = 'lost';
      oppPatch.closed_at = new Date().toISOString();
    }

    if (Object.keys(oppCustomPatch).length > 0) {
      oppPatch.custom_data = { ...currentCustomData, ...oppCustomPatch };
    }

    // ============ APPLY ============
    let appliedLead = false;
    let appliedOpp = false;

    if (Object.keys(leadUpdates).length > 0) {
      const { error } = await supabase.from('leads').update(leadUpdates).eq('id', lead_id);
      if (error) console.error('[Pipeline] Erro update leads:', error);
      else appliedLead = true;
    }

    if (opp && Object.keys(oppPatch).length > 0) {
      const { error } = await supabase
        .from('opportunities')
        .update(oppPatch)
        .eq('id', opp.opportunity_id);
      if (error) console.error('[Pipeline] Erro update opportunities:', error);
      else appliedOpp = true;
    }

    if (appliedLead || appliedOpp) {
      auditLog.decision_type = 'crm_update';
      auditLog.output_action = {
        intent: data.intent,
        lead_changes: Object.keys(leadUpdates),
        opp_changes: Object.keys(oppPatch),
        opportunity_id: opp?.opportunity_id ?? null,
        tokens: auditLog.tokens_used,
      };
      auditLog.status = 'success';
    } else {
      auditLog.decision_type = 'no_action';
      auditLog.output_action = { intent: data.intent };
      auditLog.status = 'success';
    }

    return new Response(JSON.stringify({
      success: true,
      intent: data.intent,
      lead_updates: Object.keys(leadUpdates).length,
      opp_updates: Object.keys(oppPatch).length,
      opportunity_id: opp?.opportunity_id ?? null,
      tokens: auditLog.tokens_used
    }), { headers: corsHeaders });

  } catch (error) {
    console.error('[Pipeline] Erro:', error);
    auditLog.status = 'error';
    auditLog.decision_type = 'system_failure';
    auditLog.error_details = (error as Error).message;
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: corsHeaders });
  } finally {
    if (auditLog.lead_id) {
      const { error: auditError } = await supabase.from('ai_decisions').insert({
        lead_id: auditLog.lead_id,
        equipe_id: auditLog.equipe_id,
        decision_type: auditLog.decision_type,
        input_summary: auditLog.input_summary,
        output_action: auditLog.output_action || {},
        status: auditLog.status,
        error_details: auditLog.error_details,
        confidence_score: auditLog.confidence_score,
      });
      if (auditError) console.error("Erro Auditoria:", auditError);
    }
  }
});
