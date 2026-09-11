import { describe, it, expect } from "vitest";
import { buildCardModel } from "../cardModel";
import type { BoardCard } from "@/types/board";
import type { CustomFieldSchema } from "@/types/pipelines";
import type { NativeCardFlags } from "@/components/crm/OpportunityCard";

const defaultFlags: NativeCardFlags = {
  value: true,
  timeInPhase: true,
  touchpoints: true,
  nextContact: true,
  whatsapp: true,
};

const baseCard = {
  id: "opp-1",
  equipe_id: "eq-1",
  pipeline_id: "pipe-1",
  stage_id: "stage-1",
  value: 15000,
  currency: "BRL",
  status: "open",
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-10T10:00:00Z",
  stage_entered_at: "2026-09-05T10:00:00Z",
  lead_id: "lead-1",
  owner_id: "user-1",
  owner_name: "Mateus",
  closed_at: null,
  lost_reason: null,
  custom_data: { "f-1": "Microgeração" },
  deleted_at: null,
  lead: {
    id: "lead-1",
    name: "João Silva",
    phone: "(85) 99999-8888",
    email: "joao@example.com",
    next_contact: "2026-09-10",
    tags: ["Solar", "VIP"],
    origin_category: "paid_social",
    source: "Google ADS",
    responsible_id: "user-1",
  },
  touchpoint_count: 5,
  icp_score: 8,
  velocity: 7,
  lead_score: 8,
  companies: [{ id: "comp-1", name: "Empresa X" }],
} as unknown as BoardCard;

describe("buildCardModel", () => {
  it("builds model for normal open card", () => {
    const today = new Date(2026, 8, 11);
    const fields: CustomFieldSchema[] = [
      { field_id: "f-1", key: "prod", label: "Produto", type: "text", position: 0, required: false },
    ];
    const model = buildCardModel(baseCard, undefined, defaultFlags, fields, today);

    expect(model.title).toBe("João Silva");
    expect(model.leadId).toBe("lead-1");
    expect(model.ownerName).toBe("Mateus");
    expect(model.valueText).toContain("15.000");
    expect(model.tags).toEqual(["Solar", "VIP"]);
    expect(model.companies).toEqual([{ id: "comp-1", name: "Empresa X" }]);
    expect(model.fields).toEqual([{ field_id: "f-1", label: "Produto", value: "Microgeração" }]);
  });

  it("identifies overdue next contact", () => {
    const today = new Date(2026, 8, 11);
    const overdueCard: BoardCard = {
      ...baseCard,
      lead: { ...baseCard.lead!, next_contact: "2026-09-08" },
    };
    const model = buildCardModel(overdueCard, undefined, defaultFlags, [], today);

    expect(model.isOverdue).toBe(true);
    expect(model.nextContactBadge).toEqual({
      label: "3d atrasado",
      variant: "overdue",
    });
  });

  it("handles today next contact badge", () => {
    const today = new Date(2026, 8, 11);
    const todayCard: BoardCard = {
      ...baseCard,
      lead: { ...baseCard.lead!, next_contact: "2026-09-11" },
    };
    const model = buildCardModel(todayCard, undefined, defaultFlags, [], today);

    expect(model.isOverdue).toBe(false);
    expect(model.nextContactBadge).toEqual({
      label: "Hoje",
      variant: "today",
    });
  });

  it("omits empty custom fields", () => {
    const today = new Date(2026, 8, 11);
    const fields: CustomFieldSchema[] = [
      { field_id: "f-empty", key: "empty", label: "Vazio", type: "text", position: 1, required: false },
    ];
    const model = buildCardModel(baseCard, undefined, defaultFlags, fields, today);

    expect(model.fields).toHaveLength(0);
  });
});
