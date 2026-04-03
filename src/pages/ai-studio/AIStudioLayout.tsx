import { NavLink, Outlet, useLocation, Navigate } from "react-router-dom";
import { BarChart2, BookOpen, Zap, Radio, Settings2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  {
    to: "/ai-studio/usage",
    label: "Uso & Dados",
    icon: BarChart2,
    description: "Consumo e modelos",
  },
  {
    to: "/ai-studio/knowledge",
    label: "Knowledge Base",
    icon: BookOpen,
    description: "Perfil, empresa e treinos",
  },
  {
    to: "/ai-studio/skills",
    label: "Skills",
    icon: Zap,
    description: "Intenções e webhooks",
  },
  {
    to: "/ai-studio/channels",
    label: "Canais",
    icon: Radio,
    description: "Integrações ativas",
  },
  {
    to: "/ai-studio/settings",
    label: "Configurações",
    icon: Settings2,
    description: "Parâmetros da API",
  },
] as const;

export default function AIStudioLayout() {
  const location = useLocation();

  // Redirect /ai-studio to /ai-studio/usage
  if (location.pathname === "/ai-studio" || location.pathname === "/ai-studio/") {
    return <Navigate to="/ai-studio/usage" replace />;
  }

  const activeItem = NAV_ITEMS.find((item) =>
    location.pathname.startsWith(item.to)
  );

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden bg-[hsl(var(--background))]">
      {/* Sidebar */}
      <aside className="w-[220px] shrink-0 border-r border-border flex flex-col bg-card">
        {/* Header */}
        <div className="px-5 py-5 border-b border-border">
          <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-muted-foreground mb-0.5">
            Sistema
          </div>
          <h2 className="text-base font-bold text-foreground tracking-tight">
            AI Studio
          </h2>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV_ITEMS.map(({ to, label, icon: Icon, description }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "group flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all",
                  isActive
                    ? "bg-primary/8 text-primary font-semibold border border-primary/15"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground border border-transparent"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      "w-4 h-4 shrink-0 transition-colors",
                      isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                    )}
                  />
                  <span className="flex-1 truncate">{label}</span>
                  {isActive && (
                    <ChevronRight className="w-3.5 h-3.5 text-primary/60 shrink-0" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer badge */}
        <div className="px-4 py-4 border-t border-border">
          <div className="text-[10px] font-mono text-muted-foreground/70 leading-relaxed">
            <span className="block font-semibold text-muted-foreground">
              {activeItem?.label ?? "AI Studio"}
            </span>
            <span>{activeItem?.description}</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
