import {
  Building2,
  Calendar,
  Home,
  LayoutGrid,
  ListChecks,
  Megaphone,
  Package,
  Table2,
  Users,
  type LucideIcon,
} from "lucide-react";

// Sprint 11 · T68 — the Copilot left the CRM: it is the app's opening (/home).
export type TopTab = "pipeline" | "contacts" | "companies" | "properties" | "catalogo" | "campanhas" | "tasks" | "tabelas" | "agenda";

export const TOP_TABS: TopTab[] = ["pipeline", "contacts", "companies", "properties", "catalogo", "campanhas", "tasks", "tabelas", "agenda"];

export const isTopTab = (v: string | null): v is TopTab =>
  !!v && TOP_TABS.includes(v as TopTab);

export const TAB_LABELS: Record<TopTab, string> = {
  pipeline: "Pipeline",
  contacts: "Base de Contatos",
  companies: "Empresas",
  properties: "Imóveis",
  catalogo: "Catálogo",
  campanhas: "Campanhas",
  tasks: "Tarefas",
  tabelas: "Tabelas",
  agenda: "Agenda",
};

export const TAB_ICONS: Record<TopTab, LucideIcon> = {
  pipeline: LayoutGrid,
  contacts: Users,
  companies: Building2,
  properties: Home,
  catalogo: Package,
  campanhas: Megaphone,
  tasks: ListChecks,
  tabelas: Table2,
  agenda: Calendar,
};
