/**
 * Sprint 9 — the BI area shell.
 *
 * Filters live HERE, not in the child pages, and are passed down through the
 * outlet context. Moving from "Visão geral" to "Time" keeps the period and the
 * pipeline you had chosen, so the numbers on the second screen are the same
 * slice of reality as the first. A per-page filter state silently resets that
 * and makes two screens uncomparable.
 *
 * The tab strip scrolls horizontally on narrow screens. Sprint 8.5 shipped
 * unreachable tabs on mobile once already; the fix is cheap and the regression
 * is not.
 */
import { useMemo, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation, useOutletContext } from "react-router-dom";
import { BarChart3, Filter, Radio, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import {
  DashboardFilterBar,
  periodRange,
  type PeriodPreset,
} from "@/components/dashboard/DashboardFilterBar";
import { useDashboardFilterOptions } from "@/hooks/useDashboardV2";
import type { DashboardFilters } from "@/types/dashboard";

const NAV = [
  { to: "/dashboard/visao-geral", label: "Visão geral", icon: BarChart3 },
  { to: "/dashboard/funil", label: "Funil", icon: Filter },
  { to: "/dashboard/time", label: "Time", icon: Users },
  { to: "/dashboard/canais", label: "Canais", icon: Radio },
  // "Relatórios" is added by T14, together with the page behind it — a nav
  // entry that leads nowhere is worse than a missing one.
] as const;

export interface DashboardContext {
  filters: DashboardFilters;
  preset: PeriodPreset;
}

/** Child pages read the page-wide slice through this. */
export function useDashboardContext() {
  return useOutletContext<DashboardContext>();
}

export default function DashboardLayout() {
  const location = useLocation();
  const { profile, loading } = useAuth();
  const [preset, setPreset] = useState<PeriodPreset>("30d");
  const [extra, setExtra] = useState<Omit<DashboardFilters, "from" | "to">>({});

  const { data: options } = useDashboardFilterOptions();

  // The range is derived from the preset, and `new Date()` is read only when
  // the preset changes — not on every render, which would produce a new
  // react-query key each time and refetch the whole page in a loop.
  const filters = useMemo<DashboardFilters>(() => {
    const { from, to } = periodRange(preset);
    return { from, to, ...extra };
  }, [preset, extra]);

  if (location.pathname === "/dashboard" || location.pathname === "/dashboard/") {
    return <Navigate to="/dashboard/visao-geral" replace />;
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile?.equipe_id) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-sm text-muted-foreground">
          Você ainda não está associado a uma equipe.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <header className="border-b border-border bg-card/60">
        <div className="px-4 pt-4 sm:px-6">
          <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Inteligência comercial
          </div>
          <h1 className="mt-0.5 text-xl font-bold tracking-tight text-foreground">Dashboard</h1>
        </div>

        {/* Scrollable on mobile — Sprint 8.5 shipped unreachable tabs once. */}
        <nav className="mt-3 flex gap-1 overflow-x-auto px-4 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* Reports configure schedules rather than read the current slice, so the
          period filter would only be misleading there. */}
      {!location.pathname.startsWith("/dashboard/relatorios") && (
        <div className="border-b border-border bg-background px-4 py-2.5 sm:px-6">
          <DashboardFilterBar
            preset={preset}
            onPresetChange={setPreset}
            filters={filters}
            onFiltersChange={({ from: _f, to: _t, ...rest }) => setExtra(rest)}
            options={options}
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <Outlet context={{ filters, preset } satisfies DashboardContext} />
      </div>
    </div>
  );
}
