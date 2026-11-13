import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight, ExternalLink, PanelLeftClose, PanelLeftOpen } from "lucide-react";
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
import { isNavItemActive, type NavGroup, type NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useNavGroups } from "./useNavGroups";
import { readGroupState, saveGroupState, useSidebarMode, type SidebarMode } from "./sidebarPrefs";

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

function NavGroupSection({ group, loc, mode }: { group: NavGroup; loc: Loc; mode: SidebarMode }) {
  const { state, isMobile } = useSidebar();
  // No modo ícones recolhido só os ícones aparecem: o grupo fica aberto à força (sem gravar), senão sumiria.
  const isIcon = !isMobile && mode === "icon" && state === "collapsed";
  const hasActive = group.items.some(
    (i) => isNavItemActive(i, loc) || !!i.children?.some((c) => isNavItemActive(c, loc)),
  );
  const collapsible = !!group.label;
  // O grupo com o item ativo abre sozinho, mesmo que o estado salvo seja "recolhido".
  const [open, setOpen] = useState(() => !collapsible || hasActive || readGroupState()[group.id] !== false);
  useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);

  const menu = (
    <SidebarMenu>
      {group.items.map((item) => (
        <NavEntry key={item.id} item={item} loc={loc} />
      ))}
    </SidebarMenu>
  );

  if (!collapsible) return <SidebarGroup>{menu}</SidebarGroup>;

  return (
    <SidebarGroup>
      <Collapsible
        open={open || isIcon}
        onOpenChange={(v) => {
          setOpen(v);
          saveGroupState(group.id, v);
        }}
      >
        <SidebarGroupLabel asChild className="text-xs text-muted-foreground">
          <CollapsibleTrigger aria-expanded={open} className="w-full cursor-pointer justify-between">
            <span>{group.label}</span>
            <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} aria-hidden />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>{menu}</CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  );
}

function ModeButton({ mode, onToggle }: { mode: SidebarMode; onToggle: () => void }) {
  const { isMobile } = useSidebar();
  if (isMobile) return null;
  const Icon = mode === "icon" ? PanelLeftOpen : PanelLeftClose;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={mode === "icon"}
      className="flex h-8 items-center gap-2 rounded-md px-2 text-xs text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center"
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="group-data-[collapsible=icon]:hidden">
        {mode === "icon" ? "Desativar modo ícones" : "Ativar modo ícones"}
      </span>
    </button>
  );
}

export function AppShellSidebar() {
  const loc = useLocation();
  const groups = useNavGroups();
  const { isMobile } = useSidebar();
  const [mode, setMode] = useSidebarMode();

  return (
    <Sidebar collapsible={isMobile ? "offcanvas" : mode} aria-label="Navegação principal">
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border px-3">
        <Link to="/home" aria-label="Ir para a página inicial" className="flex items-center overflow-hidden">
          <TenantLogo className="h-8 group-data-[collapsible=icon]:hidden" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <NavGroupSection key={group.id} group={group} loc={loc} mode={mode} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <ModeButton mode={mode} onToggle={() => setMode(mode === "icon" ? "offcanvas" : "icon")} />
        <p className="px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          © {new Date().getFullYear()} Solo Ventures. Todos os direitos reservados.
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
