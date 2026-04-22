import type { OriginCategory } from "@/types/crm";

// Sprint 4 EPIC 3 §3.3 — MECE origin taxonomy. Keep this list and
// `public.leads.origin_category` check constraint in lockstep; adding a value
// here without the matching migration will fail on insert.

export type OriginGroup = "inbound" | "outbound" | "network" | "system";

export interface OriginOption {
  value: OriginCategory;
  label: string;
  group: OriginGroup;
}

export const ORIGIN_CATEGORY_OPTIONS: OriginOption[] = [
  // Inbound
  { value: "organic_search", label: "Busca Orgânica", group: "inbound" },
  { value: "organic_social", label: "Social Orgânico", group: "inbound" },
  { value: "paid_search", label: "Busca Paga", group: "inbound" },
  { value: "paid_social", label: "Social Pago", group: "inbound" },
  { value: "direct_brand", label: "Direto / Marca", group: "inbound" },
  // Outbound
  { value: "outbound_phone", label: "Cold Call", group: "outbound" },
  { value: "outbound_message", label: "Cold Message", group: "outbound" },
  { value: "outbound_email", label: "Cold Email", group: "outbound" },
  // Network
  { value: "referral", label: "Indicação", group: "network" },
  { value: "partner_channel", label: "Parceiro / Canal", group: "network" },
  { value: "offline_event", label: "Evento Offline", group: "network" },
  // System
  { value: "api_import", label: "Importação / API", group: "system" },
];

export const ORIGIN_GROUP_LABELS: Record<OriginGroup, string> = {
  inbound: "Inbound",
  outbound: "Outbound",
  network: "Rede",
  system: "Sistema",
};

export const ORIGIN_GROUPS: OriginGroup[] = ["inbound", "outbound", "network", "system"];

export const originOptionsByGroup = (group: OriginGroup): OriginOption[] =>
  ORIGIN_CATEGORY_OPTIONS.filter((o) => o.group === group);

export const originLabel = (value: OriginCategory | null | undefined): string => {
  if (!value) return "—";
  return ORIGIN_CATEGORY_OPTIONS.find((o) => o.value === value)?.label ?? value;
};
