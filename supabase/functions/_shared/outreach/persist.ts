import type { DeliveryResult, OutreachLine } from "./providers.ts";
import { insertConversationOnce, updateConversationOnce } from "../conversation-once.ts";

export async function persistDeliveredMessage(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  input: {
    jobId: string;
    enrollmentId: string;
    sequenceId: string;
    stepPosition: number;
    equipeId: string;
    leadId: string;
    text: string;
    line: OutreachLine;
    delivery: DeliveryResult;
  },
): Promise<string> {
  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await supabase
    .from("conversations")
    .select("id, status, opened_at")
    .eq("lead_id", input.leadId)
    .eq("channel", "whatsapp")
    .neq("status", "deleted")
    .order("status", { ascending: true }) // 'active' < 'archived': prefere a ativa
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;

  const patch: Record<string, unknown> = {
    opened_via: "cadence",
    last_message_at: now,
  };
  if (!existing?.opened_at) patch.opened_at = now;
  if (input.line.provider === "gptmaker") {
    patch.provider_channel_id = input.line.lineId;
  }
  if (input.line.provider === "solo") {
    patch.solo_instance_id = input.line.lineId;
  }
  if (input.delivery.providerChatId) {
    patch.gpt_maker_chat_id = input.delivery.providerChatId;
  }

  let conversationId: string;
  if (existing) {
    conversationId = existing.id;
    if (existing.status === "archived") {
      patch.status = "active";
      patch.archived_at = null;
    }
    conversationId = await updateConversationOnce(supabase, conversationId, patch, {
      lead_id: input.leadId,
      channel: "whatsapp",
    });
  } else {
    conversationId = (await insertConversationOnce(supabase, {
      lead_id: input.leadId,
      equipe_id: input.equipeId,
      channel: "whatsapp",
      status: "active",
      atendido_por_agente: false,
      unread_count: 0,
      ...patch,
    })).id;
  }

  const { error: messageError } = await supabase.from("messages").insert({
    lead_id: input.leadId,
    conversation_id: conversationId,
    content: input.text,
    sender_type: "agent",
    sender_id: null,
    provider: input.line.provider,
    provider_message_id: input.delivery.providerMessageId,
    created_at: now,
  });
  if (messageError) throw messageError;

  const { error: activityError } = await supabase.from("lead_activities")
    .insert({
      lead_id: input.leadId,
      tipo: "cadence_message_sent",
      descricao: "Mensagem de cadência enviada pelo Rev",
      metadata: {
        job_id: input.jobId,
        enrollment_id: input.enrollmentId,
        sequence_id: input.sequenceId,
        step_position: input.stepPosition,
        provider: input.line.provider,
        line_key: input.line.key,
      },
    });
  if (activityError) throw activityError;
  return conversationId;
}
