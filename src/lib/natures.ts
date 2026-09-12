// Sprint 11 · Onda 3 · T35 — the Oferta and Processo natures, as pure rules.
// Onda 5 · T55 — Duração (a campaign line stops taking new deals after its end)
// and Entradas (which doors feed the line).
//
// Choosing the milestones is choosing the line: each milestone becomes a stage
// that already declares its funnel_event, so the dashboard counts it from day
// one (no "nobody mapped this stage" — Sprint 9's empty state).

import type { EntryKind } from "@/lib/campaigns";
import type { Milestone, PipelineNatures, ProcessMode } from "@/types/natures";

export const MILESTONES: { key: Milestone; label: string; stage: string }[] = [
  { key: "qualified", label: "Qualificação", stage: "Qualificado" },
  { key: "meeting_scheduled", label: "Reunião agendada", stage: "Reunião agendada" },
  { key: "meeting_done", label: "Reunião feita", stage: "Reunião feita" },
  { key: "proposal_sent", label: "Proposta enviada", stage: "Proposta enviada" },
  { key: "contract_sent", label: "Contrato enviado", stage: "Contrato enviado" },
  { key: "contract_signed", label: "Contrato assinado", stage: "Contrato assinado" },
];

const ORDER = new Map(MILESTONES.map((m, i) => [m.key, i]));
const isMilestone = (v: unknown): v is Milestone => typeof v === "string" && ORDER.has(v as Milestone);

export const DEFAULT_NATURES: PipelineNatures = {
  offer: { mode: "free", catalog_item_ids: [] },
  process: { mode: "milestones", milestones: [] },
  duration: { mode: "continuous", starts_on: null, ends_on: null },
};

/** A real calendar day as YYYY-MM-DD (2026-02-30 is not) — the twin of _crm_try_date. */
export function isDay(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

const localDay = (v: string) => {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const byFunnel = (ms: Milestone[]) => [...new Set(ms)].sort((a, b) => (ORDER.get(a) ?? 0) - (ORDER.get(b) ?? 0));

/** pipelines.natures (any shape) → a valid PipelineNatures, defaults filled in. */
export function normalizeNatures(raw: unknown): PipelineNatures {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const offer = (r.offer && typeof r.offer === "object" ? r.offer : {}) as Record<string, unknown>;
  const process = (r.process && typeof r.process === "object" ? r.process : {}) as Record<string, unknown>;
  const duration = (r.duration && typeof r.duration === "object" ? r.duration : {}) as Record<string, unknown>;
  return {
    offer: {
      mode: offer.mode === "catalog" ? "catalog" : "free",
      catalog_item_ids: Array.isArray(offer.catalog_item_ids)
        ? offer.catalog_item_ids.filter((x): x is string => typeof x === "string")
        : [],
    },
    process: {
      mode: process.mode === "direct" ? "direct" : "milestones",
      milestones: Array.isArray(process.milestones) ? byFunnel(process.milestones.filter(isMilestone)) : [],
    },
    duration:
      duration.mode === "campaign"
        ? {
            mode: "campaign",
            starts_on: isDay(duration.starts_on) ? duration.starts_on : null,
            ends_on: isDay(duration.ends_on) ? duration.ends_on : null,
          }
        : { mode: "continuous", starts_on: null, ends_on: null },
  };
}

/** Twin of crm_save_pipeline_natures' duration check (the server says invalid_duration). */
export function durationError(d: PipelineNatures["duration"]): string | null {
  if (d.mode !== "campaign") return null;
  if (!isDay(d.starts_on) || !isDay(d.ends_on)) return "Escolha o início e o fim da campanha.";
  if (d.ends_on < d.starts_on) return "O fim vem antes do início.";
  return null;
}

export interface DurationWindow {
  /** First day, 00:00 local. */
  start: Date;
  /** The day after the last one, 00:00 local (exclusive). */
  end: Date;
  totalDays: number;
  elapsedDays: number;
  /** ended = today is after ends_on — the twin of _crm_line_closed. */
  state: "upcoming" | "running" | "ended";
}

/** A campaign line's window, for the placar; null for a continuous line. */
export function durationWindow(d: PipelineNatures["duration"], now: Date = new Date()): DurationWindow | null {
  if (d.mode !== "campaign" || !isDay(d.starts_on) || !isDay(d.ends_on) || d.ends_on < d.starts_on) return null;
  const DAY = 86_400_000;
  const start = localDay(d.starts_on);
  const last = localDay(d.ends_on);
  const end = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const totalDays = Math.round((end.getTime() - start.getTime()) / DAY);
  const state = today < start ? "upcoming" : today >= end ? "ended" : "running";
  const elapsedDays =
    state === "upcoming" ? 0 : state === "ended" ? totalDays : Math.round((today.getTime() - start.getTime()) / DAY) + 1;
  return { start, end, totalDays, elapsedDays, state };
}

const brDay = (v: string) => v.split("-").reverse().join("/");

/** "Contínua" · "Campanha de 01/09/2026 a 30/09/2026". */
export function durationLabel(d: PipelineNatures["duration"]): string {
  if (d.mode !== "campaign" || !d.starts_on || !d.ends_on) return "Contínua";
  return `Campanha de ${brDay(d.starts_on)} a ${brDay(d.ends_on)}`;
}

/** The kinds of entry that route a new deal to a line (manual and import pick one on the spot). */
const ROUTING_KINDS: EntryKind[] = ["webhook", "whatsapp", "agent"];

/**
 * The entries that feed a line: those whose new deals land in it — their own line,
 * or the team default when they have none (crm_entry_list gives pipeline_id so).
 */
export function entriesFeedingLine<E extends { kind: EntryKind; pipeline_id: string | null }>(
  entries: E[],
  pipelineId: string,
  defaultPipelineId: string | null,
): E[] {
  return entries.filter((e) => ROUTING_KINDS.includes(e.kind) && (e.pipeline_id ?? defaultPipelineId) === pipelineId);
}

export interface StageDraft {
  name: string;
  stage_type: "open" | "won" | "lost";
  funnel_event: Milestone | null;
  position: number;
  color: string;
}

const COLORS = ["#64748b", "#0ea5e9", "#6366f1", "#8b5cf6", "#f59e0b", "#f97316", "#14b8a6"];

/** The stages a process generates: the line, ready to use. */
export function stagesForProcess(process: { mode: ProcessMode; milestones: Milestone[] }): StageDraft[] {
  const open: Omit<StageDraft, "position">[] =
    process.mode === "direct"
      ? [{ name: "Novo", stage_type: "open", funnel_event: null, color: COLORS[0] }]
      : [
          { name: "Novo", stage_type: "open", funnel_event: null, color: COLORS[0] },
          ...byFunnel(process.milestones).map((m, i) => ({
            name: MILESTONES[ORDER.get(m)!].stage,
            stage_type: "open" as const,
            funnel_event: m,
            color: COLORS[(i + 1) % COLORS.length],
          })),
        ];
  const closing: Omit<StageDraft, "position">[] =
    process.mode === "direct"
      ? [
          { name: "Comprou", stage_type: "won", funnel_event: null, color: "#22c55e" },
          { name: "Não comprou", stage_type: "lost", funnel_event: null, color: "#ef4444" },
        ]
      : [
          { name: "Ganho", stage_type: "won", funnel_event: null, color: "#22c55e" },
          { name: "Perdido", stage_type: "lost", funnel_event: null, color: "#ef4444" },
        ];
  return [...open, ...closing].map((s, position) => ({ ...s, position }));
}

/** The chosen milestones that no stage of the line declares yet, in funnel order. */
export function missingMilestones(stages: { funnel_event?: string | null }[], chosen: Milestone[]): Milestone[] {
  const declared = new Set(stages.map((s) => s.funnel_event).filter(Boolean));
  return byFunnel(chosen).filter((m) => !declared.has(m));
}
