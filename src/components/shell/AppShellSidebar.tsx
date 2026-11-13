import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight, ExternalLink } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TenantLogo } from "@/components/TenantLogo";
import { isNavItemActive, type NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useNavGroups } from "./useNavGroups";

type Loc = { pathname: string; search: string };

// Item de 36 px; a barra de 2 px na cor do tenant marca o item ativo.
const ITEM_CLASS =
  "relative h-9 text-sm group-data-[collapsible=icon]:!size-9 " +
  "data-[active=true]:before:absolute data-[active=true]:before:inset-y-1.5 data-[active=true]:before:left-0 " +
  "data-[active=true]:before:w-0.5 data-[active=true]:before:rounded-full data-[active=true]:before:bg-primary";

function ItemContent({ item }: { item: NavItem }) {
  return (
    <>
      <item.icon />
      <span>{item.title}</span>
      {item.external && <ExternalLink className="ml-auto !size-3" aria-hidden />}
    </>
  );
}

function ItemLink({ item, active, current }: { item: NavItem; active: boolean; current: boolean }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const close = () => {
    if (isMobile) setOpenMobile(false);
  };
  return (
    <SidebarMenuButton asChild isActive={active} tooltip={item.title} className={ITEM_CLASS}>
      {item.external ? (
        <a href={item.url} target="_blank" rel="noreferrer" onClick={close}>
          <ItemContent item={item} />
        </a>
      ) : (
        <Link to={item.url} aria-current={current ? "page" : undefined} onClick={close}>
          <ItemContent item={item} />
        </Link>
      )}
    </SidebarMenuButton>
  );
}

function NavEntry({ item, loc }: { item: NavItem; loc: Loc }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const active = isNavItemActive(item, loc);
  const childActive = !!item.children?.some((c) => isNavItemActive(c, loc));
  const [open, setOpen] = useState(active);
  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  if (!item.children?.length) {
    return (
      <SidebarMenuItem>
        <ItemLink item={item} active={active} current={active} />
        {item.badge && (
          <SidebarMenuBadge className="right-2 top-2 h-5 bg-muted px-1.5 text-[10px] text-muted-foreground">
            {item.badge}
          </SidebarMenuBadge>
        )}
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <SidebarMenuItem>
        <ItemLink item={item} active={active} current={active && !childActive} />
        <CollapsibleTrigger asChild>
          <SidebarMenuAction className="top-2" aria-label={open ? `Recolher ${item.title}` : `Expandir ${item.title}`}>
            <ChevronRight className={cn("transition-transform", open && "rotate-90")} />
          </SidebarMenuAction>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.children.map((child) => {
              const childIsActive = isNavItemActive(child, loc);
              return (
                <SidebarMenuSubItem key={child.id}>
                  <SidebarMenuSubButton asChild isActive={childIsActive}>
                    <Link
                      to={child.url}
                      aria-current={childIsActive ? "page" : undefined}
                      onClick={() => {
                        if (isMobile) setOpenMobile(false);
                      }}
                    >
                      <child.icon />
                      <span>{child.title}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

export function AppShellSidebar() {
  const loc = useLocation();
  const groups = useNavGroups();

  return (
    <Sidebar collapsible="icon" aria-label="Navegação principal">
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border px-3">
        <Link to="/home" aria-label="Ir para a página inicial" className="flex items-center overflow-hidden">
          <TenantLogo className="h-8 group-data-[collapsible=icon]:hidden" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.id}>
            {group.label && (
              <SidebarGroupLabel className="text-xs text-muted-foreground">{group.label}</SidebarGroupLabel>
            )}
            <SidebarMenu>
              {group.items.map((item) => (
                <NavEntry key={item.id} item={item} loc={loc} />
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="group-data-[collapsible=icon]:hidden">
        <p className="px-2 text-xs text-muted-foreground">
          © {new Date().getFullYear()} Solo Ventures. Todos os direitos reservados.
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
