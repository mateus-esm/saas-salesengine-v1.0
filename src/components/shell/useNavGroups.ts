import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import { useCustomTables } from "@/hooks/useCustomTables";
import { buildNav, isNavItemActive, type NavGroup } from "@/lib/navigation";
import { TOP_TABS } from "@/lib/crmTabs";

/** Monta o menu a partir das mesmas fontes que a barra antiga usava. */
export function useNavGroups(): NavGroup[] {
  const { profile, equipe } = useAuth();
  const { hasRole, isSuperAdmin } = useRole();
  const { tables } = useCustomTables();

  const chatHref = profile?.chat_link_base || "/chat";
  const permissions = (equipe?.page_permissions ?? null) as Record<string, boolean> | null;
  const superAdmin = isSuperAdmin();
  const customTables = useMemo(
    () => (tables ?? []).map((t) => ({ slug: t.slug, name: t.name })),
    [tables],
  );

  return useMemo(
    () =>
      buildNav({
        hasRole,
        isSuperAdmin: superAdmin,
        permissions,
        chatHref,
        crmTabs: [...TOP_TABS],
        customTables,
      }),
    [superAdmin, permissions, chatHref, customTables, hasRole],
  );
}

/** Trilha "grupo › item" do local atual, a partir do mesmo modelo do menu. */
export function breadcrumbFor(groups: NavGroup[], loc: { pathname: string; search: string }): string[] {
  for (const g of groups) {
    for (const item of g.items) {
      if (!isNavItemActive(item, loc)) continue;
      const trail = g.label ? [g.label, item.title] : [item.title];
      const child = item.children?.find((c) => isNavItemActive(c, loc));
      return child ? [...trail, child.title] : trail;
    }
  }
  return [];
}
