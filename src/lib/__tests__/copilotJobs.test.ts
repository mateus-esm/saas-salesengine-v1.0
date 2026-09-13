import { describe, expect, it } from "vitest";

import { copilotErrorText, jobProgress, progressLabel, progressSummary, type CopilotJobRow } from "../copilotJobs";

const job = (extra: Partial<CopilotJobRow>): CopilotJobRow => ({
  id: "j",
  opportunity_id: "o",
  status: "queued",
  reason: "manual",
  attempts: 0,
  last_error: null,
  result: null,
  run_after: "2026-09-14T12:00:00Z",
  finished_at: null,
  ...extra,
});

describe("one deal", () => {
  it("queued → reading → done, in words", () => {
    expect(progressLabel(jobProgress([job({ status: "queued" })], 1))).toBe("Na fila");
    expect(progressLabel(jobProgress([job({ status: "running" })], 1))).toBe("Lendo a conversa…");
    const done = jobProgress([job({ status: "done", result: { applied: 3, pending: 1 } })], 1);
    expect(done.finished).toBe(true);
    expect(progressSummary(done)).toBe("Copilot: 3 ações aplicadas, 1 para aprovar.");
  });

  it("nothing new, nothing to change, or a failure — each said plainly", () => {
    expect(progressSummary(jobProgress([job({ status: "skipped" })], 1))).toBe("Nada novo na conversa desde a última leitura.");
    expect(progressSummary(jobProgress([job({ status: "done", result: { applied: 0, pending: 0 } })], 1)))
      .toBe("Copilot leu a conversa e não viu nada para mudar.");
    expect(progressSummary(jobProgress([job({ status: "failed", last_error: "provedor: recusou" })], 1)))
      .toBe("Copilot não conseguiu ler este negócio: provedor: recusou");
  });

  it("a failure that went back to the queue is not the end", () => {
    expect(jobProgress([job({ status: "queued", attempts: 1, last_error: "provedor" })], 1).finished).toBe(false);
  });
});

describe("a whole pipeline", () => {
  it("counts until every job ends; observed suggestions count as 'para aprovar'", () => {
    const jobs = [
      job({ id: "a", status: "done", result: { applied: 2, pending: 1 } }),
      job({ id: "b", status: "skipped" }),
      job({ id: "c", status: "running" }),
    ];
    const p = jobProgress(jobs, 3);
    expect(progressLabel(p)).toBe("2 de 3");
    expect(p.finished).toBe(false);

    const end = jobProgress([...jobs.slice(0, 2), job({ id: "c", status: "done", result: { applied: 1, proposed: 2 } })], 3);
    expect(end.finished).toBe(true);
    expect(progressSummary(end)).toBe("Copilot leu 3 negócios: 3 ações aplicadas, 3 para aprovar.");
  });

  it("jobs not loaded yet still count in the total", () => {
    expect(jobProgress([job({ status: "done" })], 30)).toMatchObject({ total: 30, finished: false });
  });
});

describe("copilotErrorText", () => {
  it("says what to do", () => {
    expect(copilotErrorText("copilot_disabled")).toMatch(/Agente de CRM/);
    expect(copilotErrorText("P0002: opportunity_not_found")).toMatch(/Nenhum negócio aberto/);
  });
});
