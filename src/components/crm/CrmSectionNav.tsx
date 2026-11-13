import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCustomTables } from "@/hooks/useCustomTables";
import { TAB_ICONS, TAB_LABELS, TOP_TABS, isTopTab, type TopTab } from "@/lib/crmTabs";
import { cn } from "@/lib/utils";

const BASE =
  "relative inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";
const idle = "border-transparent text-muted-foreground hover:text-foreground";
const on = "border-primary font-medium text-foreground";

/** Navegação própria do CRM: funciona com a barra lateral escondida. */
export function CrmSectionNav() {
  const [params] = useSearchParams();
  const raw = params.get("tab");
  const active: TopTab = isTopTab(raw) ? raw : "pipeline";
  const { tables } = useCustomTables();

  return (
    <nav aria-label="Seções do CRM" className="border-b border-border bg-card px-2 sm:px-4">
      <ul className="flex items-center overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TOP_TABS.map((tab) => {
          const Icon = TAB_ICONS[tab];
          const isActive = tab === active;
          if (tab === "tabelas") {
            return (
              <li key={tab} className="shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-current={isActive ? "page" : undefined}
                    className={cn(BASE, isActive ? on : idle)}
                  >
                    <Icon className="size-4" aria-hidden />
                    {TAB_LABELS[tab]}
                    <ChevronDown className="size-3.5" aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem asChild>
                      <Link to="/crm?tab=tabelas">Todas as tabelas</Link>
                    </DropdownMenuItem>
                    {(tables ?? []).map((t) => (
                      <DropdownMenuItem key={t.slug} asChild>
                        <Link to={`/crm?tab=tabelas&custom_table=${encodeURIComponent(t.slug)}`}>{t.name}</Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          }
          return (
            <li key={tab} className="shrink-0">
              <Link
                to={`/crm?tab=${tab}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(BASE, isActive ? on : idle)}
              >
                <Icon className="size-4" aria-hidden />
                {TAB_LABELS[tab]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
