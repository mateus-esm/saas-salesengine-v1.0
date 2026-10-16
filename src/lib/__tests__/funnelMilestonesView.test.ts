import { describe, expect, it } from "vitest";
import { normalizeMilestones } from "../../../supabase/functions/_shared/funnel-milestones";
import { bucketLabel, cellValue, defaultGranularity, historyNotes } from "@/lib/funnelMilestonesView";

const data = normalizeMilestones({
  granularity: "day",
  series: [
    { bucket: "2026-10-14", bucket_end: "2026-10-15T03:00:00+00:00", meeting_done: 2 },
    { bucket: "2026-10-16", bucket_end: "2026-10-17T03:00:00+00:00", no_show: 1 },
  ],
  since: { meeting_done: "2026-08-01T12:00:00Z", no_show: "2026-10-16T13:00:00Z" },
});

describe("funnelMilestonesView", () => {
  it("rótulos de balde sem fuso", () => {
    expect(bucketLabel("2026-10-14", "day")).toBe("14/10");
    expect(bucketLabel("2026-10-12", "week")).toBe("sem. 12/10");
    expect(bucketLabel("2026-10-01", "month")).toBe("out/26");
  });

  it("antes do primeiro no-show a célula é —, não 0", () => {
    const [d14, d16] = data.series;
    expect(cellValue(d14, "no_show", data.since)).toBe("—");
    expect(cellValue(d16, "no_show", data.since)).toBe("1");
    expect(cellValue(d14, "meeting_done", data.since)).toBe("2");
    expect(cellValue(d16, "meeting_done", data.since)).toBe("0");
    // marco nunca registrado
    expect(cellValue(d16, "won", data.since)).toBe("—");
  });

  it("notas de rodapé só para séries que começam dentro da janela ou nunca começaram", () => {
    const notes = historyNotes(data, new Date("2026-10-01T03:00:00Z"));
    expect(notes.find((n) => n.key === "no_show")?.text).toBe("No-show: série começa em 16/10/2026");
    expect(notes.find((n) => n.key === "meeting_done")).toBeUndefined();
    expect(notes.find((n) => n.key === "won")?.text).toBe("Fechamentos: série ainda sem registros");
  });

  it("granularidade padrão pela largura da janela", () => {
    const d = (s: string) => new Date(s);
    expect(defaultGranularity(d("2026-10-01"), d("2026-10-31"))).toBe("day");
    expect(defaultGranularity(d("2026-08-01"), d("2026-10-31"))).toBe("week");
    expect(defaultGranularity(d("2026-01-01"), d("2026-10-31"))).toBe("month");
  });
});
