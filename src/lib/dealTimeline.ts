// A linha do tempo do negócio e o checklist do "Ganho" — regras puras.
//
// O servidor (crm_deal_timeline) devolve os eventos já em ordem; aqui eles
// viram categoria (cor), marcos do funil (o gráfico) e os padrões do fechamento.

export interface TimelineEvent {
  at: string;
  kind: string;
  label: string;
  detail: string | null;
  actor: string | null;
}

export interface TimelineSummary {
  created_at: string;
  closed_at: string | null;
  cycle_days: number;
  first_response_hours: number | null;
  touchpoints: number;
  last_touchpoint_at: string | null;
  meetings_scheduled: number;
  meetings_done: number;
  no_shows: number;
  stage_sla_hours: number | null;
  hours_in_stage: number;
  value: number | null;
  won_snapshot: { items_won?: string[]; items_lost?: string[]; value?: number } | null;
}

export interface TimelineItem {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface TimelineArtifact {
  id: string;
  kind: "proposal" | "contract" | "document";
  table: string;
  title: string;
  status: string | null;
  value: number | null;
  items: string | null;
  created_at: string;
}

export interface DealTimeline {
  summary: TimelineSummary;
  items: TimelineItem[];
  artifacts: TimelineArtifact[];
  events: TimelineEvent[];
}

export type EventCategory =
  | "start" | "contact" | "stage" | "proposal" | "meeting" | "noshow" | "contract" | "won" | "lost";

export function categoryOf(kind: string): EventCategory {
  if (kind === "lead" || kind === "created") return "start";
  if (kind === "touchpoint") return "contact";
  if (kind === "no_show") return "noshow";
  if (kind.startsWith("meeting")) return "meeting";
  if (kind.startsWith("proposal")) return "proposal";
  if (kind.startsWith("contract")) return "contract";
  if (kind === "won") return "won";
  if (kind === "lost") return "lost";
  return "stage";
}

/** Tailwind classes per category: dot and soft chip. */
export const CATEGORY_STYLE: Record<EventCategory, { dot: string; chip: string }> = {
  start: { dot: "bg-slate-400", chip: "bg-slate-500/10 text-slate-700 dark:text-slate-300" },
  contact: { dot: "bg-sky-500", chip: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  stage: { dot: "bg-muted-foreground/40", chip: "bg-muted text-muted-foreground" },
  proposal: { dot: "bg-violet-500", chip: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  meeting: { dot: "bg-amber-500", chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  noshow: { dot: "bg-rose-500", chip: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  contract: { dot: "bg-indigo-500", chip: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" },
  won: { dot: "bg-emerald-500", chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  lost: { dot: "bg-rose-600", chip: "bg-rose-600/10 text-rose-700 dark:text-rose-300" },
};

export interface Milestone {
  key: "start" | "contact" | "proposal" | "meeting" | "contract" | "close";
  label: string;
  category: EventCategory;
  reached: boolean;
  at: string | null;
  /** Second line under the stop (e.g. "aceita 18/11", "2 · 1 no-show"). */
  note: string | null;
}

const first = (events: TimelineEvent[], test: (k: string) => boolean) => events.find((e) => test(e.kind)) ?? null;
const last = (events: TimelineEvent[], test: (k: string) => boolean) =>
  [...events].reverse().find((e) => test(e.kind)) ?? null;

export const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : null;

/** The funnel strip: Entrada → 1º contato → Proposta → Reunião → Contrato → Ganho/Perdido. */
export function milestonesOf(t: Pick<DealTimeline, "events" | "summary">): Milestone[] {
  const ev = t.events;
  const startEv = first(ev, (k) => k === "lead" || k === "created");
  const contact = first(ev, (k) => k === "touchpoint");
  const proposal = first(ev, (k) => k.startsWith("proposal"));
  const accepted = last(ev, (k) => k === "proposal_accepted");
  const meeting = first(ev, (k) => k.startsWith("meeting") || k === "no_show");
  const contract = first(ev, (k) => k.startsWith("contract"));
  const signed = last(ev, (k) => k === "contract_signed");
  const closeEv = last(ev, (k) => k === "won" || k === "lost");
  const lost = closeEv?.kind === "lost";
  const { meetings_done: done, no_shows: ns } = t.summary;
  const meetingNote = done || ns ? [`${done} realizada${done === 1 ? "" : "s"}`, ns ? `${ns} no-show` : null].filter(Boolean).join(" · ") : null;
  return [
    { key: "start", label: "Entrada", category: "start", reached: !!startEv, at: startEv?.at ?? null, note: null },
    {
      key: "contact", label: "1º contato", category: "contact", reached: !!contact, at: contact?.at ?? null,
      note: t.summary.touchpoints ? `${t.summary.touchpoints} touchpoint${t.summary.touchpoints === 1 ? "" : "s"}` : null,
    },
    {
      key: "proposal", label: "Proposta", category: "proposal", reached: !!proposal, at: proposal?.at ?? null,
      note: accepted ? `aceita ${shortDate(accepted.at)}` : null,
    },
    { key: "meeting", label: "Reunião", category: ns && !done ? "noshow" : "meeting", reached: !!meeting, at: meeting?.at ?? null, note: meetingNote },
    {
      key: "contract", label: "Contrato", category: "contract", reached: !!contract, at: contract?.at ?? null,
      note: signed ? `assinado ${shortDate(signed.at)}` : null,
    },
    {
      key: "close", label: lost ? "Perdido" : "Ganho", category: lost ? "lost" : "won", reached: !!closeEv,
      at: closeEv?.at ?? null, note: closeEv && !lost && t.summary.cycle_days ? `${t.summary.cycle_days} dias de ciclo` : null,
    },
  ];
}

export const brl = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export function hoursLabel(h: number | null | undefined): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} dias`;
}

/**
 * The artifact the win most likely closed with: the one already accepted/signed,
 * else the only one, else the latest one sent. null = let the seller choose.
 */
export function defaultArtifact(list: TimelineArtifact[], kind: "proposal" | "contract"): string | null {
  const own = list.filter((a) => a.kind === kind && a.status !== "rejected");
  const closed = own.filter((a) => a.status === (kind === "proposal" ? "accepted" : "signed"));
  if (closed.length === 1) return closed[0].id;
  if (own.length === 1) return own[0].id;
  const sent = own.filter((a) => a.status === "sent");
  return sent.length === 1 ? sent[0].id : null;
}

export interface WonItemChoice { id: string; won: boolean; unit_price: number }

/** The real value of the win: the checked items, else the chosen proposal, else the deal value. */
export function wonValue(
  items: TimelineItem[],
  choices: Record<string, WonItemChoice>,
  proposal: TimelineArtifact | null,
  fallback: number | null,
): number | null {
  if (items.length > 0) {
    return Math.round(
      items.reduce((sum, i) => {
        const c = choices[i.id];
        return c && !c.won ? sum : sum + (c?.unit_price ?? i.unit_price) * i.quantity;
      }, 0) * 100,
    ) / 100;
  }
  return proposal?.value ?? fallback;
}
