// src/components/crm/copilot/humanizeEvent.ts
//
// Sprint 6.10 W3 — Telemetry Humanization.
// Maps raw copilot SSE events to human-readable PT-BR sentences for the
// live-experience client view.  Pure function, no React dependency.
//
// All UUIDs are stripped from displayed text.  Only the first 4 characters
// of an opportunity/lead ID are shown as a reference number.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Regex that matches a full UUID v4 (hex groups 8-4-4-4-12). */
const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Strip full UUIDs from a string, replacing them with a short reference
 * token (first 4 chars).  This is a safety net; entity references are
 * handled explicitly by entityRef().
 *
 * Examples:
 *   "123e4567-e89b-12d3-a456-426614174000"  →  "#123e"
 */
function stripUuid(text: string): string {
  return text.replace(UUID_RE, (match) => `#${match.slice(0, 4)}`);
}

/**
 * Safely extract a string value from the payload, trying keys in order.
 */
function str(
  payload: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const v = payload[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" || typeof v === "boolean") return String(v);
  }
  return undefined;
}

/**
 * Extract a lead/opportunity reference from the event.
 * Returns a short reference like "#a1b2" or the entity name.
 */
function entityRef(
  payload: Record<string, unknown>,
  opportunityId?: string | null,
): string | undefined {
  const raw =
    str(payload, "lead_name", "lead", "entity_name") ??
    opportunityId ??
    str(payload, "opportunity_id");
  if (!raw) return undefined;
  // If it looks like a UUID or long hex ID, shorten it
  if (UUID_RE.test(raw) || /^[0-9a-f]{6,}$/i.test(raw)) {
    return `#${raw.slice(0, 4)}`;
  }
  return raw;
}

/**
 * Final pass: strip any stray UUIDs from the humanized text so that no raw
 * UUID leaks through to the user.
 */
function sanitize(text: string): string {
  return stripUuid(text);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Map a raw copilot sync event to a friendly PT-BR sentence.
 *
 * @returns `{ text, technical }` for events shown to the user, or `null` for
 *          events that should be suppressed from the client view.
 */
export function humanizeEvent(
  ev: {
    type: string;
    payload?: Record<string, unknown>;
    opportunity_id?: string | null;
  },
): { text: string; technical: string } | null {
  const { type, payload = {} } = ev;
  const technical = JSON.stringify(ev, null, 2);

  const result = _humanize(type, payload, ev.opportunity_id);
  if (!result) return null;
  return { text: sanitize(result.text), technical };
}

/**
 * Internal implementation.  Returns { text, technical } or null.
 */
function _humanize(
  type: string,
  payload: Record<string, unknown>,
  opportunityId: string | null | undefined,
): { text: string; technical: string } | null {
  const technical = JSON.stringify({ type, payload }, null, 2);

  switch (type) {
    // ── Stage movement ──────────────────────────────────────────────────
    case "move_stage": {
      const stageName =
        str(payload, "stage_name", "stage", "stage_name_hint") ??
        "próxima etapa";
      const ref = entityRef(payload, opportunityId);
      const leadPart = ref ? ` este lead (${ref})` : " este lead";
      return { text: `Movi${leadPart} para ${stageName}.`, technical };
    }

    // ── Field updates ───────────────────────────────────────────────────
    case "set_field":
    case "set_contact_field": {
      const label =
        str(payload, "label", "field_label", "field_name") ?? "campo";
      const value = str(payload, "value", "new_value");
      const valuePart = value ? ` para ${value}` : "";
      return { text: `Atualizei ${label}${valuePart}.`, technical };
    }

    // ── Notes ───────────────────────────────────────────────────────────
    case "add_note": {
      const ref = entityRef(payload, opportunityId);
      const leadPart = ref ? ` sobre este lead (${ref})` : " sobre este lead";
      return { text: `Adicionei uma nota${leadPart}.`, technical };
    }

    // ── Action lifecycle ────────────────────────────────────────────────
    case "action_start": {
      const actionDesc =
        str(payload, "action", "action_name", "description", "title") ??
        "ação";
      const ref = entityRef(payload, opportunityId);
      const targetPart = ref ? ` (${ref})` : "";
      return {
        text: `Analisando ${actionDesc}${targetPart}...`,
        technical,
      };
    }

    case "action_done": {
      const actionDesc =
        str(payload, "action", "action_name", "description", "title") ??
        "ação";
      const ok = payload.ok === true || payload.ok === "true";
      if (ok) {
        return { text: `Feito — ${actionDesc}.`, technical };
      }
      const error = str(payload, "error", "message");
      const errorPart = error ? ` (${error})` : "";
      return { text: `Feito — ${actionDesc}${errorPart}.`, technical };
    }

    // ── Sweep progress ──────────────────────────────────────────────────
    case "sweep_progress": {
      const current = str(payload, "current");
      const total = str(payload, "total");
      const countPart =
        current && total ? ` — ${current}/${total} oportunidades` : "";
      return {
        text: `Sincronizando pipeline${countPart}.`,
        technical,
      };
    }

    // ── Awaiting confirmation ───────────────────────────────────────────
    case "awaiting_confirmation": {
      const actionDesc =
        str(
          payload,
          "action",
          "action_name",
          "description",
          "title",
          "summary",
        ) ?? "ação";
      return {
        text: `Aguardando aprovação para ${actionDesc}.`,
        technical,
      };
    }

    // ── Halted ──────────────────────────────────────────────────────────
    case "halted": {
      const reason =
        str(payload, "reason", "error", "message") ??
        "preciso de ajuda";
      return { text: `Parei — ${reason}.`, technical };
    }

    // ── Done ────────────────────────────────────────────────────────────
    case "done":
      return { text: "Sincronização concluída com sucesso.", technical };

    // ── Unknown type → suppress ─────────────────────────────────────────
    default:
      return null;
  }
}
