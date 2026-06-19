type ActionPayload = Record<string, unknown>;

const DEFAULT_LEAD_NAME = "este lead";

function asRecord(action: unknown): ActionPayload | null {
  return action && typeof action === "object" ? (action as ActionPayload) : null;
}

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function valueText(value: unknown): string {
  const primitive = text(value);
  if (primitive) return primitive;
  if (value == null) return "vazio";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function fieldLabel(action: ActionPayload): string {
  return (
    text(action.label) ??
    text(action.field_label) ??
    text(action.field_name) ??
    text(action.field_id) ??
    text(action.key) ??
    "este campo"
  );
}

export function humanizeCopilotAction(
  action: unknown,
  leadName = DEFAULT_LEAD_NAME,
): string {
  const a = asRecord(action);
  if (!a) return `Aplicar ação para ${leadName}?`;

  const verb = text(a.verb) ?? text(a.action);

  switch (verb) {
    case "move_stage": {
      const stage =
        text(a.stage_name) ??
        text(a.stage_name_hint) ??
        (a.stage_type === "won"
          ? "Ganho"
          : a.stage_type === "lost"
            ? "Perdido"
            : "a próxima etapa");
      return `Mover ${leadName} para ${stage}?`;
    }
    case "add_note":
      return `Adicionar esta nota para ${leadName}?`;
    case "set_field":
    case "set_contact_field":
      return `Atualizar ${fieldLabel(a)} de ${leadName} para “${valueText(a.value)}”?`;
    case "create_task": {
      const title = text(a.title) ?? text(a.title_template) ?? "uma tarefa";
      return `Criar tarefa “${title}” para ${leadName}?`;
    }
    case "set_status": {
      const status =
        a.status === "won"
          ? "ganho"
          : a.status === "lost"
            ? "perdido"
            : text(a.status) ?? "novo status";
      return `Marcar ${leadName} como ${status}?`;
    }
    case "add_touchpoint":
      return `Registrar contato para ${leadName}?`;
    case "add_tag": {
      const tag = text(a.tag) ?? "uma tag";
      return `Adicionar tag “${tag}” para ${leadName}?`;
    }
    case "trigger_webhook":
      return `Disparar automação para ${leadName}?`;
    default:
      if (a.pipeline_id !== undefined || a.contact_type !== undefined) {
        return `Rotear ${leadName}?`;
      }
      if (typeof a.summary === "string" && a.summary.trim()) {
        return `${a.summary.trim()}?`;
      }
      return `Aplicar ação para ${leadName}?`;
  }
}

export function stringifyActionDetails(action: unknown): string {
  try {
    return JSON.stringify(action ?? {}, null, 2);
  } catch {
    return String(action);
  }
}
