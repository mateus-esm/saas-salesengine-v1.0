import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.28.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- DEFINIÇÃO DO SCHEMA DO BANCO (O que a IA pode preencher) ---
// Isso guia a "visão" da IA sobre o que é importante.
const CRM_SCHEMA = `
CAMPOS DISPONÍVEIS PARA EXTRAÇÃO:
- name (Texto)
- email (Email válido)
- phone (Telefone)
- company (Nome da empresa)
- position (Cargo)
- custom_fields: {
    avg_consumption: (Ex: "1000 kWh"),
    roof_type: (Ex: "Fibrocimento", "Telha", "Laje"),
    system_type: (Ex: "Investimento", "Assinatura"),
    budget_estimation: (Valor monetário citado)
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

  try {
    const { lead_id } = await req.json(); // Só precisamos do ID, o resto buscamos no banco para garantir integridade

    // 1. SETUP & CONTEXTO
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });

    // 2. BUSCAR DADOS REAIS (Histórico Rico)
    // Buscamos as últimas 15 mensagens para a IA ter contexto total (email passado antes, link enviado depois)
    const { data: messages } = await supabase
      .from('messages')
      .select('content, sender_type, created_at')
      .eq('lead_id', lead_id)
      .order('created_at', { ascending: true }) // Ordem cronológica
      .limit(20);

    const { data: lead } = await supabase
      .from('leads')
      .select('*, pipeline_stages(name)')
      .eq('id', lead_id)
      .single();

    if (!lead || !messages) throw new Error("Dados insuficientes.");

    // Formata o histórico como um "Roteiro de Teatro" para a IA
    const historyScript = messages.map(m =>
      `[${m.created_at}] ${m.sender_type === 'customer' ? 'CLIENTE' : 'BOT/SOLON'}: ${m.content}`
    ).join('\n');

    const today = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    // =================================================================================
    // FASE 1: O EXTRATOR DE DADOS (The Schema Filler) 🕵️‍♂️
    // =================================================================================
    // Aqui não pedimos ações. Pedimos DADOS. A IA olha pro passado e preenche o formulário.

    const extractionPrompt = `
      Você é o Auditor de Dados do CRM Solo Ventures.
      Hoje é: ${today}.
      
      SUA MISSÃO:
      Ler o histórico da conversa abaixo e extrair TODOS os dados técnicos e cadastrais mencionados.
      
      REGRAS CRÍTICAS:
      1. **Reuniões:** Se o BOT enviou um link de reunião (ex: Google Meet), capture-o em 'meeting_info.link'.
      2. **Contexto:** O email pode ter sido passado 5 mensagens atrás. Encontre-o.
      3. **Técnico:** Procure por consumo (kWh) e tipo de telhado.
      4. **Data:** Se falarem "quinta-feira", calcule a data baseada no dia de hoje (${today}).
      
      SCHEMA ALVO:
      ${CRM_SCHEMA}
    `;

    // Definimos a ferramenta de extração (Force Function Calling)
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
                    avg_consumption: { type: "string" },
                    roof_type: { type: "string" }
                  }
                },
                meeting_info: {
                  type: "object",
                  properties: {
                    scheduled: { type: "boolean" },
                    date_iso: { type: "string", description: "ISO format com timezone correto" },
                    link: { type: "string" },
                    briefing: { type: "string" }
                  },
                  required: ["scheduled"]
                },
                intent_classification: {
                  type: "string",
                  enum: ["INTERESTED", "SCHEDULED", "DISQUALIFIED", "SPAM", "UNKNOWN"],
                  description: "Estado atual do lead baseado na conversa."
                }
              }
            }
          },
          required: ["extracted_data"]
        }
      }
    }];

    console.log(`[Pipeline] Analisando histórico de ${messages.length} mensagens...`);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o", // Modelo mais inteligente para ler contexto longo
      messages: [
        { role: "system", content: extractionPrompt },
        { role: "user", content: `HISTÓRICO DA CONVERSA:\n\n${historyScript}` }
      ],
      tools: tools,
      tool_choice: { type: "function", function: { name: "save_crm_data" } },
      temperature: 0.1 // Baixa temperatura para precisão
    });

    const toolCall = completion.choices[0].message.tool_calls?.[0];

    // =================================================================================
    // FASE 2: O EXECUTOR (Regras de Negócio) 💾
    // =================================================================================

    if (toolCall) {
      const { extracted_data } = JSON.parse(toolCall.function.arguments);
      console.log(`[Pipeline] Dados Extraídos:`, JSON.stringify(extracted_data, null, 2));

      // 1. Atualização Cadastral (Merge inteligente)
      const updates: any = {};

      // Só atualiza se tiver dado novo e diferente
      if (extracted_data.name && extracted_data.name !== lead.name) updates.name = extracted_data.name;
      if (extracted_data.email && extracted_data.email !== lead.email) updates.email = extracted_data.email;

      // Custom Fields (Merge)
      if (extracted_data.custom_fields) {
        updates.custom_fields = {
          ...(lead.custom_fields || {}),
          ...Object.fromEntries(Object.entries(extracted_data.custom_fields).filter(([_, v]) => v != null))
        };
      }

      // 2. Lógica de Agendamento (Sua prioridade)
      if (extracted_data.meeting_info?.scheduled && extracted_data.meeting_info?.date_iso) {

        // Busca a fase "Reunião Agendada"
        const { data: stage } = await supabase.from('pipeline_stages').select('id').eq('name', 'Reunião Agendada').eq('equipe_id', lead.equipe_id).maybeSingle();

        updates.meeting_scheduled = true;
        updates.meeting_date = extracted_data.meeting_info.date_iso;

        // Monta a nota rica com Link
        const link = extracted_data.meeting_info.link || "Link pendente";
        const briefing = extracted_data.meeting_info.briefing || "Reunião comercial";
        updates.meeting_notes = `[IA Auto-Schedule]\nLink: ${link}\nBriefing: ${briefing}`;

        // Move o card
        if (stage) updates.stage_id = stage.id;

        // Avisa no chat interno se for novidade
        if (!lead.meeting_scheduled) {
          await supabase.from('messages').insert({
            lead_id, sender_type: 'system', content: `📅 Reunião detectada e agendada para ${new Date(updates.meeting_date).toLocaleString()}.`
          });
        }
      }

      // 3. Lógica de Desqualificação (Cuidado para não ser agressivo)
      if (extracted_data.intent_classification === 'DISQUALIFIED' || extracted_data.intent_classification === 'SPAM') {
        // Só desqualifica se a IA tiver certeza absoluta
        updates.lead_type = 'contact';
        updates.qualification_status = 'disqualified';
      }

      // 4. Salvar no Banco
      if (Object.keys(updates).length > 0) {
        await supabase.from('leads').update(updates).eq('id', lead_id);

        // Log de Auditoria
        await supabase.from('ai_decisions').insert({
          lead_id,
          intent_detected: extracted_data.intent_classification,
          action_taken: updates,
          raw_response: extracted_data
        });
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });

  } catch (error) {
    console.error('[Pipeline] Erro:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: corsHeaders });
  }
});