// Sprint 11 · Onda 3 · T35 — the Oferta and Processo natures, as pure rules.
//
// Choosing the milestones is choosing the line: each milestone becomes a stage
// that already declares its funnel_event, so the dashboard counts it from day
// one (no "nobody mapped this stage" — Sprint 9's empty state).

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
};

const byFunnel = (ms: Milestone[]) => [...new Set(ms)].sort((a, b) => (ORDER.get(a) ?? 0) - (ORDER.get(b) ?? 0));

/** pipelines.natures (any shape) → a valid PipelineNatures, defaults filled in. */
export function normalizeNatures(raw: unknown): PipelineNatures {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const offer = (r.offer && typeof r.offer === "object" ? r.offer : {}) as Record<string, unknown>;
  const process = (r.process && typeof r.process === "object" ? r.process : {}) as Record<string, unknown>;
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
  };
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
