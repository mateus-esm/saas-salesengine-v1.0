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
    description: "Classify the contact as a lead (goes into pipeline) or contact (database only, no commercial interest)",
    parameters: {
      type: "object",
      properties: {
        lead_type: {
          type: "string",
          enum: ["lead", "contact"],
          description: "lead = commercial interest (goes to pipeline), contact = no interest/support/spam (database only)"
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
    name: "update_lead_field",
    description: "Update specific lead fields with extracted data from conversation",
    parameters: {
      type: "object",
      properties: {
        field: {
          type: "string",
          enum: ["name", "email", "phone", "company", "position"],
          description: "The field to update"
        },
        value: {
          type: "string",
          description: "The value to set"
        }
      },
      required: ["field", "value"]
    }
  },
  {
    name: "create_note",
    description: "Create an automatic note summarizing important information mentioned by the client",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "Concise summary of the important information (pain points, needs, budget, timeline, etc.)"
        }
      },
      required: ["summary"]
    }
  },
  {
    name: "schedule_meeting",
    description: "Schedule a meeting with date, time, and optional link",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Meeting date in ISO format (YYYY-MM-DD)"
        },
        time: {
          type: "string",
          description: "Meeting time (HH:MM)"
        },
        link: {
          type: "string",
          description: "Meeting link (Google Meet, Zoom, etc.) if mentioned"
        }
      },
      required: ["date", "time"]
    }
  },
  {
    name: "update_stage",
    description: "Move the lead to a different pipeline stage based on context",
    parameters: {
      type: "object",
      properties: {
        stage_name: {
          type: "string",
          enum: ["Novo Lead", "Qualificação", "Reunião Agendada", "Proposta Enviada", "Fechado", "Desqualificado", "Perdido", "Reciclo"],
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

const SYSTEM_PROMPT = `Você é o Orquestrador Operacional do CRM SoloAI. Sua missão é ACELERAR o preenchimento do CRM analisando conversas de WhatsApp.

CLASSIFICAÇÃO INICIAL (PRIMEIRO CONTATO):
- Se a pessoa demonstra INTERESSE em serviços (tráfego pago, "quero saber mais", perguntas sobre produtos/serviços):
  → classify_contact({ lead_type: 'lead' })
  → update_stage({ stage_name: 'Novo Lead' })
  
- Se NÃO há interesse comercial (cliente ativo pedindo suporte, spam, pessoal, "número errado"):
  → classify_contact({ lead_type: 'contact' })
  → NÃO entra no pipeline, fica apenas no database

EXTRAÇÃO CONTÍNUA DE DADOS:
- SEMPRE use update_lead_field() para preencher: nome, email, empresa, telefone, cargo
- SEMPRE use create_note() para registrar informações relevantes (dores, necessidades, orçamento, prazos)
- Se cliente mencionar reunião: use schedule_meeting() com data, hora e link
- Se contexto mudar: use update_stage() (ex: "enviei a proposta" → "Proposta Enviada")

FASES DO PIPELINE:
Novo Lead → Qualificação → Reunião Agendada → Proposta Enviada → Fechado
Saídas: Desqualificado, Perdido, Reciclo

GATILHOS AUTOMÁTICOS:
- "quero agendar" / "vamos marcar" → Reunião Agendada
- "enviei a proposta" / "segue proposta" → Proposta Enviada
- "fechamos" / "aprovado" / "vamos começar" → Fechado
- "não tenho interesse" / "não vou seguir" → Perdido
- "não atende nosso perfil" → Desqualificado

REGRAS:
- Seja PROATIVO: preencha tudo que puder automaticamente
- Crie notas CONCISAS com informações-chave
- Detecte mudanças de contexto e atualize fases
- Você pode chamar MÚLTIPLAS funções se necessário
- Trabalhe como braço operacional, não como filtro`;


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

        case 'update_lead_field':
          const fieldUpdates: any = {};

          // Map field names to database columns
          if (functionArgs.field === 'company' || functionArgs.field === 'position') {
            // Store in custom_fields for company and position
            const { data: currentLead } = await supabase
              .from('leads')
              .select('custom_fields')
              .eq('id', lead_id)
              .single();

            fieldUpdates.custom_fields = {
              ...(currentLead?.custom_fields || {}),
              [functionArgs.field]: functionArgs.value
            };
          } else {
            // Direct field mapping for name, email, phone
            fieldUpdates[functionArgs.field] = functionArgs.value;
          }

          await supabase
            .from('leads')
            .update(fieldUpdates)
            .eq('id', lead_id);

          console.log(`[analyze-message] Updated field: ${functionArgs.field} = ${functionArgs.value}`);
          actions.push({ action: 'update_lead_field', ...functionArgs });
          break;

        case 'create_note':
          // Create automatic note from AI
          await supabase.from('messages').insert({
            lead_id,
            content: `[IA - Nota] ${functionArgs.summary}`,
            sender_type: 'system'
          });

          console.log(`[analyze-message] Created note: ${functionArgs.summary}`);
          actions.push({ action: 'create_note', ...functionArgs });
          break;

        case 'schedule_meeting':
          // Combine date and time into ISO datetime
          const meetingDateTime = `${functionArgs.date}T${functionArgs.time}:00`;

          const meetingUpdates: any = {
            meeting_date: meetingDateTime,
            meeting_scheduled: true
          };

          if (functionArgs.link) {
            meetingUpdates.meeting_notes = functionArgs.link;
          }

          await supabase
            .from('leads')
            .update(meetingUpdates)
            .eq('id', lead_id);

          // Automatically move to "Reunião Agendada" stage
          const { data: meetingStages } = await supabase
            .from('pipeline_stages')
            .select('id')
            .eq('name', 'Reunião Agendada')
            .limit(1);

          if (meetingStages && meetingStages.length > 0) {
            await supabase
              .from('leads')
              .update({ stage_id: meetingStages[0].id, stage_entered_at: new Date().toISOString() })
              .eq('id', lead_id);
          }

          await supabase.from('messages').insert({
            lead_id,
            content: `[Sistema] Reunião agendada para ${functionArgs.date} às ${functionArgs.time}${functionArgs.link ? '. Link: ' + functionArgs.link : ''}`,
            sender_type: 'system'
          });

          console.log(`[analyze-message] Meeting scheduled: ${meetingDateTime}`);
          actions.push({ action: 'schedule_meeting', ...functionArgs });
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
              .update({ stage_id: stages[0].id, stage_entered_at: new Date().toISOString() })
              .eq('id', lead_id);

            await supabase.from('messages').insert({
              lead_id,
              content: `[Sistema] Lead movido para: ${functionArgs.stage_name}. Motivo: ${functionArgs.reason}`,
              sender_type: 'system'
            });
          }

          actions.push({ action: 'update_stage', ...functionArgs });
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
