// Sprint 11 · Onda 4 · T44 — the pure parts of the automation buttons.
//
// An artifact table has actions (label + URL of the automation). A click sends
// the record through the outbound queue; the automation answers on the callback.
// Here: the same checks the database makes when the actions are saved, and how a
// run reads on screen.

export interface ArtifactAction {
  id: string;
  label: string;
}

export interface ArtifactActionDraft {
  id?: string;
  label: string;
  url: string;
}

export type ArtifactRunStatus = "queued" | "claimed" | "completed" | "failed";

export interface ArtifactRun {
  id: string;
  action_label: string;
  status: ArtifactRunStatus;
  created_at: string;
  finished_at: string | null;
  expires_at: string;
  result: Record<string, unknown> | null;
}

export const MAX_ACTIONS = 10;

/** The database's rule (crm_save_artifact_actions): a label up to 60 and an http(s) URL. */
export function actionDraftError(draft: ArtifactActionDraft): string | null {
  const label = draft.label.trim();
  if (!label) return "Dê um nome ao botão.";
  if (label.length > 60) return "O nome do botão passa de 60 caracteres.";
  if (!/^https?:\/\/\S+$/.test(draft.url.trim())) return "A URL precisa começar com https:// (ou http://).";
  return null;
}

export function actionsFrom(raw: unknown): ArtifactAction[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
    .filter((a) => typeof a.id === "string" && typeof a.label === "string")
    .map((a) => ({ id: a.id as string, label: a.label as string }));
}

/** Waiting for the automation: queued (or being applied) and the token still valid. */
export function isRunWaiting(run: ArtifactRun, now: Date = new Date()): boolean {
  return (run.status === "queued" || run.status === "claimed") && new Date(run.expires_at) > now;
}

/** How a run reads: "Aguardando retorno", "Concluído", "Falhou: …", "Expirou". */
export function runStatusText(run: ArtifactRun, now: Date = new Date()): string {
  const responses = Array.isArray(run.result?.responses) ? (run.result?.responses as unknown[]).length : 0;
  if (run.status === "completed") return "Concluído";
  if (run.status === "failed") {
    const why = typeof run.result?.error === "string" ? run.result.error : "";
    return why ? `Falhou: ${why}` : "Falhou";
  }
  if (!isRunWaiting(run, now)) return "Sem retorno (expirou)";
  if (responses > 0) return "Respondido, aguardando o próximo retorno";
  const lastError = typeof run.result?.last_error === "string" ? run.result.last_error : "";
  return lastError ? `Aguardando retorno (último erro: ${lastError})` : "Aguardando retorno";
}
