import { describe, it, expect } from "vitest";
import { buildCardModel } from "../cardModel";
import type { BoardCard } from "@/types/board";
import type { CustomFieldSchema, PipelineStageV2 } from "@/types/pipelines";
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

  it("a lost deal shows only its outcome — no overdue, no SLA, no time in stage", () => {
    const today = new Date(2026, 8, 11);
    const lostCard = {
      ...baseCard,
      status: "lost",
      closed_at: "2026-09-09T12:00:00Z",
      lead: { ...baseCard.lead!, next_contact: "2026-09-01" },
    } as BoardCard;
    const stage = { id: "stage-1", max_idle_hours: 24, max_interactions: 2 } as unknown as PipelineStageV2;
    const model = buildCardModel(lostCard, stage, defaultFlags, [], today);

    expect(model.status).toBe("lost");
    expect(model.isOverdue).toBe(false);
    expect(model.timeInStageText).toBeNull();
    expect(model.badges.map((b) => b.kind)).toEqual(["lost"]);
  });

  it("orders the badges: overdue contact, then SLA, then the interaction cap", () => {
    const today = new Date(2026, 8, 11, 12);
    const stage = { id: "stage-1", max_idle_hours: 48, max_interactions: 5 } as unknown as PipelineStageV2;
    const card = { ...baseCard, lead: { ...baseCard.lead!, next_contact: "2026-09-09" } } as BoardCard;
    const model = buildCardModel(card, stage, defaultFlags, [], today);

    expect(model.slaBreached).toBe(true); // 6 days in a 48 h stage
    expect(model.interactionsBreached).toBe(true); // 5 of 5
    expect(model.badges.map((b) => b.kind)).toEqual(["overdue", "sla", "interactions"]);
    expect(model.badges[1].label).toBe("Acima do SLA (48h)");
    expect(model.badges[2].label).toBe("5/5 interações");
  });

  it("no SLA badge inside the limit, nor when the stage has none", () => {
    const today = new Date(2026, 8, 5, 20); // 10 h after entering
    const stage = { id: "stage-1", max_idle_hours: 48, max_interactions: null } as unknown as PipelineStageV2;
    expect(buildCardModel(baseCard, stage, defaultFlags, [], today).slaBreached).toBe(false);
    expect(buildCardModel(baseCard, undefined, defaultFlags, [], new Date(2027, 0, 1)).slaBreached).toBe(false);
  });

  it("shows at most three card fields, in the schema's order", () => {
    const today = new Date(2026, 8, 11);
    const card = { ...baseCard, custom_data: { a: "1", b: "2", c: "3", d: "4" } } as BoardCard;
    const fields = ["a", "b", "c", "d"].map(
      (id, i) => ({ field_id: id, key: id, label: id.toUpperCase(), type: "text", position: i, required: false }) as CustomFieldSchema,
    );
    expect(buildCardModel(card, undefined, defaultFlags, fields, today).fields.map((f) => f.field_id)).toEqual(["a", "b", "c"]);
  });

  it("hides what the pipeline switched off", () => {
    const today = new Date(2026, 8, 11);
    const off: NativeCardFlags = { value: false, timeInPhase: false, touchpoints: false, nextContact: false, whatsapp: false };
    const model = buildCardModel(baseCard, undefined, off, [], today);
    expect(model.valueText).toBeNull();
    expect(model.timeInStageText).toBeNull();
    expect(model.nextContactBadge).toBeNull();
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
