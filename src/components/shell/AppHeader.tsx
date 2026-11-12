import { useLocation } from "react-router-dom";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ModeToggle } from "@/components/ModeToggle";
import { UserMenu } from "@/components/UserMenu";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { CreditBalanceBadge } from "@/components/crm/copilot/CreditBalanceBadge";
import { breadcrumbFor, useNavGroups } from "./useNavGroups";

export function AppHeader() {
  const { pathname, search } = useLocation();
  const groups = useNavGroups();
  const trail = breadcrumbFor(groups, { pathname, search });

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3 sm:px-4">
      <SidebarTrigger aria-label="Abrir ou recolher o menu" />
      <Separator orientation="vertical" className="mx-1 h-5" />
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="flex-nowrap">
          {trail.map((label, i) => (
            <BreadcrumbItem key={`${label}-${i}`} className="min-w-0">
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbPage
                className={
                  i === trail.length - 1 ? "truncate text-sm font-medium" : "truncate text-sm text-muted-foreground"
                }
              >
                {label}
              </BreadcrumbPage>
            </BreadcrumbItem>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex items-center gap-2">
        <CreditBalanceBadge className="hidden sm:inline-flex" />
        <NotificationBell />
        <ModeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
