import { NavLink, Outlet, useLocation, Navigate } from "react-router-dom";
import { LayoutDashboard, Receipt, Zap, FileText, Building2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ContractStatusBanner } from "@/components/billing/ContractStatusBanner";

/**
 * Sprint 8 T13 — Billing shell.
 *
 * Billing.tsx had grown to 835 lines mixing credits, plans, PIX and WhatsApp
 * instances into one screen, and now had to also carry invoices, the contract
 * and billing details. Split into sub-routes on the same pattern as /ai-studio.
 *
 * The page answers four questions without the user hunting for them:
 * what I have · what I used · what I owe · what happens if I don't pay.
 */
const NAV_ITEMS = [
  { to: "/billing", label: "Visão geral", icon: LayoutDashboard, description: "Plano, créditos e faturas", end: true },
  { to: "/billing/faturas", label: "Faturas", icon: Receipt, description: "Histórico e pagamento", end: false },
  { to: "/billing/creditos", label: "Créditos", icon: Zap, description: "Saldo e recarga", end: false },
  { to: "/billing/plano", label: "Plano", icon: FileText, description: "Tiers e adicionais", end: false },
  { to: "/billing/dados", label: "Dados de cobrança", icon: Building2, description: "CPF/CNPJ e endereço", end: false },
] as const;

export default function BillingLayout() {
  const location = useLocation();
  const activeItem = [...NAV_ITEMS]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => location.pathname.startsWith(item.to));

  if (location.pathname === "/billing/") {
    return <Navigate to="/billing" replace />;
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden bg-[hsl(var(--background))]">
      <aside className="w-[220px] shrink-0 border-r border-border flex-col bg-card hidden md:flex">
        <div className="px-5 py-5 border-b border-border">
          <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-muted-foreground mb-0.5">
            Conta
          </div>
          <h2 className="text-base font-bold text-foreground tracking-tight">Faturamento</h2>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV_ITEMS.map(({ to, label, icon: Icon, description, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "group flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all",
                  isActive
                    ? "bg-primary/8 text-primary font-semibold border border-primary/15"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground border border-transparent",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      "w-4 h-4 shrink-0 transition-colors",
                      isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                    )}
                  />
                  <span className="flex-1 truncate">{label}</span>
                  {isActive && <ChevronRight className="w-3.5 h-3.5 text-primary/60 shrink-0" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-border">
          <div className="text-[10px] font-mono text-muted-foreground/70 leading-relaxed">
            <span className="block font-semibold text-muted-foreground">
              {activeItem?.label ?? "Faturamento"}
            </span>
            <span>{activeItem?.description}</span>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {/* Account state is shown on every billing screen, not just the overview:
            somebody who lands directly on Faturas still needs to know they are
            days away from read-only. */}
        <div className="px-6 pt-6">
          <ContractStatusBanner />
        </div>

        {/* Mobile nav — the sidebar is hidden below md */}
        <div className="md:hidden px-6 pt-4 flex gap-2 overflow-x-auto pb-2">
          {NAV_ITEMS.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "px-3 py-1.5 rounded-full text-xs whitespace-nowrap border transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary border-primary/20 font-semibold"
                    : "text-muted-foreground border-border hover:bg-muted",
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </div>

        <Outlet />
      </main>
    </div>
  );
}
