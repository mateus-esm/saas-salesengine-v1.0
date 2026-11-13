import { describe, expect, it } from "vitest";
import { recycleInitialValue, recycleReasonsOf, recycleScheduleInput, returnStageOptions } from "../recycle";

describe("recycle helpers (Sprint 15b · T4)", () => {
  it("reads reasons as strings, tolerating objects and a malformed column", () => {
    expect(recycleReasonsOf({ recycle_reasons: ["A", { label: "B" }, 3, ""] })).toEqual(["A", "B"]);
    expect(recycleReasonsOf({ recycle_reasons: "x" })).toEqual([]);
    expect(recycleReasonsOf(null)).toEqual([]);
  });

  it("lists only open/ciclo stages as return options, never the target itself", () => {
    const stages = [
      { id: "a", name: "A", stage_type: "open" },
      { id: "c", name: "C", stage_type: "ciclo" },
      { id: "w", name: "W", stage_type: "won" },
      { id: "l", name: "L", stage_type: "lost" },
      { id: "c2", name: "C2", stage_type: "ciclo" },
    ];
    expect(returnStageOptions(stages, "c").map((s) => s.id)).toEqual(["a", "c2"]);
  });

  it("takes the form defaults from the stage", () => {
    const now = new Date("2026-11-13T15:00:00Z");
    const v = recycleInitialValue(
      { cycle_days: 30, cycle_target_stage_id: "a", recycle_notify_owner: false, recycle_send_message: true, recycle_message_template: "Oi" },
      "u1",
      [{ id: "a" }],
      now,
    );
    expect(v).toMatchObject({ date: "2026-12-13", time: "09:00", ownerId: "u1", notifyOwner: false, sendMessage: true, messageText: "Oi", returnStageId: "a", willReturn: true });
  });

  it("falls back to 7 days, notify on, no message, keep in Reciclo", () => {
    const v = recycleInitialValue({}, null, [], new Date("2026-11-13T15:00:00Z"));
    expect(v).toMatchObject({ date: "2026-11-20", notifyOwner: true, sendMessage: false, returnStageId: null });
  });

  it("drops a return stage that is not selectable (e.g. a won stage)", () => {
    expect(recycleInitialValue({ cycle_target_stage_id: "w" }, null, [{ id: "a" }]).returnStageId).toBeNull();
  });

  it("'Não' records only the reason: no notice, no message, no return, due in a minute", () => {
    const now = new Date("2026-11-13T15:00:00Z");
    const base = recycleInitialValue({ recycle_send_message: true, cycle_target_stage_id: "a" }, "u1", [{ id: "a" }], now);
    const input = recycleScheduleInput({ ...base, reason: " Sem verba ", willReturn: false }, true, now);
    expect(input).toEqual({
      dueAt: "2026-11-13T15:01:00.000Z",
      kind: "recycle",
      ownerId: null,
      reason: "Sem verba",
      notifyOwner: false,
      sendMessage: false,
      messageText: null,
      returnStageId: null,
    });
  });

  it("without an outreach line the message default is not sent", () => {
    const base = recycleInitialValue({ recycle_send_message: true, recycle_message_template: "Oi" }, null, []);
    const input = recycleScheduleInput({ ...base, reason: "x" }, false);
    expect(input.sendMessage).toBe(false);
    expect(input.messageText).toBeNull();
  });
});
