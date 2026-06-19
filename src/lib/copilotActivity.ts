export type CopilotTone = "info" | "success" | "warning" | "error" | "muted";

export interface CopilotActivityText {
  verb: string;
  title: string;
  description: string;
  field: string;
  result: string;
  source: string;
  tone: CopilotTone;
  technical: string;
}

type Payload = Record<string, unknown>;

function asRecord(value: unknown): Payload | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Payload)
    : null;
}

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function valueText(value: unknown): string {
  const direct = text(value);
  if (direct) return direct;
  if (value == null || value === "") return "-";
  if (Array.isArray(value)) return value.map(valueText).join(", ");

  const record = asRecord(value);
  if (record) {
    return (
      text(record.name) ??
      text(record.label) ??
      text(record.title) ??
      text(record.stage_name) ??
      text(record.url) ??
      "Dados preenchidos"
    );
  }

  return "Dados preenchidos";
}

function fromActionOrArgs(
  action: Payload,
  args: Payload | null,
  keys: string[],
): string | null {
  for (const key of keys) {
    const direct = text(action[key]);
    if (direct) return direct;

    const nested = text(args?.[key]);
    if (nested) return nested;
  }

  return null;
}

function fieldText(action: Payload, args: Payload | null): string {
  return (
    fromActionOrArgs(action, args, [
      "field_label",
      "label",
      "field_name",
      "field_id",
      "key",
    ]) ?? "-"
  );
}

function stageText(action: Payload, args: Payload | null): string {
  const stageType = fromActionOrArgs(action, args, ["stage_type"]);
  return (
    fromActionOrArgs(action, args, ["stage_name", "stage_name_hint"]) ??
    (stageType === "won"
      ? "Ganho"
      : stageType === "lost"
        ? "Perdido"
        : stageType === "open"
          ? "Aberto"
          : stageType ?? "-")
  );
}

function statusText(action: Payload, args: Payload | null): string {
  const status = fromActionOrArgs(action, args, ["status"]);
  if (status === "won") return "Ganho";
  if (status === "lost") return "Perdido";
  if (status === "open") return "Aberto";
  return status ?? "-";
}

function payloadValue(
  action: Payload,
  args: Payload | null,
  keys: string[],
): unknown {
  for (const key of keys) {
    if (action[key] !== undefined) return action[key];
    if (args && args[key] !== undefined) return args[key];
  }

  return undefined;
}

function payloadSource(action: Payload | null, optionsSource?: string): string {
  return (
    optionsSource ||
    text(action?.source) ||
    text(action?.mode) ||
    text(action?.agent_role) ||
    text(action?.skill) ||
    "Copilot"
  );
}

export function formatCopilotActivity(
  action: unknown,
  options: { leadName?: string; source?: string } = {},
): CopilotActivityText {
  const leadName = options.leadName || "este lead";
  const actionRecord = asRecord(action);
  const args = asRecord(actionRecord?.args);
  const payload = actionRecord ?? {};
  const verb =
    text(payload.verb) ??
    text(payload.action) ??
    text(args?.verb) ??
    text(args?.action) ??
    "manual";
  const source = payloadSource(actionRecord, options.source);
  const technical = stringifyCopilotPayload(action);

  switch (verb) {
    case "move_stage": {
      const result = stageText(payload, args);
      return {
        verb,
        title: `Mover ${leadName} para ${result}`,
        description: `Definindo etapa do pipeline como ${result}.`,
        field: "Etapa",
        result,
        source,
        tone: "info",
        technical,
      };
    }
    case "set_status": {
      const result = statusText(payload, args);
      return {
        verb,
        title: `Marcar ${leadName} como ${result}`,
        description: `Atualizando status comercial para ${result}.`,
        field: "Status",
        result,
        source,
        tone: result === "Perdido" ? "warning" : "info",
        technical,
      };
    }
    case "set_contact_field":
    case "set_field": {
      const field = fieldText(payload, args);
      const result = valueText(payloadValue(payload, args, ["value"]));
      return {
        verb,
        title: `Atualizar ${field}`,
        description: `Definindo ${field} como ${result}.`,
        field,
        result,
        source,
        tone: "info",
        technical,
      };
    }
    case "add_touchpoint": {
      const result = valueText(
        payloadValue(payload, args, [
          "content",
          "content_template",
          "summary",
          "touchpoint_type",
        ]),
      );
      return {
        verb,
        title: "Registrar touchpoint",
        description:
          result === "-"
            ? `Registrando novo contato com ${leadName}.`
            : result,
        field: "Touchpoint",
        result,
        source,
        tone: "info",
        technical,
      };
    }
    case "add_note": {
      const result = valueText(
        payloadValue(payload, args, ["content", "content_template", "note"]),
      );
      return {
        verb,
        title: "Adicionar nota",
        description:
          result === "-" ? `Registrando nota sobre ${leadName}.` : result,
        field: "Nota",
        result,
        source,
        tone: "info",
        technical,
      };
    }
    case "create_task": {
      const result = valueText(
        payloadValue(payload, args, ["title", "title_template", "name"]),
      );
      return {
        verb,
        title: "Criar tarefa",
        description: result,
        field: "Tarefa",
        result,
        source,
        tone: "info",
        technical,
      };
    }
    default: {
      const summary = text(payload.summary);
      const reason = text(payload.reason);
      return {
        verb,
        title: summary ?? "Aplicar ação do Copilot",
        description: reason ?? `Executando ${verb}.`,
        field: fieldText(payload, args),
        result: valueText(
          payloadValue(payload, args, ["value", "summary", "reason"]),
        ),
        source,
        tone: "muted",
        technical,
      };
    }
  }
}

export function stringifyCopilotPayload(action: unknown): string {
  try {
    return JSON.stringify(action ?? {}, null, 2);
  } catch {
    return String(action);
  }
}
