import {
  BarChart3,
  BookOpen,
  Cpu,
  CreditCard,
  HelpCircle,
  MessageCircle,
  MessageSquareText,
  Star,
  Users,
  Webhook,
  Wrench,
  Home,
  Table2,
  type LucideIcon,
} from "lucide-react";
import { TAB_ICONS, TAB_LABELS, TOP_TABS, isTopTab, type TopTab } from "@/lib/crmTabs";

type Role = "user" | "admin" | "owner" | "super_admin";

export interface NavItem {
  id: string;
  title: string;
  url: string;
  icon: LucideIcon;
  external?: boolean;
  badge?: string;
  requiredRole?: Role;
  permissionKey?: string;
  children?: NavItem[];
}

export interface NavGroup {
  id: string;
  label: string | null;
  items: NavItem[];
}

export interface NavContext {
  hasRole: (role: Role) => boolean;
  isSuperAdmin: boolean;
  permissions: Record<string, boolean> | null;
  chatHref: string;
  crmTabs: TopTab[];
  customTables: { slug: string; name: string }[];
}

export function buildNav(ctx: NavContext): NavGroup[] {
  const isExternalChat = ctx.chatHref.startsWith("http");

  const allowed = (item: NavItem): boolean => {
    if (item.requiredRole && !ctx.hasRole(item.requiredRole)) return false;
    if (item.permissionKey && ctx.permissions && !ctx.isSuperAdmin) {
      if (ctx.permissions[item.permissionKey] === false) return false;
    }
    return true;
  };

  const crmItems: NavItem[] = TOP_TABS.filter((t) => ctx.crmTabs.includes(t)).map((tab) => {
    const item: NavItem = {
      id: `crm-${tab}`,
      title: TAB_LABELS[tab],
      url: `/crm?tab=${tab}`,
      icon: TAB_ICONS[tab],
    };
    if (tab === "tabelas" && ctx.customTables.length > 0) {
      item.children = ctx.customTables.map((t) => ({
        id: `crm-table-${t.slug}`,
        title: t.name,
        url: `/crm?tab=tabelas&custom_table=${encodeURIComponent(t.slug)}`,
        icon: Table2,
      }));
    }
    return item;
  });

  const groups: NavGroup[] = [
    {
      id: "main",
      label: null,
      items: [
        { id: "home", title: "Início", url: "/home", icon: Home },
        { id: "dashboard", title: "Dashboard", url: "/dashboard", icon: BarChart3 },
        {
          id: "chat",
          title: "Chat",
          url: ctx.chatHref || "/chat",
          icon: MessageCircle,
          external: isExternalChat,
        },
      ],
    },
    { id: "crm", label: "CRM", items: crmItems },
    {
      id: "automation",
      label: "Automação",
      items: [
        { id: "ai-studio", title: "AI Studio", url: "/ai-studio", icon: Cpu, requiredRole: "admin", permissionKey: "ai_studio" },
        { id: "outreach", title: "Outreach", url: "/outreach", icon: MessageSquareText, requiredRole: "admin", permissionKey: "webhooks" },
        { id: "webhooks", title: "Webhooks", url: "/webhooks", icon: Webhook, requiredRole: "admin", permissionKey: "webhooks" },
      ],
    },
    {
      id: "account",
      label: "Conta",
      items: [
        { id: "equipe", title: "Equipe", url: "/equipe", icon: Users, requiredRole: "owner" },
        { id: "billing", title: "Billing", url: "/billing", icon: CreditCard, requiredRole: "admin", permissionKey: "billing" },
        { id: "suporte", title: "Suporte", url: "/suporte", icon: HelpCircle, requiredRole: "admin", permissionKey: "suporte" },
        { id: "docs", title: "Central de Ajuda", url: "/docs", icon: BookOpen },
      ],
    },
    {
      id: "soon",
      label: "Em breve",
      items: [
        { id: "toolkit", title: "Toolkit", url: "/toolkit", icon: Wrench, badge: "Em Breve", requiredRole: "admin", permissionKey: "toolkit" },
        { id: "clube", title: "Clube Solo", url: "/clube", icon: Star, badge: "Em Breve", requiredRole: "admin", permissionKey: "clube" },
      ],
    },
  ];

  return groups
    .map((g) => ({ ...g, items: g.items.filter(allowed) }))
    .filter((g) => g.items.length > 0);
}

export function isNavItemActive(
  item: NavItem,
  loc: { pathname: string; search: string },
): boolean {
  if (item.external) return false;
  if (item.children?.some((c) => isNavItemActive(c, loc))) return true;

  const [urlPath, urlQuery = ""] = item.url.split("?");
  const target = new URLSearchParams(urlQuery);
  const current = new URLSearchParams(loc.search);

  if (urlPath === "/crm" && target.has("tab")) {
    if (loc.pathname !== "/crm") return false;
    const rawTab = current.get("tab");
    const tab = isTopTab(rawTab) ? rawTab : "pipeline";
    if (tab !== target.get("tab")) return false;
    const table = target.get("custom_table");
    if (table) return current.get("custom_table") === table;
    return true;
  }

  return loc.pathname === urlPath || loc.pathname.startsWith(`${urlPath}/`);
}
