import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.28.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- MENU DE FERRAMENTAS DO AGENTE ---
const AI_FUNCTIONS = [
  {
    name: "schedule_meeting_complete",
    description: "Use quando confirmar uma reunião. Atualiza data, link, briefing e move o card.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Data YYYY-MM-DD" },
        time: { type: "string", description: "Hora HH:MM" },
        link: { type: "string", description: "Link da call (Meet/Zoom) se houver" },
        briefing: { type: "string", description: "Resumo do que será tratado na reunião (Dores/Pauta)" }
      },
      required: ["date", "time", "briefing"]
    }
  },
  {
    name: "update_strategic_info",
    description: "Atualiza dados do lead (Nome, Empresa) e adiciona observações estratégicas.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        company: { type: "string" },
        position: { type: "string" },
        new_observation: { 
          type: "string", 
          description: "Informação CRÍTICA para salvar nas notas (Ex: Orçamento de 50k, Decisor é o Diretor, Usa concorrente X)." 
        },
        custom_fields: {
          type: "object",
          description: "Dados específicos como: niche, team_size, tool_stack"
        }
      }
    }
  },
  {
    name: "disqualify_contact",
    description: "Use APENAS se o lead for explicitamente descartado (spam, engano, sem fit nenhum). Remove do pipeline.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Por que não é um lead?" }
      },
      required: ["reason"]
    }
  },
  {
    name: "move_stage_manual",
    description: "Move de fase manualmente se não for caso de reunião (ex: pediu proposta, fechou contrato).",
    parameters: {
      type: "object",
      properties: {
        stage_name: { type: "string", enum: ["Qualificação", "Proposta Enviada", "Fechado", "Perdido"] },
        reason: { type: "string" }
      },
      required: ["stage_name"]
    }
  }
];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { lead_id, message_content, conversation_history } = await req.json();

    // 1. Setup Admin
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });

    // 2. BUSCAR CONTEXTO ATUAL (Memória)
    const { data: lead } = await supabase
      .from('leads')
      .select('*, pipeline_stages(name)')
      .eq('id', lead_id)
      .single();

    if (!lead) throw new Error("Lead não encontrado");

    const currentNotes = lead.notes || "Sem observações.";
    const currentStage = lead.pipeline_stages?.name || "Novo Lead";

    // 3. PROMPT ESTRATÉGICO
    const SYSTEM_PROMPT = `
      Você é o Agente de CRM da Solo Ventures. Sua função é OUVIR a conversa e ORGANIZAR os dados.
      
      ESTADO ATUAL DO LEAD:
      - Nome: ${lead.name}
      - Fase: ${currentStage}
      - Tipo: ${lead.lead_type} (Padrão: 'lead')
      - Observações Atuais: "${currentNotes}"

      REGRAS DE OURO:
      1. **Reuniões:** Se confirmar data/hora, USE 'schedule_meeting_complete'. Isso é prioridade máxima.
      2. **Informação:** Se o cliente falar cargo, empresa ou detalhes do negócio, USE 'update_strategic_info'.
         - No campo 'new_observation', resuma apenas o que é NOVO e RELEVANTE. Não repita o que já está nas notas.
         - Seja analítico: "Cliente tem budget X", "Urgência alta", "Dor principal é Y".
      3. **Desqualificação:** Só use 'disqualify_contact' se o cliente disser "não tenho interesse", "número errado" ou for spam.
         - Se ele for 'contact', ele sai do Pipeline (Kanban), mas continua no Chat.
      4. **Fases:** - Pediu preço/info -> Qualificação
         - Pediu proposta -> Proposta Enviada
         - Aceitou -> Fechado

      Não alucine dados. Só preencha o que estiver explícito ou óbvio na conversa.
    `;

    // 4. PENSAMENTO DA IA
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Histórico:\n${conversation_history}\n\nÚltima msg: "${message_content}"` }
      ],
      functions: AI_FUNCTIONS,
      function_call: "auto",
    });

    const aiDecision = completion.choices[0].message;

    // 5. EXECUÇÃO DAS AÇÕES
    if (aiDecision.function_call) {
      const fn = aiDecision.function_call.name;
      const args = JSON.parse(aiDecision.function_call.arguments);
      console.log(`[Analyze] Executando: ${fn}`, args);

      // Log de Auditoria
      await supabase.from('ai_decisions').insert({
        lead_id, intent_detected: fn, action_taken: args, raw_response: aiDecision
      });

      switch (fn) {
        case 'schedule_meeting_complete':
          // 1. Achar Fase "Reunião Agendada"
          const { data: stageMeet } = await supabase.from('pipeline_stages').select('id').eq('name', 'Reunião Agendada').maybeSingle();
          
          // 2. Preparar Notas da Reunião
          const meetingNote = `[IA] Agendado para ${args.date} ${args.time}.\nLink: ${args.link || 'A definir'}\nBriefing: ${args.briefing}`;
          
          // 3. Update Monstro
          await supabase.from('leads').update({
            meeting_scheduled: true,
            meeting_date: `${args.date}T${args.time}:00`,
            meeting_notes: meetingNote, // Salva link e briefing aqui
            stage_id: stageMeet?.id || lead.stage_id // Move se achar a fase
          }).eq('id', lead_id);

          await supabase.from('messages').insert({
            lead_id, sender_type: 'system', content: `📅 Reunião Confirmada: ${args.date} às ${args.time}.`
          });
          break;

        case 'update_strategic_info':
          const updates: any = {};
          if (args.name) updates.name = args.name;
          if (args.company) updates.company = args.company;
          if (args.position) updates.position = args.position;
          
          // Lógica de Append nas Notas (Não apaga o velho)
          if (args.new_observation) {
            const timestamp = new Date().toLocaleString('pt-BR');
            // Adiciona nova linha no topo ou fim
            updates.notes = `${currentNotes === 'Sem observações.' ? '' : currentNotes + '\n'}- [${timestamp}] ${args.new_observation}`;
          }

          // Custom Fields (Merge inteligente)
          if (args.custom_fields) {
            updates.custom_fields = { ...(lead.custom_fields || {}), ...args.custom_fields };
          }

          if (Object.keys(updates).length > 0) {
            await supabase.from('leads').update(updates).eq('id', lead_id);
          }
          break;

        case 'disqualify_contact':
          // Muda para contact (sai do pipeline visualmente, mas fica no banco)
          await supabase.from('leads').update({ 
            lead_type: 'contact',
            qualification_status: 'disqualified' 
          }).eq('id', lead_id);
          
          await supabase.from('messages').insert({
            lead_id, sender_type: 'system', content: `🚫 Lead desqualificado: ${args.reason}`
          });
          break;

        case 'move_stage_manual':
           const { data: stg } = await supabase.from('pipeline_stages').select('id').eq('name', args.stage_name).maybeSingle();
           if (stg) {
             await supabase.from('leads').update({ stage_id: stg.id }).eq('id', lead_id);
             await supabase.from('messages').insert({
                lead_id, sender_type: 'system', content: `🚀 Fase atualizada: ${args.stage_name}`
             });
           }
           break;
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  } catch (error) {
    console.error((error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: corsHeaders });
  }
});
