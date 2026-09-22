// Sprint 11 · Onda 6 · T64 — the Copilot's home, in words.
//
// crm_copilot_feed returns what waits for approval, what the Copilot did in the
// last 7 days, the passes that failed and today's numbers; crm_copilot_resolve /
// crm_copilot_undo answer with a reason. These helpers turn all of it into the
// sentences the home shows.

export interface FeedItem {
  id: string;
  status: string;
  at: string;
  label: string | null;
  why?: string | null;
  reason?: string | null;
  confidence?: number | null;
  opportunity_id: string;
  pipeline_id: string | null;
  contact: string | null;
}

export interface FeedFailure {
  id: string;
  at: string;
  error: string | null;
  opportunity_id: string;
  pipeline_id: string | null;
  contact: string | null;
}

export interface CopilotFeed {
  pending: FeedItem[];
  recent: FeedItem[];
  failures: FeedFailure[];
  today: { applied: number; read: number };
}

export const EMPTY_FEED: CopilotFeed = { pending: [], recent: [], failures: [], today: { applied: 0, read: 0 } };

/** The home's one line under the chat (T68): what waits for a person and what was done today. */
export function activityLine(feed: Pick<CopilotFeed, "pending" | "today">): { text: string; attention: boolean } {
  const waiting = feed.pending.length;
  const done = feed.today.applied;
  const left = waiting === 0 ? "Nada para aprovar" : `${waiting} para aprovar`;
  const right = done === 0 ? "nenhuma ação hoje" : `${done} ${done === 1 ? "ação" : "ações"} hoje`;
  return { text: `${left} · ${right}`, attention: waiting > 0 };
}

const WHY: Record<string, string> = {
  risky: "pede aprovação",
  low_confidence: "confiança baixa",
  suggest_mode: "linha no modo sugerir",
  observe: "só observando",
  no_credits: "sem créditos",
  fields_need_approval: "campos pedem aprovação",
  stages_need_approval: "etapas pedem aprovação",
};

export const whyLabel = (why: string | null | undefined) => (why ? WHY[why] ?? why : "");

const STATUS: Record<string, string> = {
  auto_applied: "feito",
  executed: "aprovado",
  undone: "desfeito",
  stale: "desatualizada",
  rejected: "recusada",
  pending_approval: "aguardando",
  proposed: "proposta",
};

export const statusLabel = (status: string) => STATUS[status] ?? status;

/** The order the approval queue reads its reasons in — risk first, then doubt. */
const WHY_ORDER = ["risky", "low_confidence", "fields_need_approval", "stages_need_approval", "suggest_mode", "observe", "no_credits"];

const whyRank = (why: string) => {
  const i = WHY_ORDER.indexOf(why);
  return i === -1 ? WHY_ORDER.length : i;
};

export interface ApprovalGroup {
  why: string;
  label: string;
  items: FeedItem[];
}

/**
 * Pending suggestions grouped by why they wait for a person, risk first.
 * Items without a reason land in a trailing group instead of disappearing.
 */
export function groupByWhy(items: FeedItem[]): ApprovalGroup[] {
  const groups = new Map<string, FeedItem[]>();
  for (const item of items) {
    const why = item.why ?? "";
    if (!groups.has(why)) groups.set(why, []);
    groups.get(why)!.push(item);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => whyRank(a) - whyRank(b))
    .map(([why, group]) => ({ why, label: whyLabel(why) || "outras", items: group }));
}

export interface WhyCount {
  why: string;
  label: string;
  count: number;
}

/** How many pending suggestions per reason — what the filter chips read. */
export function whyCounts(items: FeedItem[]): WhyCount[] {
  return groupByWhy(items).map((g) => ({ why: g.why, label: g.label, count: g.items.length }));
}

export interface BulkResolveSummary {
  total: number;
  ok: number;
  stale: number;
  notPending: number;
  failed: number;
}

/**
 * Fold the per-decision answers of a bulk round into one summary. A `null` is a
 * call that threw (`crm_copilot_resolve` raises when the decision or the deal is
 * gone) — it counts as an error and never takes the rest of the batch down.
 */
export function summarizeBulk(answers: Array<{ ok?: boolean; reason?: string } | null>): BulkResolveSummary {
  const summary: BulkResolveSummary = { total: answers.length, ok: 0, stale: 0, notPending: 0, failed: 0 };
  for (const answer of answers) {
    if (answer?.ok) summary.ok += 1;
    else if (answer?.reason === "stale") summary.stale += 1;
    else if (answer?.reason === "not_pending") summary.notPending += 1;
    else summary.failed += 1;
  }
  return summary;
}

/** What a bulk approve/reject answered, in one sentence; tone drives the toast. */
export function bulkResolveText(
  approve: boolean,
  summary: BulkResolveSummary,
): { tone: "success" | "warning" | "error"; text: string } {
  const verb = approve ? "Aplicadas" : "Recusadas";
  const one = approve ? "Aplicada" : "Recusada";
  const problems: string[] = [];
  if (summary.stale > 0) problems.push(`${summary.stale} desatualizada${summary.stale === 1 ? "" : "s"}`);
  if (summary.notPending > 0) problems.push(`${summary.notPending} já resolvida${summary.notPending === 1 ? "" : "s"}`);
  if (summary.failed > 0) problems.push(`${summary.failed} com erro`);

  const head = summary.ok === 1 ? `1 ${one.toLowerCase()}` : `${summary.ok} ${verb.toLowerCase()}`;
  if (problems.length === 0) return { tone: "success", text: `${head}.` };
  if (summary.ok === 0) return { tone: "error", text: `Nenhuma: ${problems.join(", ")}.` };
  return { tone: "warning", text: `${head}; ${problems.join(", ")}.` };
}

/** What crm_copilot_undo answered, in words; null = done. */
export function undoText(result: { ok?: boolean; reason?: string } | null | undefined): string | null {
  if (result?.ok) return null;
  switch (result?.reason) {
    case "changed_since":
      return "Alguém mexeu depois — não dá para desfazer sem apagar a mudança dessa pessoa.";
    case "not_applied":
      return "Isso já não está aplicado.";
    default:
      return "Não deu para desfazer.";
  }
}

/** What crm_copilot_resolve answered, in words; null = done. */
export function resolveText(result: { ok?: boolean; reason?: string } | null | undefined): string | null {
  if (result?.ok) return null;
  switch (result?.reason) {
    case "stale":
      return "O negócio mudou desde a sugestão — ela ficou desatualizada e não foi aplicada.";
    case "not_pending":
      return "Essa sugestão já foi resolvida.";
    default:
      return "Não deu para aplicar a sugestão.";
  }
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Items grouped by local day, newest first: "Hoje", "Ontem", then "dd/mm". */
export function groupByDay<T extends { at: string }>(items: T[], now: Date = new Date()): { label: string; items: T[] }[] {
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const groups = new Map<string, { label: string; items: T[] }>();
  const sorted = [...items].sort((a, b) => (a.at < b.at ? 1 : -1));
  for (const item of sorted) {
    const d = new Date(item.at);
    const key = dayKey(d);
    const label =
      key === today ? "Hoje" : key === yesterday ? "Ontem" : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!groups.has(key)) groups.set(key, { label, items: [] });
    groups.get(key)!.items.push(item);
  }
  return [...groups.values()];
}

/** Where a feed line opens: the deal's pipeline, filtered to the contact. */
export function dealHref(item: { pipeline_id: string | null; contact: string | null }): string | null {
  if (!item.pipeline_id) return null;
  return `/crm?tab=pipeline&pipeline=${item.pipeline_id}${item.contact ? `&q=${encodeURIComponent(item.contact)}` : ""}`;
}
