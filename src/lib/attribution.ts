// Sprint 11 · Onda 5 · T48 — the pure parts of attribution (where a lead came from).
//
// A touch is one arrival: through which entry, with which category (the 12 MECE
// origins of Sprint 4), platform, campaign, UTMs and click IDs. The database
// decides (crm_record_touch); these are the twins the screens use to name things
// and to preview what a payload would become. Keep them in lockstep with
// _crm_platforms / _crm_platform_from / _crm_category_from.

import type { OriginCategory } from "@/types/crm";

export type Platform =
  | "meta"
  | "google"
  | "tiktok"
  | "linkedin"
  | "youtube"
  | "kwai"
  | "pinterest"
  | "email"
  | "whatsapp"
  | "site"
  | "outra";

export const PLATFORMS: { value: Platform; label: string }[] = [
  { value: "meta", label: "Meta (Facebook/Instagram)" },
  { value: "google", label: "Google" },
  { value: "tiktok", label: "TikTok" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "youtube", label: "YouTube" },
  { value: "kwai", label: "Kwai" },
  { value: "pinterest", label: "Pinterest" },
  { value: "email", label: "E-mail" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "site", label: "Site" },
  { value: "outra", label: "Outra" },
];

export const platformLabel = (p: string | null | undefined): string | null =>
  p ? PLATFORMS.find((x) => x.value === p)?.label ?? p : null;

export const isPlatform = (v: unknown): v is Platform => PLATFORMS.some((p) => p.value === v);

export interface TouchFields {
  utm_source?: string | null;
  utm_medium?: string | null;
  fbclid?: string | null;
  gclid?: string | null;
  ctwa_clid?: string | null;
}

const META = new Set(["facebook", "fb", "ig", "instagram", "meta", "facebook_ads", "facebookads", "instagram_ads",
  "fb_ads", "meta_ads", "an", "msg", "messenger", "audience_network"]);
const GOOGLE = new Set(["google", "adwords", "google_ads", "googleads", "gads", "google_cpc"]);
const EMAIL = new Set(["email", "e-mail", "newsletter", "mail", "mailchimp", "rdstation", "rd_station"]);

/** Twin of _crm_platform_from: click ID → utm_source → the entry's. */
export function platformFrom(f: TouchFields, entryPlatform: Platform | null = null): Platform | null {
  if (f.fbclid || f.ctwa_clid) return "meta";
  if (f.gclid) return "google";
  const s = (f.utm_source ?? "").trim().toLowerCase();
  if (!s) return entryPlatform;
  if (META.has(s)) return "meta";
  if (GOOGLE.has(s)) return "google";
  if (s.startsWith("tiktok")) return "tiktok";
  if (["linkedin", "li", "linkedin_ads"].includes(s)) return "linkedin";
  if (["youtube", "yt"].includes(s)) return "youtube";
  if (s.startsWith("kwai")) return "kwai";
  if (s.startsWith("pinterest")) return "pinterest";
  if (EMAIL.has(s)) return "email";
  if (["whatsapp", "wa", "wpp"].includes(s)) return "whatsapp";
  return entryPlatform ?? "outra";
}

const PAID_MEDIA = new Set(["cpc", "ppc", "cpm", "cpv", "paid", "paid_social", "paid_search", "paidsocial", "social_paid",
  "ads", "ad", "sem", "display"]);

/**
 * Twin of _crm_category_from: what the payload proves (a paid click) → the
 * entry's → an organic medium. `fbclid` proves nothing: Facebook adds it to every
 * outbound link, organic posts included.
 */
export function categoryFrom(
  f: TouchFields,
  platform: Platform | null,
  entryCategory: OriginCategory | null = null,
): OriginCategory | null {
  const m = (f.utm_medium ?? "").trim().toLowerCase();
  if (f.gclid || f.ctwa_clid || PAID_MEDIA.has(m)) {
    if (["paid_social", "paidsocial", "social_paid"].includes(m)) return "paid_social";
    if (["paid_search", "sem"].includes(m)) return "paid_search";
    if (platform === "google") return "paid_search";
    if (platform && ["meta", "tiktok", "linkedin", "youtube", "kwai", "pinterest"].includes(platform)) return "paid_social";
    return entryCategory ?? "paid_social";
  }
  if (entryCategory) return entryCategory;
  if (["organic", "social", "organic_social", "social_organic"].includes(m)) {
    return platform === "google" ? "organic_search" : "organic_social";
  }
  if (["referral", "indicacao"].includes(m)) return "referral";
  return null;
}
