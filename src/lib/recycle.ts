// Sprint 15b · T4 — o diálogo do Reciclo: padrões da etapa e o que vai para a RPC.
//
// Os padrões vêm da etapa-alvo (pipeline_stages_v2): cycle_days → data,
// cycle_target_stage_id → "Voltar para", recycle_notify_owner,
// recycle_send_message e recycle_message_template. O que o usuário muda no
// diálogo vale só para aquele negócio.

import { defaultDue, dueAtFromLocal, type FollowupFormValue } from "@/lib/followups";

export interface RecycleStageDefaults {
  stage_type?: string;
  cycle_days?: number | null;
  cycle_target_stage_id?: string | null;
  recycle_notify_owner?: boolean | null;
  recycle_send_message?: boolean | null;
  recycle_message_template?: string | null;
}

export interface RecycleStageOption {
  id: string;
  name: string;
  stage_type?: string;
}

/** Os motivos de Reciclo do funil (pipelines.recycle_reasons); coluna malformada = nenhum. */
export function recycleReasonsOf(pipeline: { recycle_reasons?: unknown } | null | undefined): string[] {
  const raw = pipeline?.recycle_reasons;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => (typeof r === "string" ? r : (r as { label?: unknown } | null)?.label))
    .filter((r): r is string => typeof r === "string" && r.trim() !== "");
}

/** Etapas para onde o negócio pode voltar: abertas ou de ciclo, nunca ganho/perdido nem a própria. */
export function returnStageOptions<T extends RecycleStageOption>(stages: T[], targetStageId: string): T[] {
  return stages.filter((s) => s.id !== targetStageId && (s.stage_type === "open" || s.stage_type === "ciclo"));
}

/** Valores iniciais do formulário do Reciclo, a partir dos padrões da etapa. */
export function recycleInitialValue(
  stage: RecycleStageDefaults | null | undefined,
  ownerId: string | null,
  returnable: { id: string }[],
  now: Date = new Date(),
): FollowupFormValue {
  const { date, time } = defaultDue(stage?.cycle_days || 7, now);
  const target = stage?.cycle_target_stage_id ?? null;
  return {
    date,
    time,
    ownerId,
    reason: "",
    notifyOwner: stage?.recycle_notify_owner ?? true,
    sendMessage: stage?.recycle_send_message ?? false,
    channel: "whatsapp",
    messageText: stage?.recycle_message_template ?? "",
    returnStageId: target && returnable.some((s) => s.id === target) ? target : null,
    willReturn: true,
  };
}

/** Argumentos de crm_schedule_followup (kind recycle) para o que o usuário preencheu. */
export interface RecycleScheduleInput {
  dueAt: string;
  kind: "recycle";
  ownerId: string | null;
  reason: string;
  notifyOwner: boolean;
  sendMessage: boolean;
  messageText: string | null;
  returnStageId: string | null;
}

/**
 * "Vai voltar? Não" só registra o motivo: follow-up recycle sem aviso, sem mensagem
 * e sem etapa de volta, com data daqui a 1 minuto (a RPC exige data futura).
 */
export function recycleScheduleInput(value: FollowupFormValue, hasLine: boolean, now: Date = new Date()): RecycleScheduleInput {
  const reason = value.reason.trim();
  if (value.willReturn === false) {
    return {
      dueAt: new Date(now.getTime() + 60_000).toISOString(),
      kind: "recycle",
      ownerId: null,
      reason,
      notifyOwner: false,
      sendMessage: false,
      messageText: null,
      returnStageId: null,
    };
  }
  // Sem linha de WhatsApp o padrão "enviar mensagem" não pode travar o Reciclo.
  const sendMessage = value.sendMessage && hasLine;
  return {
    dueAt: dueAtFromLocal(value.date, value.time),
    kind: "recycle",
    ownerId: value.ownerId,
    reason,
    notifyOwner: value.notifyOwner,
    sendMessage,
    messageText: sendMessage ? value.messageText : null,
    returnStageId: value.returnStageId,
  };
}
