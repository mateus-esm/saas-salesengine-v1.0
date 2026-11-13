// Sprint 15b · T3 — follow-up agendado: tipos, datas e mensagens de erro.
//
// A tabela crm_followups e as RPCs crm_schedule_followup / crm_cancel_followup
// ainda não estão nos tipos gerados do Supabase; estes tipos são o contrato.

export const FOLLOWUP_TZ = "America/Sao_Paulo";

export type FollowupStatus = "scheduled" | "done" | "cancelled" | "failed";
export type FollowupKind = "manual" | "recycle";
export type FollowupChannel = "whatsapp" | "email";

export interface Followup {
  id: string;
  opportunity_id: string;
  kind: FollowupKind;
  reason: string | null;
  owner_id: string | null;
  due_at: string;
  notify_owner: boolean;
  send_message: boolean;
  channel: FollowupChannel;
  message_text: string | null;
  from_stage_id: string | null;
  return_stage_id: string | null;
  status: FollowupStatus;
  result: {
    message?: "sent" | "failed" | "skipped" | "unknown" | "cancelled";
    message_error?: string;
    notified?: boolean;
    return?: "moved" | "already_there" | "skipped_left_stage";
    cancel_reason?: string;
    error?: string;
  } | null;
  created_at: string;
  executed_at: string | null;
}

export interface FollowupFormValue {
  date: string; // yyyy-MM-dd
  time: string; // HH:mm
  ownerId: string | null;
  reason: string;
  notifyOwner: boolean;
  sendMessage: boolean;
  channel: FollowupChannel;
  messageText: string;
  returnStageId: string | null;
  /** Só no modo "recycle": false = sem data de volta, só registra o motivo. */
  willReturn?: boolean;
}

/** Partes de calendário de um instante, no fuso pedido. */
function zonedParts(instant: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute"), s: get("second") };
}

/** Quanto o relógio do fuso está à frente de UTC naquele instante, em ms. */
function offsetMs(instant: Date, tz: string): number {
  const p = zonedParts(instant, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(instant.getTime() / 1000) * 1000;
}

/** "2026-11-20" + "09:00" (hora de parede no fuso) → instante ISO em UTC. */
export function dueAtFromLocal(date: string, time: string, tz: string = FOLLOWUP_TZ): string {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, h, min);
  // Duas passadas cobrem a troca de horário de verão, se o fuso voltar a ter.
  let guess = wall - offsetMs(new Date(wall), tz);
  guess = wall - offsetMs(new Date(guess), tz);
  return new Date(guess).toISOString();
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Data padrão do agendamento: hoje (em Brasília) + N dias, às 09:00. */
export function defaultDue(daysAhead: number, now: Date = new Date()): { date: string; time: "09:00" } {
  const p = zonedParts(now, FOLLOWUP_TZ);
  const target = new Date(Date.UTC(p.y, p.m - 1, p.d + daysAhead));
  return { date: `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(target.getUTCDate())}`, time: "09:00" };
}

const ERROR_MESSAGES: Record<string, string> = {
  no_outreach_line: "Configure uma linha de WhatsApp em Outreach para enviar mensagens.",
  invalid_due_at: "Escolha uma data futura.",
  message_required: "Escreva a mensagem.",
  invalid_owner: "Esse responsável não faz parte da equipe.",
  invalid_return_stage: "A etapa de volta não existe mais neste funil. Escolha outra.",
  opportunity_not_found: "Esse negócio não está mais disponível.",
  followup_not_found: "Esse follow-up não está mais disponível.",
  not_authenticated: "Sua sessão expirou. Entre de novo.",
};

export const FOLLOWUP_GENERIC_ERROR = "Não foi possível salvar o follow-up.";

/** Traduz o código levantado pela RPC (vem na mensagem do erro) para pt-BR. */
export function followupErrorMessage(error: unknown): string {
  const raw = typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : "";
  for (const [code, text] of Object.entries(ERROR_MESSAGES)) {
    if (raw.includes(code)) return text;
  }
  return FOLLOWUP_GENERIC_ERROR;
}

export function followupStatusLabel(status: FollowupStatus): string {
  return { scheduled: "Agendado", done: "Feito", cancelled: "Cancelado", failed: "Falhou" }[status];
}

/** O que aconteceu com a mensagem de um follow-up já executado. */
export function followupMessageResultLabel(f: Pick<Followup, "send_message" | "result">): string | null {
  if (!f.send_message) return null;
  switch (f.result?.message) {
    case "sent": return "Mensagem enviada";
    case "failed": return "Mensagem não enviada (falhou)";
    case "skipped": return "Mensagem não enviada (contato pediu para não receber)";
    case "cancelled": return "Mensagem cancelada";
    case "unknown": return "Mensagem com envio incerto";
    default: return null;
  }
}

export function followupReturnResultLabel(f: Pick<Followup, "result">): string | null {
  switch (f.result?.return) {
    case "moved": return "Voltou para a etapa";
    case "already_there": return "Já estava na etapa";
    case "skipped_left_stage": return "Não voltou: o negócio já tinha saído da etapa";
    default: return null;
  }
}

/** Texto de sempre quando não há nada digitado: valida o formulário antes de enviar. */
export function validateFollowupForm(v: FollowupFormValue, mode: "manual" | "recycle", hasLine: boolean): string | null {
  if (mode === "recycle" && v.willReturn === false) return null;
  if (!v.date || !v.time) return "Escolha data e hora.";
  if (v.sendMessage && !hasLine) return "Configure uma linha de WhatsApp em Outreach para enviar mensagens.";
  if (v.sendMessage && !v.messageText.trim()) return "Escreva a mensagem.";
  return null;
}

/** Valores iniciais do formulário: amanhã às 09:00, responsável = dono do negócio. */
export function initialFollowupValue(ownerId: string | null): FollowupFormValue {
  const { date, time } = defaultDue(1);
  return {
    date,
    time,
    ownerId,
    reason: "",
    notifyOwner: true,
    sendMessage: false,
    channel: "whatsapp",
    messageText: "",
    returnStageId: null,
  };
}
