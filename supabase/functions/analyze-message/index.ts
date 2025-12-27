import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.28.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// OpenAI Function Definitions
const AI_FUNCTIONS = [
  {
    name: "classify_contact",
    description: "Classify the contact as a lead (potential buyer), contact (just curious/support), or spam",
    parameters: {
      type: "object",
      properties: {
        lead_type: {
          type: "string",
          enum: ["lead", "contact", "spam"],
          description: "The classification of this contact"
        },
        reason: {
          type: "string",
          description: "Brief reason for this classification"
        }
      },
      required: ["lead_type", "reason"]
    }
  },
  {
    name: "update_stage",
    description: "Move the lead to a different pipeline stage based on their intent",
    parameters: {
      type: "object",
      properties: {
        stage_name: {
          type: "string",
          enum: ["Qualificação", "Reunião Agendada", "Proposta Enviada", "Fechado", "Desqualificado", "Perdido", "Reciclo"],
          description: "The stage to move the lead to"
        },
        reason: {
          type: "string",
          description: "Why the lead should be moved to this stage"
        }
      },
      required: ["stage_name", "reason"]
    }
  },
  {
    name: "extract_data",
    description: "Extract structured data from the conversation (name, company, email, budget)",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Contact name if mentioned" },
        company: { type: "string", description: "Company name if mentioned" },
        email: { type: "string", description: "Email if mentioned" },
        budget: { type: "number", description: "Budget/opportunity value if mentioned" }
      }
    }
  },
  {
    name: "create_touchpoint",
    description: "Create a note/touchpoint summarizing an important interaction or event",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "Summary of the touchpoint/interaction"
        },
        type: {
          type: "string",
          enum: ["call", "email", "meeting", "note", "whatsapp"],
          description: "Type of touchpoint"
        }
      },
      required: ["summary"]
    }
  },
  {
    name: "request_handoff",
    description: "Request human takeover when the AI cannot handle the situation",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Why human intervention is needed"
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Priority of the handoff request"
        }
      },
      required: ["reason"]
    }
  }
];

const SYSTEM_PROMPT = `Você é o Orquestrador do CRM SoloAI. Analise a conversa do WhatsApp e decida qual ação tomar.

REGRAS:
1. Se o cliente demonstrou INTENÇÃO DE COMPRA clara (pediu preço, demonstração, quer contratar) → use update_stage("Qualificação")
2. Se o cliente AGENDOU REUNIÃO ou quer agendar → use update_stage("Reunião Agendada")
3. Se o cliente é apenas CURIOSO sem potencial, ou é SUPORTE/DÚVIDA TÉCNICA → use classify_contact("contact")
4. Se é SPAM, propaganda, ou número errado → use classify_contact("spam")
5. Se o cliente DESISTIU ou disse não ter interesse → use update_stage("Perdido")
6. Se o cliente pediu para FALAR COM HUMANO → use request_handoff
7. Se há DADOS IMPORTANTES na mensagem (nome, empresa, email, valor) → use extract_data
8. Se foi uma INTERAÇÃO RELEVANTE que vale registrar → use create_touchpoint

IMPORTANTE:
- Novos contatos começam como "lead" por padrão
- Só mude para "contact" se CLARAMENTE não é potencial de venda
- Seja conservador: na dúvida, mantenha como lead
- Você pode chamar MÚLTIPLAS funções se necessário`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lead_id, message_content, conversation_history } = await req.json();
    
    if (!lead_id || !message_content) {
      throw new Error("lead_id and message_content are required");
    }

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
      console.log('[analyze-message] OPENAI_API_KEY not set, skipping analysis');
      return new Response(JSON.stringify({ skipped: true, reason: 'No API key' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const openai = new OpenAI({ apiKey: openaiKey });

    // Build conversation context
    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      { 
        role: "user" as const, 
        content: `Última mensagem do cliente: "${message_content}"\n\nHistórico recente:\n${conversation_history || 'Nenhum histórico disponível'}`
      }
    ];

    console.log('[analyze-message] Calling OpenAI for lead:', lead_id);

    // Call OpenAI with function calling
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      functions: AI_FUNCTIONS,
      function_call: "auto",
      temperature: 0.3,
    });

    const responseMessage = completion.choices[0].message;
    const actions: any[] = [];

    // Process function calls
    if (responseMessage.function_call) {
      const functionName = responseMessage.function_call.name;
      const functionArgs = JSON.parse(responseMessage.function_call.arguments);
      
      console.log(`[analyze-message] AI called: ${functionName}`, functionArgs);

      // Execute the function
      switch (functionName) {
        case 'classify_contact':
          await supabase
            .from('leads')
            .update({ lead_type: functionArgs.lead_type })
            .eq('id', lead_id);
          
          // Add system message for audit
          await supabase.from('messages').insert({
            lead_id,
            content: `[Sistema] Lead classificado como: ${functionArgs.lead_type}. Motivo: ${functionArgs.reason}`,
            sender_type: 'system'
          });
          
          actions.push({ action: 'classify_contact', ...functionArgs });
          break;

        case 'update_stage':
          // Find stage ID by name
          const { data: stages } = await supabase
            .from('pipeline_stages')
            .select('id')
            .eq('name', functionArgs.stage_name)
            .limit(1);
          
          if (stages && stages.length > 0) {
            await supabase
              .from('leads')
              .update({ stage_id: stages[0].id })
              .eq('id', lead_id);
            
            await supabase.from('messages').insert({
              lead_id,
              content: `[Sistema] Lead movido para: ${functionArgs.stage_name}. Motivo: ${functionArgs.reason}`,
              sender_type: 'system'
            });
          }
          
          actions.push({ action: 'update_stage', ...functionArgs });
          break;

        case 'extract_data':
          const updates: any = {};
          if (functionArgs.name) updates.name = functionArgs.name;
          if (functionArgs.email) updates.email = functionArgs.email;
          if (functionArgs.budget) updates.opportunity_value = functionArgs.budget;
          if (functionArgs.company) {
            updates.custom_fields = { company: functionArgs.company };
          }
          
          if (Object.keys(updates).length > 0) {
            await supabase
              .from('leads')
              .update(updates)
              .eq('id', lead_id);
          }
          
          actions.push({ action: 'extract_data', ...functionArgs });
          break;

        case 'create_touchpoint':
          await supabase.from('touchpoints').insert({
            lead_id,
            content: functionArgs.summary,
            touchpoint_type: functionArgs.type || 'note'
          });
          
          actions.push({ action: 'create_touchpoint', ...functionArgs });
          break;

        case 'request_handoff':
          await supabase.from('messages').insert({
            lead_id,
            content: `[Sistema] Solicitação de atendimento humano. Motivo: ${functionArgs.reason}. Prioridade: ${functionArgs.priority || 'medium'}`,
            sender_type: 'system'
          });
          
          // Could also set a flag or send notification here
          actions.push({ action: 'request_handoff', ...functionArgs });
          break;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      lead_id,
      actions
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[analyze-message] Error:', error);
    return new Response(JSON.stringify({ 
      error: (error as Error).message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
