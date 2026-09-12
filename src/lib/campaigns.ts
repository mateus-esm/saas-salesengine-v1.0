// Sprint 11 · Onda 5 · T52 — the pure parts of campaigns and entries.
//
// A campaign has keys (the utm_campaign values or platform IDs that fall into
// it); an entry is a door with a stamp and an owner rule. These are the twins of
// the database's rules (crm_save_campaign, _crm_normalize_owner_rule) the forms
// check before sending, and the words the screens use.

import type { OriginCategory } from "@/types/crm";

import type { Platform } from "./attribution";

export type CampaignStatus = "active" | "paused" | "ended" | "archived";

export const CAMPAIGN_STATUSES: { value: CampaignStatus; label: string }[] = [
  { value: "active", label: "Ativa" },
  { value: "paused", label: "Pausada" },
  { value: "ended", label: "Encerrada" },
  { value: "archived", label: "Arquivada" },
];

export const campaignStatusLabel = (s: string) => CAMPAIGN_STATUSES.find((x) => x.value === s)?.label ?? s;

export interface Campaign {
  id: string;
  name: string;
  platform: Platform | null;
  origin_category: OriginCategory | null;
  owner_id: string | null;
  goal_leads: number | null;
  goal_deals: number | null;
  goal_revenue: number | null;
  starts_on: string | null;
  ends_on: string | null;
  status: CampaignStatus;
  match_keys: string[];
  leads: number;
  touches: number;
  spend: number;
  last_touch_at: string | null;
}

export interface CampaignDraft {
  id?: string;
  name: string;
  platform: Platform | null;
  origin_category: OriginCategory | null;
  owner_id: string | null;
  goal_leads: number | null;
  goal_deals: number | null;
  goal_revenue: number | null;
  starts_on: string | null;
  ends_on: string | null;
  status: CampaignStatus;
  match_keys: string[];
}

/** Twin of crm_save_campaign: lower case, trimmed, no empty, no repeat, sorted. Accepts "a, b\nc". */
export function normalizeMatchKeys(raw: string | string[]): string[] {
  const parts = Array.isArray(raw) ? raw : raw.split(/[,\n;]/);
  return Array.from(new Set(parts.map((k) => k.trim().toLowerCase()).filter(Boolean))).sort();
}

export function campaignDraftError(d: CampaignDraft): string | null {
  const name = d.name.trim();
  if (!name) return "Dê um nome à campanha.";
  if (name.length > 120) return "O nome passa de 120 caracteres.";
  if (d.starts_on && d.ends_on && d.ends_on < d.starts_on) return "O fim vem antes do início.";
  for (const g of [d.goal_leads, d.goal_deals, d.goal_revenue]) {
    if (g !== null && (!Number.isFinite(g) || g < 0)) return "Meta não pode ser negativa.";
  }
  if (normalizeMatchKeys(d.match_keys).length > 50) return "No máximo 50 chaves.";
  return null;
}

/** What the database says, in words ("match_key_taken:usina_verao" → the key in quotes). */
export function campaignErrorText(message: string): string {
  const taken = /match_key_taken:([^\s"]+)/.exec(message);
  if (taken) return `A chave “${taken[1]}” já está em outra campanha.`;
  if (message.includes("owner_not_in_team")) return "O responsável precisa ser da equipe.";
  if (message.includes("invalid_campaign_name")) return "Dê um nome à campanha (até 120 caracteres).";
  if (message.includes("campaign_not_found")) return "Campanha não encontrada.";
  return message;
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export type EntryKind = "webhook" | "whatsapp" | "agent" | "manual" | "import";

export const ENTRY_KIND_LABEL: Record<EntryKind, string> = {
  webhook: "Webhook",
  whatsapp: "WhatsApp",
  agent: "Agente de IA",
  manual: "Manual",
  import: "Importação / API",
};

export type OwnerRuleMode = "none" | "fixed" | "round_robin";

export interface OwnerRule {
  mode: OwnerRuleMode;
  user_ids: string[];
}

/** Twin of _crm_normalize_owner_rule, minus the team check (the server does it). */
export function normalizeOwnerRule(raw: unknown): OwnerRule {
  const r = (raw && typeof raw === "object" ? raw : {}) as { mode?: unknown; user_ids?: unknown };
  const mode: OwnerRuleMode = r.mode === "fixed" || r.mode === "round_robin" ? r.mode : "none";
  if (mode === "none") return { mode, user_ids: [] };
  const ids = Array.isArray(r.user_ids) ? r.user_ids.filter((x): x is string => typeof x === "string") : [];
  return { mode, user_ids: Array.from(new Set(ids)) };
}

export function ownerRuleLabel(rule: OwnerRule, nameOf: (id: string) => string | null): string {
  const names = rule.user_ids.map((id) => nameOf(id) ?? "Usuário removido");
  if (rule.mode === "fixed") return names[0] ? `Sempre ${names[0]}` : "Fixo, sem ninguém";
  if (rule.mode === "round_robin") return names.length ? `Rodízio: ${names.join(", ")}` : "Rodízio, sem ninguém";
  return "Sem regra";
}

export interface Entry {
  id: string;
  kind: EntryKind;
  name: string;
  webhook_config_id: string | null;
  pipeline_id: string | null;
  pipeline_name: string | null;
  webhook_active: boolean | null;
  origin_category: OriginCategory | null;
  platform: Platform | null;
  campaign_id: string | null;
  campaign_name: string | null;
  owner_rule: OwnerRule;
  active: boolean;
  leads: number;
  touches_30d: number;
  last_touch_at: string | null;
}

export interface UnmatchedUtm {
  value: string;
  touches: number;
  last_at: string;
  platform: Platform | null;
}

// ---------------------------------------------------------------------------
// Sprint 11 · T54 — the campaign report (crm_campaign_report)
// ---------------------------------------------------------------------------

export type ReportPeriod = "this_month" | "last_month" | "30d" | "90d" | "this_year";

export const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
  this_month: "Este mês",
  last_month: "Mês passado",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  this_year: "Este ano",
};

/** [from, to) as ISO, in local days. */
export function reportRange(period: ReportPeriod, now: Date = new Date()): { from: string; to: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const day = (yy: number, mm: number, dd: number) => new Date(yy, mm, dd).toISOString();
  switch (period) {
    case "this_month":
      return { from: day(y, m, 1), to: day(y, m + 1, 1) };
    case "last_month":
      return { from: day(y, m - 1, 1), to: day(y, m, 1) };
    case "30d":
      return { from: day(y, m, d - 29), to: day(y, m, d + 1) };
    case "90d":
      return { from: day(y, m, d - 89), to: day(y, m, d + 1) };
    case "this_year":
      return { from: day(y, 0, 1), to: day(y + 1, 0, 1) };
  }
}

export interface CampaignReportRow {
  campaign_id: string | null;
  name: string;
  platform: string | null;
  status: string | null;
  goal_leads: number | null;
  leads: number;
  deals: number;
  wins: number;
  losses: number;
  revenue: number;
  spend: number;
  cpl: number | null;
  cost_per_win: number | null;
  win_rate: number | null;
  roas: number | null;
  roi: number | null;
}

/** The totals line: sums, and the ratios over the campaigns that had spend. */
export function reportTotals(rows: CampaignReportRow[]): Omit<CampaignReportRow, "campaign_id" | "name" | "platform" | "status" | "goal_leads"> {
  const sum = (k: "leads" | "deals" | "wins" | "losses" | "revenue" | "spend") => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const leads = sum("leads");
  const deals = sum("deals");
  const wins = sum("wins");
  const losses = sum("losses");
  const revenue = Math.round(sum("revenue") * 100) / 100;
  const spend = Math.round(sum("spend") * 100) / 100;
  // Ratios over the campaigns that had spend (a campaign without spend, or "Sem
  // campanha", would dilute cost per lead and inflate the return).
  const paid = rows.filter((r) => Number(r.spend) > 0);
  const paidLeads = paid.reduce((s, r) => s + r.leads, 0);
  const paidWins = paid.reduce((s, r) => s + r.wins, 0);
  const paidRevenue = paid.reduce((s, r) => s + (Number(r.revenue) || 0), 0);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    leads,
    deals,
    wins,
    losses,
    revenue,
    spend,
    cpl: spend > 0 && paidLeads > 0 ? round2(spend / paidLeads) : null,
    cost_per_win: spend > 0 && paidWins > 0 ? round2(spend / paidWins) : null,
    win_rate: wins + losses > 0 ? Math.round((1000 * wins) / (wins + losses)) / 10 : null,
    roas: spend > 0 ? round2(paidRevenue / spend) : null,
    roi: spend > 0 ? Math.round((1000 * (paidRevenue - spend)) / spend) / 10 : null,
  };
}
