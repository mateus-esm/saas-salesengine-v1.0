import { describe, expect, it } from "vitest";

import {
  categoryOf,
  defaultArtifact,
  hoursLabel,
  milestonesOf,
  wonValue,
  type TimelineArtifact,
  type TimelineEvent,
  type TimelineSummary,
} from "../dealTimeline";

const ev = (kind: string, at: string): TimelineEvent => ({ kind, at, label: kind, detail: null, actor: null });
const summary = (over: Partial<TimelineSummary> = {}): TimelineSummary => ({
  created_at: "2026-11-01T10:00:00Z", closed_at: null, cycle_days: 18, first_response_hours: 2,
  touchpoints: 3, last_touchpoint_at: null, meetings_scheduled: 2, meetings_done: 1, no_shows: 1,
  stage_sla_hours: null, hours_in_stage: 1, value: 14000, won_snapshot: null, ...over,
});
const art = (id: string, kind: "proposal" | "contract", status: string | null, value: number | null = null): TimelineArtifact =>
  ({ id, kind, status, value, table: "T", title: id, items: null, created_at: "2026-11-01T00:00:00Z" });

describe("categoryOf", () => {
  it("groups kinds into colors", () => {
    expect(categoryOf("touchpoint")).toBe("contact");
    expect(categoryOf("proposal_accepted")).toBe("proposal");
    expect(categoryOf("meeting_scheduled")).toBe("meeting");
    expect(categoryOf("no_show")).toBe("noshow");
    expect(categoryOf("contract_signed")).toBe("contract");
    expect(categoryOf("qualified")).toBe("stage");
  });
});

describe("milestonesOf", () => {
  it("marks each stop with its first date and notes", () => {
    const m = milestonesOf({
      summary: summary(),
      events: [
        ev("created", "2026-11-01T10:00:00Z"), ev("touchpoint", "2026-11-01T12:00:00Z"),
        ev("proposal_sent", "2026-11-05T12:00:00Z"), ev("no_show", "2026-11-06T12:00:00Z"),
        ev("meeting_done", "2026-11-08T12:00:00Z"), ev("proposal_accepted", "2026-11-10T12:00:00Z"),
        ev("won", "2026-11-19T12:00:00Z"),
      ],
    });
    expect(m.map((s) => s.reached)).toEqual([true, true, true, true, false, true]);
    expect(m[2].note).toBe("aceita 10/11");
    expect(m[3].note).toBe("1 realizada · 1 no-show");
    expect(m[3].at).toBe("2026-11-06T12:00:00Z");
    expect(m[5].label).toBe("Ganho");
    expect(m[5].note).toBe("18 dias de ciclo");
  });

  it("a lost deal ends in Perdido", () => {
    const m = milestonesOf({ summary: summary(), events: [ev("created", "2026-11-01T10:00:00Z"), ev("lost", "2026-11-02T10:00:00Z")] });
    expect(m[5]).toMatchObject({ label: "Perdido", category: "lost", reached: true });
  });
});

describe("defaultArtifact", () => {
  it("prefers the accepted proposal, then the only one, then the only sent", () => {
    expect(defaultArtifact([art("a", "proposal", "sent"), art("b", "proposal", "accepted")], "proposal")).toBe("b");
    expect(defaultArtifact([art("a", "proposal", "draft")], "proposal")).toBe("a");
    expect(defaultArtifact([art("a", "proposal", "draft"), art("b", "proposal", "sent")], "proposal")).toBe("b");
    expect(defaultArtifact([art("a", "proposal", "sent"), art("b", "proposal", "sent")], "proposal")).toBeNull();
    expect(defaultArtifact([art("c", "contract", "signed"), art("a", "proposal", "sent")], "contract")).toBe("c");
  });
});

describe("wonValue", () => {
  const items = [
    { id: "i1", name: "Usina", quantity: 1, unit_price: 14000, total: 14000 },
    { id: "i2", name: "Bateria", quantity: 2, unit_price: 3000, total: 6000 },
  ];
  it("sums only the items that closed, with the negotiated price", () => {
    expect(wonValue(items, { i2: { id: "i2", won: false, unit_price: 3000 }, i1: { id: "i1", won: true, unit_price: 13500 } }, null, null)).toBe(13500);
    expect(wonValue(items, {}, null, null)).toBe(20000);
  });
  it("without items, the chosen proposal sets the value", () => {
    expect(wonValue([], {}, art("p", "proposal", "sent", 9900), 5000)).toBe(9900);
    expect(wonValue([], {}, null, 5000)).toBe(5000);
  });
});

describe("hoursLabel", () => {
  it("reads minutes, hours or days", () => {
    expect(hoursLabel(0.25)).toBe("15 min");
    expect(hoursLabel(5)).toBe("5 h");
    expect(hoursLabel(96)).toBe("4 dias");
    expect(hoursLabel(null)).toBe("—");
  });
});
