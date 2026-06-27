// src/components/crm/copilot/humanizeEvent.test.ts
//
// Sprint 6.10 W3 — Telemetry Humanization tests.
// Covers all known event kinds, UUID stripping, and edge cases.

import { describe, expect, it } from "vitest";
import { humanizeEvent } from "./humanizeEvent";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(
  overrides: Partial<{
    type: string;
    payload: Record<string, unknown>;
    opportunity_id: string | null;
  }> = {},
) {
  return {
    type: overrides.type ?? "unknown",
    payload: overrides.payload ?? {},
    opportunity_id: overrides.opportunity_id ?? null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("humanizeEvent", () => {
  // ── move_stage ───────────────────────────────────────────────────────
  describe("move_stage", () => {
    it("returns text with stage name from payload", () => {
      const result = humanizeEvent(
        makeEvent({ type: "move_stage", payload: { stage_name: "Prospecção" } }),
      );
      expect(result).not.toBeNull();
      expect(result!.text).toBe("Movi este lead para Prospecção.");
    });

    it("falls back to stage field", () => {
      const result = humanizeEvent(
        makeEvent({ type: "move_stage", payload: { stage: "Negociação" } }),
      );
      expect(result!.text).toBe("Movi este lead para Negociação.");
    });

    it("falls back to stage_name_hint", () => {
      const result = humanizeEvent(
        makeEvent({ type: "move_stage", payload: { stage_name_hint: "Ganho" } }),
      );
      expect(result!.text).toBe("Movi este lead para Ganho.");
    });

    it("falls back to default when no stage info", () => {
      const result = humanizeEvent(makeEvent({ type: "move_stage" }));
      expect(result!.text).toBe("Movi este lead para próxima etapa.");
    });

    it("includes opportunity reference when opportunity_id is a UUID", () => {
      const result = humanizeEvent(
        makeEvent({
          type: "move_stage",
          payload: { stage_name: "Qualificação" },
          opportunity_id: "123e4567-e89b-12d3-a456-426614174000",
        }),
      );
      expect(result!.text).toContain("#123e");
      expect(result!.text).not.toContain("123e4567-e89b-12d3-a456-426614174000");
    });
  });

  // ── set_field / set_contact_field ────────────────────────────────────
  describe("set_field / set_contact_field", () => {
    it("returns text with label from payload", () => {
      const result = humanizeEvent(
        makeEvent({ type: "set_field", payload: { label: "Nome da Empresa", value: "Acme Corp" } }),
      );
      expect(result!.text).toBe("Atualizei Nome da Empresa para Acme Corp.");
    });

    it("falls back to field_label", () => {
      const result = humanizeEvent(
        makeEvent({ type: "set_contact_field", payload: { field_label: "Telefone" } }),
      );
      expect(result!.text).toBe("Atualizei Telefone.");
    });

    it("falls back to field_name", () => {
      const result = humanizeEvent(
        makeEvent({ type: "set_field", payload: { field_name: "email" } }),
      );
      expect(result!.text).toBe("Atualizei email.");
    });

    it("falls back to 'campo' when no label info", () => {
      const result = humanizeEvent(makeEvent({ type: "set_field" }));
      expect(result!.text).toBe("Atualizei campo.");
    });

    it("handles set_contact_field same as set_field", () => {
      const result = humanizeEvent(
        makeEvent({ type: "set_contact_field", payload: { label: "Cargo" } }),
      );
      expect(result!.text).toBe("Atualizei Cargo.");
    });
  });

  // ── add_note ─────────────────────────────────────────────────────────
  describe("add_note", () => {
    it("returns generic note text when no entity ref", () => {
      const result = humanizeEvent(makeEvent({ type: "add_note" }));
      expect(result!.text).toBe("Adicionei uma nota sobre este lead.");
    });

    it("includes lead name when available", () => {
      const result = humanizeEvent(
        makeEvent({ type: "add_note", payload: { lead_name: "João Silva" } }),
      );
      expect(result!.text).toBe("Adicionei uma nota sobre este lead (João Silva).");
    });

    it("shortens UUID opportunity_id", () => {
      const result = humanizeEvent(
        makeEvent({
          type: "add_note",
          opportunity_id: "aabbccdd-eeff-1122-3344-556677889900",
        }),
      );
      expect(result!.text).toContain("#aabb");
      expect(result!.text).not.toContain("aabbccdd-eeff-1122-3344-556677889900");
    });
  });

  // ── action_start ─────────────────────────────────────────────────────
  describe("action_start", () => {
    it("returns analyzing text with action name", () => {
      const result = humanizeEvent(
        makeEvent({ type: "action_start", payload: { action: "move_stage" } }),
      );
      expect(result!.text).toBe("Analisando move_stage...");
    });

    it("falls back to 'ação' when no action info", () => {
      const result = humanizeEvent(makeEvent({ type: "action_start" }));
      expect(result!.text).toBe("Analisando ação...");
    });

    it("includes opportunity reference", () => {
      const result = humanizeEvent(
        makeEvent({
          type: "action_start",
          payload: { action: "set_field" },
          opportunity_id: "abc123",
        }),
      );
      expect(result!.text).toBe("Analisando set_field (#abc1)...");
    });
  });

  // ── action_done ──────────────────────────────────────────────────────
  describe("action_done", () => {
    it("returns 'Feito' with action name when ok", () => {
      const result = humanizeEvent(
        makeEvent({
          type: "action_done",
          payload: { action: "move_stage", ok: true },
        }),
      );
      expect(result!.text).toBe("Feito — move_stage.");
    });

    it("includes error when not ok", () => {
      const result = humanizeEvent(
        makeEvent({
          type: "action_done",
          payload: { action: "set_field", ok: false, error: "Campo obrigatório" },
        }),
      );
      expect(result!.text).toBe("Feito — set_field (Campo obrigatório).");
    });

    it("handles ok as string 'true'", () => {
      const result = humanizeEvent(
        makeEvent({
          type: "action_done",
          payload: { action: "add_note", ok: "true" },
        }),
      );
      expect(result!.text).toBe("Feito — add_note.");
    });
  });

  // ── sweep_progress ───────────────────────────────────────────────────
  describe("sweep_progress", () => {
    it("shows current/total when available", () => {
      const result = humanizeEvent(
        makeEvent({
          type: "sweep_progress",
          payload: { current: 3, total: 10 },
        }),
      );
      expect(result!.text).toBe("Sincronizando pipeline — 3/10 oportunidades.");
    });

    it("shows generic text when no counts", () => {
      const result = humanizeEvent(makeEvent({ type: "sweep_progress" }));
      expect(result!.text).toBe("Sincronizando pipeline.");
    });
  });

  // ── awaiting_confirmation ────────────────────────────────────────────
  describe("awaiting_confirmation", () => {
    it("returns text with action description", () => {
      const result = humanizeEvent(
        makeEvent({
          type: "awaiting_confirmation",
          payload: { action: "mover lead para Negociação" },
        }),
      );
      expect(result!.text).toBe("Aguardando aprovação para mover lead para Negociação.");
    });

    it("falls back to 'ação' when no description", () => {
      const result = humanizeEvent(makeEvent({ type: "awaiting_confirmation" }));
      expect(result!.text).toBe("Aguardando aprovação para ação.");
    });
  });

  // ── halted ───────────────────────────────────────────────────────────
  describe("halted", () => {
    it("returns text with reason", () => {
      const result = humanizeEvent(
        makeEvent({
          type: "halted",
          payload: { reason: "créditos insuficientes" },
        }),
      );
      expect(result!.text).toBe("Parei — créditos insuficientes.");
    });

    it("falls back to error field", () => {
      const result = humanizeEvent(
        makeEvent({ type: "halted", payload: { error: "API timeout" } }),
      );
      expect(result!.text).toBe("Parei — API timeout.");
    });

    it("falls back to 'preciso de ajuda' when no reason", () => {
      const result = humanizeEvent(makeEvent({ type: "halted" }));
      expect(result!.text).toBe("Parei — preciso de ajuda.");
    });
  });

  // ── done ─────────────────────────────────────────────────────────────
  describe("done", () => {
    it("returns success text", () => {
      const result = humanizeEvent(makeEvent({ type: "done" }));
      expect(result!.text).toBe("Sincronização concluída com sucesso.");
    });
  });

  // ── UUID stripping ───────────────────────────────────────────────────
  describe("UUID stripping", () => {
    it("strips UUIDs from stage_name", () => {
      const result = humanizeEvent(
        makeEvent({
          type: "move_stage",
          payload: {
            stage_name: "Etapa 123e4567-e89b-12d3-a456-426614174000",
          },
        }),
      );
      expect(result!.text).not.toContain("123e4567-e89b-12d3-a456-426614174000");
      expect(result!.text).toContain("#123e");
    });

    it("strips UUIDs from field value", () => {
      const result = humanizeEvent(
        makeEvent({
          type: "set_field",
          payload: {
            label: "ID",
            value: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          },
        }),
      );
      expect(result!.text).not.toContain("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
      expect(result!.text).toContain("#a1b2");
    });

    it("strips UUIDs from halted reason", () => {
      const result = humanizeEvent(
        makeEvent({
          type: "halted",
          payload: {
            reason: "Erro no lead 550e8400-e29b-41d4-a716-446655440000",
          },
        }),
      );
      expect(result!.text).not.toContain("550e8400-e29b-41d4-a716-446655440000");
      expect(result!.text).toContain("#550e");
    });
  });

  // ── Unknown / suppressed events ──────────────────────────────────────
  describe("unknown / suppressed events", () => {
    it("returns null for unknown event type", () => {
      const result = humanizeEvent(makeEvent({ type: "some_random_event" }));
      expect(result).toBeNull();
    });

    it("returns null for empty type", () => {
      const result = humanizeEvent(makeEvent({ type: "" }));
      expect(result).toBeNull();
    });
  });

  // ── Technical output ─────────────────────────────────────────────────
  describe("technical output", () => {
    it("includes JSON stringified event", () => {
      const result = humanizeEvent(
        makeEvent({ type: "done", payload: { status: "ok" } }),
      );
      expect(result!.technical).toContain("done");
      expect(result!.technical).toContain("ok");
    });
  });
});
