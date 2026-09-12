import { describe, expect, it } from "vitest";

import { actionDraftError, actionsFrom, isRunWaiting, runStatusText, type ArtifactRun } from "../artifactActions";

const now = new Date("2026-09-12T12:00:00Z");
const run = (extra: Partial<ArtifactRun> = {}): ArtifactRun => ({
  id: "r",
  action_label: "Gerar proposta",
  status: "queued",
  created_at: "2026-09-12T11:59:00Z",
  finished_at: null,
  expires_at: "2026-09-19T11:59:00Z",
  result: null,
  ...extra,
});

describe("actionDraftError (the database's rule)", () => {
  it("wants a label and an http(s) URL", () => {
    expect(actionDraftError({ label: "Gerar proposta", url: "https://n8n.test/webhook/x" })).toBeNull();
    expect(actionDraftError({ label: " ", url: "https://n8n.test" })).toMatch(/nome/);
    expect(actionDraftError({ label: "x".repeat(61), url: "https://n8n.test" })).toMatch(/60/);
    expect(actionDraftError({ label: "Gerar", url: "ftp://n8n.test" })).toMatch(/https/);
    expect(actionDraftError({ label: "Gerar", url: "https://n8n.test/ com espaço" })).toMatch(/https/);
  });
});

describe("actionsFrom", () => {
  it("keeps the well-formed actions of the table", () => {
    expect(actionsFrom([{ id: "a", label: "Gerar", webhook_config_id: "w" }, { label: "sem id" }, null])).toEqual([
      { id: "a", label: "Gerar" },
    ]);
    expect(actionsFrom(null)).toEqual([]);
  });
});

describe("a run on screen", () => {
  it("is waiting while queued and the token is valid", () => {
    expect(isRunWaiting(run(), now)).toBe(true);
    expect(runStatusText(run(), now)).toBe("Aguardando retorno");
    expect(runStatusText(run({ expires_at: "2026-09-12T11:00:00Z" }), now)).toBe("Sem retorno (expirou)");
  });

  it("says what came back", () => {
    expect(runStatusText(run({ status: "completed" }), now)).toBe("Concluído");
    expect(runStatusText(run({ status: "failed", result: { error: "APITemplate fora do ar" } }), now)).toBe(
      "Falhou: APITemplate fora do ar",
    );
    expect(runStatusText(run({ result: { responses: [{}] } }), now)).toBe("Respondido, aguardando o próximo retorno");
    expect(runStatusText(run({ result: { last_error: "invalid_artifact_status" } }), now)).toBe(
      "Aguardando retorno (último erro: invalid_artifact_status)",
    );
  });
});
