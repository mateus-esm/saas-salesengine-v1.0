import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.28.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- DEFINIÇÃO DO SCHEMA DO BANCO ---
// Atualizado para usar chaves em PORTUGUÊS para alinhar com o frontend (src/config/tenants.ts)
const CRM_SCHEMA = `
CAMPOS DISPONÍVEIS PARA EXTRAÇÃO:
- name (Texto)
- email (Email válido)
- phone (Telefone)
- company (Nome da empresa)
- position (Cargo)
- custom_fields: {
    consumo_medio: (Ex: "1000 kWh" - extrair apenas números se possível),
    tipo_telhado: (Ex: "Fibrocimento", "Telha", "Laje", "Metálico", "Cerâmica"),
    valor_conta: (Valor monetário da conta de energia, apenas números. Ex: 500.50)
}
- meeting_info: {
    scheduled: (Boolean - Só marque true se estiver confirmado),
    date_iso: (ISO 8601 Format YYYY-MM-DDTHH:MM:SS),
    link: (Link do Meet/Zoom enviado pelo BOT ou Cliente),
    briefing: (Resumo técnico do que foi discutido)
}
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // 1. Variáveis de Auditoria
  const auditLog = {
    lead_id: null as string | null,
    equipe_id: null as string | null,
    decision_type: 'analysis_started',
    input_summary: 'Iniciando análise...',
    output_action: {} as Record<string, any>,
    status: 'processing',
    error_details: null as string | null,
    confidence_score: 0 // Default 0
  };

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const { lead_id } = await req.json();
    auditLog.lead_id = lead_id;

    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });

    // 2. BUSCAR DADOS
    const { data: messages } = await supabase
      .from('messages')
      .select('content, sender_type, created_at')
      .eq('lead_id', lead_id)
      .order('created_at', { ascending: true })
      .limit(40);

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*, pipeline_stages(name)')
      .eq('id', lead_id)
      .single();

    if (leadError || !lead) throw new Error(`Lead search error: ${leadError?.message || 'Lead not found'}`);
    
    auditLog.equipe_id = lead.equipe_id;
    auditLog.input_summary = `Analisando ${messages?.length || 0} msgs de ${lead.name}`;

    if (!messages || messages.length === 0) {
       auditLog.status = 'warning';
       auditLog.output_action = { msg: "Sem histórico de mensagens" };
       throw new Error("Dados insuficientes: Sem mensagens.");
    }

    const historyScript = messages.map(m =>
      `[${m.created_at}] ${m.sender_type === 'customer' ? 'CLIENTE' : 'BOT/SOLON'}: ${m.content}`
    ).join('\n');

    const today = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const extractionPrompt = `
      Você é o Auditor de Dados do CRM Solo Ventures (Solon).
      Hoje é: ${today}.
      
      SUA MISSÃO:
      Ler o histórico e extrair dados técnicos (Consumo, Tipo Telhado, Valor Conta) e DETECTAR REUNIÕES.
      
      REGRAS CRÍTICAS - MODO SUPER INTELIGENTE (Level 5):
      1. **AGENDAMENTO AGRESSIVO:** Se o usuário confirmou um horário (ex: "sim", "12", "topo", "pode ser"), MARQUE 'scheduled: true' IMEDIATAMENTE.
         - NÃO ESPERE O EMAIL.
         - O fato de ter escolhido o horário JÁ É um agendamento.
      2. **Extração PT-BR:** Use chaves em PORTUGUÊS: consumo_medio, tipo_telhado, valor_conta.
      3. **Contexto Longo:** Analise as 100 msgs para entender a negociação.
      
      SCHEMA:
      ${CRM_SCHEMA}
    `;

    // Atualizado para chaves em Português
    const tools = [{
      type: "function" as const,
      function: {
        name: "save_crm_data",
        description: "Salva os dados extraídos no banco de dados.",
        parameters: {
          type: "object",
          properties: {
            extracted_data: {
              type: "object",
              properties: {
                name: { type: "string" },
                email: { type: "string" },
                custom_fields: {
                  type: "object",
                  properties: {
                    consumo_medio: { type: "string" },
                    tipo_telhado: { type: "string" },
                    valor_conta: { type: "string" }
                  }
                },
                meeting_info: {
                  type: "object",
                  properties: {
                    scheduled: { type: "boolean" },
                    date_iso: { type: "string" },
                    link: { type: "string" },
                    briefing: { type: "string" }
                  },
                  required: ["scheduled"]
                },
                intent_classification: {
                  type: "string",
                  enum: ["INTERESTED", "SCHEDULED", "DISQUALIFIED", "SPAM", "UNKNOWN"],
                  description: "Classificação da intenção do cliente"
                }
              }
            }
          },
          required: ["extracted_data"]
        }
      }
    }];

    console.log(`[Pipeline] Analisando...`);

    const completion = await openai.chat.completions.create({
      model: "gpt-5", // Modelo Level 5 (Next Gen)
      messages: [
        { role: "system", content: extractionPrompt },
        { role: "user", content: `HISTÓRICO:\n\n${historyScript}` }
      ],
      tools: tools,
      tool_choice: { type: "function", function: { name: "save_crm_data" } }
    });

    const toolCall = completion.choices[0].message.tool_calls?.[0];

    if (toolCall) {
      const { extracted_data } = JSON.parse(toolCall.function.arguments);
      console.log(`[Pipeline] Dados:`, JSON.stringify(extracted_data));

      // Define confiança baseada na presença de tool call (GPT-4o usually high confidence)
      auditLog.confidence_score = 1.0; 

      const updates: any = {};

      // 1. Merge Cadastral
      if (extracted_data.name && extracted_data.name !== lead.name) updates.name = extracted_data.name;
      if (extracted_data.email && extracted_data.email !== lead.email) updates.email = extracted_data.email;

      // 2. Merge Custom Fields
      if (extracted_data.custom_fields) {
        updates.custom_fields = {
          ...(lead.custom_fields || {}),
          ...Object.fromEntries(Object.entries(extracted_data.custom_fields).filter(([_, v]) => v != null))
        };
      }

      // 3. Lógica de Agendamento (Prioridade Máxima)
      // Se a IA marcou scheduled: true OU detectou intenção clara de agendamento (Ex: usuário confirmou horário)
      const isScheduled = extracted_data.meeting_info?.scheduled || extracted_data.intent_classification === 'SCHEDULED';
      
      if (isScheduled) {
        // Busca fase 'Reunião Agendada'
        const { data: stage } = await supabase
            .from('pipeline_stages')
            .select('id')
            .eq('name', 'Reunião Agendada')
            .eq('equipe_id', lead.equipe_id)
            .maybeSingle();

        updates.meeting_scheduled = true;
        // Se a data não veio no JSON (falha de extração), tentamos manter a que já existe ou usar 'hoje' como fallback provisório,
        // mas o ideal é confiar na extração. Se veio null, não atualizamos a data para não quebrar.
        if (extracted_data.meeting_info?.date_iso) {
            updates.meeting_date = extracted_data.meeting_info.date_iso;
        } else if (!lead.meeting_date) { // Se não extraiu e não tem data anterior, usa hoje
            updates.meeting_date = new Date().toISOString();
        }

        updates.meeting_notes = `[IA Auto-Schedule] Intenção: ${extracted_data.intent_classification}. Link: ${extracted_data.meeting_info?.link || "Pendente"}`;
        
        if (stage) {
             updates.stage_id = stage.id;
             console.log(`[Pipeline] 🚀 REUNIÃO DETECTADA! Movendo para ${stage.id}`);
        }
      }
      // 4. Lógica de Qualificação (NOVO)
      // Se está INTERESSADO, não agendou reunião ainda, e está no início do funil
      else if (extracted_data.intent_classification === 'INTERESTED') {
          const currentStageName = lead.pipeline_stages?.name;
          
          // Se estiver em 'Novo Lead' ou sem etapa, avança para 'Qualificação'
          if (!currentStageName || currentStageName === 'Novo Lead') {
              const { data: qualStage } = await supabase
                .from('pipeline_stages')
                .select('id')
                .eq('name', 'Qualificação')
                .eq('equipe_id', lead.equipe_id)
                .maybeSingle();
              
              if (qualStage) {
                  updates.stage_id = qualStage.id;
                  console.log(`[Pipeline] Avançando para Qualificação (ID: ${qualStage.id})`);
              }
          }
      }

      // 5. Desqualificação
      if (extracted_data.intent_classification === 'DISQUALIFIED') {
        updates.lead_type = 'contact';
        updates.qualification_status = 'disqualified';
      }

      // 6. Aplicar Updates
      if (Object.keys(updates).length > 0) {
        await supabase.from('leads').update(updates).eq('id', lead_id);
        
        auditLog.decision_type = 'crm_update';
        auditLog.output_action = { 
            changes: updates, 
            intent: extracted_data.intent_classification,
            raw_data: extracted_data
        };
        auditLog.status = 'success';
      } else {
        auditLog.decision_type = 'no_action';
        auditLog.output_action = { reason: "Nada novo", raw: extracted_data };
        auditLog.status = 'success';
      }

    } else {
         auditLog.decision_type = 'skipped';
         auditLog.output_action = { reason: "Sem tool call" };
         auditLog.status = 'success';
    }

    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });

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