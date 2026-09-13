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
};

export const statusLabel = (status: string) => STATUS[status] ?? status;

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
