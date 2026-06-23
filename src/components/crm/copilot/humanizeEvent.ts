// src/components/crm/copilot/humanizeEvent.ts
//
// Sprint 6.8 W2 — Event humanizer.
// Maps raw copilot SSE events to human-readable PT-BR sentences for the
// live-experience client view.  Pure function, no React dependency.

/**
 * Map a raw copilot sync event to a friendly PT-BR sentence.
 *
 * @returns `{ text, technical }` for events shown to the user, or `null` for
 *          events that should be suppressed from the client view.
 */
export function humanizeEvent(
  ev: { type: string; payload?: Record<string, unknown> },
): { text: string; technical: string } | null {
  const { type, payload = {} } = ev;
  const technical = JSON.stringify(ev, null, 2);

  switch (type) {
    case "move_stage": {
      const stageName =
        String(
          payload.stage_name ??
            payload.stage ??
            payload.stage_name_hint ??
            "próxima etapa",
        );
      return { text: `Movi este lead para ${stageName}.`, technical };
    }

    case "add_note":
      return { text: "Adicionei uma nota.", technical };

    case "set_field":
    case "set_contact_field": {
      const label =
        String(
          payload.label ??
            payload.field_label ??
            payload.field_name ??
            "campo",
        );
      return { text: `Atualizei ${label}.`, technical };
    }

    // Suppressed events — not shown in the client view.
    case "sweep_progress":
    case "action_start":
    case "action_done":
      return null;

    case "done":
      return { text: "Sincronização concluída.", technical };

    case "awaiting_confirmation":
      return { text: "Aguardando sua aprovação.", technical };

    case "halted":
      return { text: "Parei — preciso de ajuda.", technical };

    // Unknown type → suppress.
    default:
      return null;
  }
}
