import { validateSendWindow } from "./schedule.ts";
import { templateError } from "./template.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_ENTRY_KINDS = new Set(["webhook", "import", "manual"]);

export type SequenceStepInput = {
  position: number;
  offset_minutes: number;
  message_template: string;
};

export function validateSteps(value: unknown): SequenceStepInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("A sequência precisa ter pelo menos uma mensagem.");
  }
  const steps = value.map((raw, index) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const position = Number(row.position);
    const offset = Number(row.offset_minutes);
    const message = typeof row.message_template === "string"
      ? row.message_template.trim()
      : "";
    if (!Number.isInteger(position) || position !== index) {
      throw new Error("As posições dos passos devem ser contínuas, de 0 a N.");
    }
    if (!Number.isInteger(offset) || offset < 0 || offset > 86_400) {
      throw new Error(`Offset inválido no passo ${index}.`);
    }
    if (
      index > 0 &&
      offset <=
        Number((value[index - 1] as Record<string, unknown>)?.offset_minutes)
    ) {
      throw new Error("Os offsets devem ser estritamente crescentes.");
    }
    if (!message) throw new Error(`Mensagem vazia no passo ${index}.`);
    const invalid = templateError(message);
    if (invalid) throw new Error(`Passo ${index + 1}: ${invalid}`);
    return { position, offset_minutes: offset, message_template: message };
  });
  return steps;
}

export function validateEntryIds(
  requested: unknown,
  rows: Array<{ id: string; equipe_id: string; kind: string }>,
  equipeId: string,
): string[] {
  const ids = Array.from(
    new Set(
      (Array.isArray(requested) ? requested : [])
        .map((id) => String(id).trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  if (ids.some((id) => !UUID_RE.test(id))) {
    throw new Error("Porta com UUID inválido.");
  }
  const byId = new Map(rows.map((row) => [row.id.toLowerCase(), row]));
  for (const id of ids) {
    const entry = byId.get(id);
    if (!entry || entry.equipe_id !== equipeId) {
      throw new Error("Porta inexistente neste time.");
    }
    if (!ALLOWED_ENTRY_KINDS.has(entry.kind)) {
      throw new Error(
        `A porta ${id} é do tipo ${entry.kind} e não pode iniciar outreach.`,
      );
    }
  }
  return ids;
}

export function validateProfileInput(value: unknown) {
  const row = (value ?? {}) as Record<string, unknown>;
  const provider = row.provider === "solo"
    ? "solo"
    : row.provider === "gptmaker"
    ? "gptmaker"
    : null;
  if (!provider) throw new Error("Provider inválido.");
  const start = String(row.send_window_start ?? "08:00");
  const end = String(row.send_window_end ?? "20:00");
  const timezone = String(row.timezone ?? "America/Sao_Paulo");
  validateSendWindow({ start, end, timezone });
  const limit = Number(row.max_sends_per_line_hour ?? 30);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("Limite por hora inválido.");
  }
  const keywords = Array.from(
    new Set(
      (Array.isArray(row.opt_out_keywords) ? row.opt_out_keywords : [])
        .map((keyword) => String(keyword).trim())
        .filter(Boolean),
    ),
  );
  if (!keywords.length) {
    throw new Error("Informe ao menos uma palavra de opt-out.");
  }
  return {
    provider,
    channel_id: typeof row.channel_id === "string" && row.channel_id.trim()
      ? row.channel_id.trim()
      : null,
    solo_instance_id:
      typeof row.solo_instance_id === "string" && row.solo_instance_id.trim()
        ? row.solo_instance_id.trim()
        : null,
    send_window_start: start,
    send_window_end: end,
    timezone,
    max_sends_per_line_hour: limit,
    opt_out_keywords: keywords,
  };
}
