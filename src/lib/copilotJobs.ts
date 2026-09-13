// Sprint 11 · Onda 6 · T61 — the Copilot's queue, in words.
//
// The Sync button only queues (crm_copilot_enqueue) and follows the jobs it
// queued: how many are done, what the Copilot did, and what went wrong — the
// same counts the job keeps in `copilot_jobs.result`.

export type CopilotJobStatus = "queued" | "running" | "done" | "failed" | "skipped";

export interface CopilotJobRow {
  id: string;
  opportunity_id: string;
  status: CopilotJobStatus;
  reason: string;
  attempts: number;
  last_error: string | null;
  result: { applied?: number; pending?: number; proposed?: number; rejected?: unknown[] } | null;
  run_after: string;
  finished_at: string | null;
}

export interface JobProgress {
  total: number;
  queued: number;
  running: number;
  done: number;
  skipped: number;
  failed: number;
  /** Every job we are following has reached an end (done, skipped or failed). */
  finished: boolean;
  applied: number;
  pending: number;
  errors: string[];
}

export function jobProgress(jobs: CopilotJobRow[], expected: number): JobProgress {
  const p: JobProgress = {
    total: Math.max(expected, jobs.length),
    queued: 0,
    running: 0,
    done: 0,
    skipped: 0,
    failed: 0,
    finished: false,
    applied: 0,
    pending: 0,
    errors: [],
  };
  for (const j of jobs) {
    p[j.status] += 1;
    p.applied += Number(j.result?.applied) || 0;
    p.pending += (Number(j.result?.pending) || 0) + (Number(j.result?.proposed) || 0);
    if (j.status === "failed" && j.last_error) p.errors.push(j.last_error);
  }
  const ended = p.done + p.skipped + p.failed;
  p.finished = p.total > 0 && ended >= p.total;
  return p;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The pill next to the button while it works. */
export function progressLabel(p: JobProgress): string {
  if (p.total === 0) return "";
  if (p.total > 1) return p.finished ? "Pronto" : `${p.done + p.skipped + p.failed} de ${p.total}`;
  if (p.running) return "Lendo a conversa…";
  if (p.queued) return "Na fila";
  return p.failed ? "Não consegui" : "Pronto";
}

/** The toast when it ends. */
export function progressSummary(p: JobProgress): string {
  if (p.total > 1) {
    const read = p.done + p.skipped;
    return `Copilot leu ${plural(read, "negócio", "negócios")}: ${plural(p.applied, "ação aplicada", "ações aplicadas")}, `
      + `${p.pending} para aprovar${p.failed ? ` · ${p.failed} com falha` : ""}.`;
  }
  if (p.failed) return `Copilot não conseguiu ler este negócio${p.errors[0] ? `: ${p.errors[0]}` : "."}`;
  if (p.skipped) return "Nada novo na conversa desde a última leitura.";
  if (p.applied === 0 && p.pending === 0) return "Copilot leu a conversa e não viu nada para mudar.";
  return `Copilot: ${plural(p.applied, "ação aplicada", "ações aplicadas")}, ${p.pending} para aprovar.`;
}

/** What the database says, in words. */
export function copilotErrorText(message: string): string {
  if (message.includes("copilot_disabled")) return "Ative o Agente de CRM nas configurações da equipe.";
  if (message.includes("opportunity_not_found")) return "Nenhum negócio aberto para este contato.";
  if (message.includes("nothing_to_sync")) return "Nada para sincronizar.";
  return message;
}
