export type OutreachStepDraft = {
  position: number;
  offset_minutes: number;
  message_template: string;
};

export type OutreachSequenceDraft = {
  id?: string;
  name: string;
  active: boolean;
  trigger_event: "lead_intake";
  trigger_entry_ids: string[];
  reenroll: "once_per_lead" | "per_event";
  stop_on_reply: boolean;
  stop_on_stage_change: boolean;
  steps: OutreachStepDraft[];
};

export const emptySequenceDraft = (): OutreachSequenceDraft => ({
  name: "Nova sequência",
  active: false,
  trigger_event: "lead_intake",
  trigger_entry_ids: [],
  reenroll: "once_per_lead",
  stop_on_reply: true,
  stop_on_stage_change: true,
  steps: [{ position: 0, offset_minutes: 0, message_template: "" }],
});

export function sequenceToDraft(sequence: Record<string, unknown>): OutreachSequenceDraft {
  const steps = Array.isArray(sequence.steps) ? sequence.steps : [];
  return {
    id: String(sequence.id),
    name: String(sequence.name ?? "Sequência"),
    active: sequence.active === true,
    trigger_event: "lead_intake",
    trigger_entry_ids: Array.isArray(sequence.trigger_entry_ids)
      ? sequence.trigger_entry_ids.map(String)
      : [],
    reenroll: sequence.reenroll === "per_event" ? "per_event" : "once_per_lead",
    stop_on_reply: sequence.stop_on_reply !== false,
    stop_on_stage_change: sequence.stop_on_stage_change !== false,
    steps: steps.length
      ? steps.map((step, position) => {
        const row = step as Record<string, unknown>;
        return {
          position,
          offset_minutes: Number(row.offset_minutes ?? 0),
          message_template: String(row.message_template ?? ""),
        };
      })
      : [{ position: 0, offset_minutes: 0, message_template: "" }],
  };
}

export function reindexSteps(steps: OutreachStepDraft[]): OutreachStepDraft[] {
  return steps.map((step, position) => ({ ...step, position }));
}
