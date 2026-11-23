// Sprint 16 — Growth: the pure parts (experiments, creatives, ads, the ratios of the
// ads report). The twins of the database's rules live here so the forms can check
// before sending, and the screens share one set of words.

import type { OriginCategory } from "@/types/crm";

// ---------------------------------------------------------------------------
// Creatives
// ---------------------------------------------------------------------------

export const CREATIVE_CODE_RE = /^[A-Z][0-9]{3}-V[0-9]+$/;

/** "p002-v3" → "P002-V3"; null when it is not a creative code. Twin of crm_save_creative. */
export function normalizeCreativeCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return CREATIVE_CODE_RE.test(code) ? code : null;
}

/** The code at the start of an ad name or utm_content. Twin of _crm_creative_code. */
export function creativeCodeOf(text: string | null | undefined): string | null {
  const m = /^([A-Za-z][0-9]{3}-[Vv][0-9]+)/.exec((text ?? "").trim());
  return m ? m[1].toUpperCase() : null;
}

export interface Creative {
  id: string;
  code: string;
  title: string;
  format: string | null;
  delivered_on: string | null;
  files_url: string | null;
  notes: string | null;
  status: "active" | "archived";
  ads: number;
  leads: number;
}

export const CREATIVE_FORMATS = ["Reels", "Feed", "Stories", "Carrossel", "Imagem", "Vídeo", "Busca", "Outro"];

// ---------------------------------------------------------------------------
// Ads
// ---------------------------------------------------------------------------

export type AdPlatform = "meta" | "google" | "tiktok" | "linkedin" | "youtube" | "kwai" | "pinterest";
export const AD_PLATFORMS: { value: AdPlatform; label: string }[] = [
  { value: "meta", label: "Meta" },
  { value: "google", label: "Google" },
  { value: "tiktok", label: "TikTok" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "youtube", label: "YouTube" },
  { value: "kwai", label: "Kwai" },
  { value: "pinterest", label: "Pinterest" },
];

export type AdDestination = "whatsapp" | "form" | "site" | "other";
export const AD_DESTINATIONS: { value: AdDestination; label: string; key: string }[] = [
  { value: "whatsapp", label: "WhatsApp", key: "ctwa_clid" },
  { value: "form", label: "Formulário instantâneo", key: "leadgen_id" },
  { value: "site", label: "Site / landing", key: "fbclid · gclid · UTMs" },
  { value: "other", label: "Outro", key: "—" },
];
export const destinationLabel = (d: string | null | undefined) => AD_DESTINATIONS.find((x) => x.value === d)?.label ?? "—";

export type AdStatus = "active" | "paused" | "archived";
export const AD_STATUSES: { value: AdStatus; label: string }[] = [
  { value: "active", label: "Ativo" },
  { value: "paused", label: "Pausado" },
  { value: "archived", label: "Arquivado" },
];

export interface Ad {
  id: string;
  platform: AdPlatform;
  external_ad_id: string | null;
  ad_name: string | null;
  adset_external_id: string | null;
  adset_name: string | null;
  campaign_external_id: string | null;
  campaign_name: string | null;
  account_id: string | null;
  account_name: string | null;
  campaign_id: string | null;
  creative_id: string | null;
  destination: AdDestination | null;
  form_name: string | null;
  prefill_message: string | null;
  starts_on: string | null;
  ends_on: string | null;
  daily_budget: number | null;
  status: AdStatus;
  source: "manual" | "windsor";
  needs_review: boolean;
  last_seen_at: string | null;
  creative_code: string | null;
  crm_campaign_name: string | null;
  spend_30d: number;
  leads: number;
}

export type AdDraft = Omit<Ad, "id" | "source" | "needs_review" | "last_seen_at" | "creative_code" | "crm_campaign_name" | "spend_30d" | "leads" | "account_id" | "account_name"> & { id?: string };

export function emptyAdDraft(): AdDraft {
  return {
    platform: "meta",
    external_ad_id: null,
    ad_name: null,
    adset_external_id: null,
    adset_name: null,
    campaign_external_id: null,
    campaign_name: null,
    campaign_id: null,
    creative_id: null,
    destination: null,
    form_name: null,
    prefill_message: null,
    starts_on: null,
    ends_on: null,
    daily_budget: null,
    status: "active",
  };
}

export function adDraftError(d: AdDraft): string | null {
  if (!d.external_ad_id?.trim() && !d.ad_name?.trim() && !d.prefill_message?.trim()) {
    return "Informe o ID do anúncio, o nome ou a mensagem padrão — algo que o lead traga.";
  }
  if (d.external_ad_id && !/^[\w:.-]{1,120}$/.test(d.external_ad_id.trim())) return "O ID do anúncio tem caracteres estranhos.";
  if (d.starts_on && d.ends_on && d.ends_on < d.starts_on) return "O fim vem antes do início.";
  if (d.daily_budget !== null && (!Number.isFinite(d.daily_budget) || d.daily_budget < 0)) return "Verba não pode ser negativa.";
  if ((d.prefill_message ?? "").length > 500) return "A mensagem padrão passa de 500 caracteres.";
  return null;
}

/** What is still missing for the ad to count in full ("a completar"). */
export function adMissing(a: Pick<Ad, "campaign_id" | "creative_id" | "destination">): string[] {
  const out: string[] = [];
  if (!a.campaign_id) out.push("campanha");
  if (!a.creative_id) out.push("criativo");
  if (!a.destination) out.push("destino");
  return out;
}

export function growthErrorText(message: string): string {
  const taken = /match_key_taken:([^\s"]+)/.exec(message);
  if (taken) return `O ID de campanha “${taken[1]}” já está em outra campanha do Rev.`;
  const adTaken = /ad_id_taken:([^\s"]+)/.exec(message);
  if (adTaken) return `O anúncio ${adTaken[1]} já está cadastrado.`;
  const codeTaken = /creative_code_taken:([^\s"]+)/.exec(message);
  if (codeTaken) return `O código ${codeTaken[1]} já existe.`;
  if (message.includes("prefill_taken")) return "Outro anúncio ativo já usa essa mensagem padrão.";
  if (message.includes("invalid_creative_code")) return "Código no padrão P000-V0 (ex.: P002-V3).";
  if (message.includes("ad_needs_identity")) return "Informe o ID do anúncio, o nome ou a mensagem padrão.";
  if (message.includes("owner_not_in_team")) return "O responsável precisa ser da equipe.";
  return message;
}

// ---------------------------------------------------------------------------
// The ads report: manager numbers next to Rev's
// ---------------------------------------------------------------------------

export interface AdsReportBase {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  video_3s: number;
  thruplays: number;
  platform_leads: number;
  conversations: number;
  leads: number;
  deals: number;
  wins: number;
  revenue: number;
}

export interface AdReportRow extends AdsReportBase {
  id: string;
  platform: AdPlatform;
  external_ad_id: string | null;
  ad_name: string | null;
  campaign_id: string | null;
  campaign: string | null;
  creative_id: string | null;
  creative_code: string | null;
  status: AdStatus;
  needs_review: boolean;
}

export interface CreativeReportRow extends AdsReportBase {
  id: string;
  code: string;
  title: string;
  format: string | null;
  status: string;
  ads: number;
}

const div = (a: number, b: number, digits = 2): number | null =>
  b > 0 ? Math.round((a / b) * 10 ** digits) / 10 ** digits : null;

export interface AdRatios {
  cpm: number | null;
  frequency: number | null;
  hook_rate: number | null;
  retention: number | null;
  ctr: number | null;
  cost_per_contact: number | null;
  cpl: number | null;
  cost_per_win: number | null;
  roas: number | null;
}

/** The doc's metrics table: delivery → attention → click → contact → Rev. Percentages in %. */
export function adRatios(r: AdsReportBase): AdRatios {
  const contacts = r.platform_leads + r.conversations;
  return {
    cpm: div(r.spend * 1000, r.impressions),
    frequency: div(r.impressions, r.reach),
    hook_rate: div(r.video_3s * 100, r.impressions, 1),
    retention: div(r.thruplays * 100, r.video_3s, 1),
    ctr: div(r.clicks * 100, r.impressions, 2),
    cost_per_contact: div(r.spend, contacts),
    cpl: div(r.spend, r.leads),
    cost_per_win: div(r.spend, r.wins),
    roas: div(r.revenue, r.spend),
  };
}

export function sumReport<T extends AdsReportBase>(rows: T[]): AdsReportBase {
  const keys: (keyof AdsReportBase)[] = ["spend", "impressions", "reach", "clicks", "video_3s", "thruplays", "platform_leads", "conversations", "leads", "deals", "wins", "revenue"];
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as unknown as AdsReportBase;
  for (const r of rows) for (const k of keys) out[k] += Number(r[k]) || 0;
  out.spend = Math.round(out.spend * 100) / 100;
  out.revenue = Math.round(out.revenue * 100) / 100;
  return out;
}

/** Frequency above ~3: the audience is tired (doc). */
export const FATIGUE_FREQUENCY = 3;

// ---------------------------------------------------------------------------
// Experiments
// ---------------------------------------------------------------------------

export type ExperimentStatus = "idea" | "planned" | "running" | "done" | "discarded";
export const EXPERIMENT_STATUSES: { value: ExperimentStatus; label: string }[] = [
  { value: "idea", label: "Ideia" },
  { value: "planned", label: "Planejado" },
  { value: "running", label: "Rodando" },
  { value: "done", label: "Concluído" },
  { value: "discarded", label: "Descartado" },
];
export const experimentStatusLabel = (s: string) => EXPERIMENT_STATUSES.find((x) => x.value === s)?.label ?? s;

export type ExperimentDecision = "scale" | "iterate" | "kill";
export const EXPERIMENT_DECISIONS: { value: ExperimentDecision; label: string }[] = [
  { value: "scale", label: "Escalar" },
  { value: "iterate", label: "Iterar" },
  { value: "kill", label: "Matar" },
];

export type ExperimentMetric = "leads" | "deals" | "wins" | "revenue" | "cpl" | "cost_per_win" | "roas" | "custom";
export const EXPERIMENT_METRICS: { value: ExperimentMetric; label: string; lowerIsBetter?: boolean; money?: boolean }[] = [
  { value: "leads", label: "Leads" },
  { value: "deals", label: "Negócios" },
  { value: "wins", label: "Ganhos" },
  { value: "revenue", label: "Receita", money: true },
  { value: "cpl", label: "Custo por lead", lowerIsBetter: true, money: true },
  { value: "cost_per_win", label: "Custo por ganho", lowerIsBetter: true, money: true },
  { value: "roas", label: "ROAS" },
  { value: "custom", label: "Outra (manual)" },
];
export const metricInfo = (m: string) => EXPERIMENT_METRICS.find((x) => x.value === m) ?? EXPERIMENT_METRICS[EXPERIMENT_METRICS.length - 1];

export interface ExperimentLive {
  leads: number;
  deals: number;
  wins: number;
  revenue: number;
  spend: number;
}

export interface Experiment {
  id: string;
  title: string;
  hypothesis: string | null;
  channel: OriginCategory | null;
  campaign_id: string | null;
  creative_id: string | null;
  metric: ExperimentMetric;
  baseline: number | null;
  target: number | null;
  result_value: number | null;
  starts_on: string | null;
  ends_on: string | null;
  status: ExperimentStatus;
  decision: ExperimentDecision | null;
  learnings: string | null;
  ice_impact: number | null;
  ice_confidence: number | null;
  ice_ease: number | null;
  owner_id: string | null;
  created_at: string;
  live: ExperimentLive | null;
}

export type ExperimentDraft = Omit<Experiment, "id" | "created_at" | "live"> & { id?: string };

export function emptyExperiment(): ExperimentDraft {
  return {
    title: "",
    hypothesis: null,
    channel: null,
    campaign_id: null,
    creative_id: null,
    metric: "leads",
    baseline: null,
    target: null,
    result_value: null,
    starts_on: null,
    ends_on: null,
    status: "idea",
    decision: null,
    learnings: null,
    ice_impact: null,
    ice_confidence: null,
    ice_ease: null,
    owner_id: null,
  };
}

export const clampIce = (n: number | null): number | null =>
  n === null || !Number.isFinite(n) ? null : Math.max(1, Math.min(10, Math.round(n)));

/** I × C × E, 1–1000; null until the three are filled. */
export function iceScore(e: Pick<Experiment, "ice_impact" | "ice_confidence" | "ice_ease">): number | null {
  const [i, c, x] = [e.ice_impact, e.ice_confidence, e.ice_ease];
  return i && c && x ? i * c * x : null;
}

/** The value of the experiment's metric: live from Rev, or the manual result. */
export function experimentValue(e: Pick<Experiment, "metric" | "live" | "result_value">): number | null {
  const l = e.live;
  if (e.metric === "custom" || !l) return e.result_value;
  switch (e.metric) {
    case "leads": return l.leads;
    case "deals": return l.deals;
    case "wins": return l.wins;
    case "revenue": return l.revenue;
    case "cpl": return div(l.spend, l.leads);
    case "cost_per_win": return div(l.spend, l.wins);
    case "roas": return div(l.revenue, l.spend);
    default: return e.result_value;
  }
}

/** Did it reach the target? null without target or value. Respects "lower is better". */
export function experimentHit(e: Pick<Experiment, "metric" | "live" | "result_value" | "target">): boolean | null {
  const v = experimentValue(e);
  if (v === null || e.target === null) return null;
  return metricInfo(e.metric).lowerIsBetter ? v <= e.target : v >= e.target;
}

export function experimentToDraft(e: Experiment): ExperimentDraft {
  const { live: _live, created_at: _c, ...rest } = e;
  return rest;
}
