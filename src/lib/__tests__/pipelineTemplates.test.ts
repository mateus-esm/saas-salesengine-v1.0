import { describe, expect, it } from "vitest";

import { MILESTONES, normalizeNatures } from "@/lib/natures";
import { PIPELINE_TEMPLATES, getPipelineTemplate } from "@/lib/pipelineTemplates";

describe("pipeline templates", () => {
  it("offers the four line models from Sprint 11", () => {
    expect(PIPELINE_TEMPLATES.map((template) => template.id)).toEqual([
      "consultive-sale",
      "clinic-return",
      "launch",
      "legal-service",
    ]);
  });

  it.each(PIPELINE_TEMPLATES)("builds a complete, ordered $name line", (template) => {
    expect(template.stages.map((stage) => stage.position)).toEqual(
      template.stages.map((_, position) => position),
    );
    expect(template.stages.filter((stage) => stage.stage_type === "won")).toHaveLength(1);
    expect(template.stages.filter((stage) => stage.stage_type === "lost")).toHaveLength(1);

    const natures = normalizeNatures(template.natures);
    const declared = template.stages
      .map((stage) => stage.funnel_event)
      .filter((event): event is NonNullable<typeof event> => event != null);

    expect(declared).toEqual(natures.process.milestones);
    expect(declared.every((event) => MILESTONES.some((milestone) => milestone.key === event))).toBe(true);
    expect(template.catalog_suggestions.length).toBeGreaterThan(0);
  });

  it("marks the clinic suggestion as recurrent", () => {
    const clinic = getPipelineTemplate("clinic-return");
    expect(clinic?.catalog_suggestions.some((item) => item.recurrence)).toBe(true);
  });

  it("returns undefined for an unknown model", () => {
    expect(getPipelineTemplate("unknown")).toBeUndefined();
  });
});
