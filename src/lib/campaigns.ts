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
