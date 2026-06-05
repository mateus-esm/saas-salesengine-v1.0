import { Outlet } from "react-router-dom";
import { useTenant } from "@/contexts/TenantContext";
import { useTenantTheme } from "@/hooks/useTenantTheme";
import { TopNavbar } from "@/components/TopNavbar";
import { WhatsAppButton } from "@/components/WhatsAppButton";

/**
 * Sprint 5.2 T12 — persistent authenticated shell (zero-reload architecture).
 *
 * Mounted ONCE as a layout route so the navbar, footer and WhatsApp button never
 * remount on navigation — only <Outlet/> swaps the page. Switching screens
 * becomes an instant layout swap instead of a full-tree reload/flash.
 */
export const AuthenticatedLayout = () => {
  const { tenant } = useTenant();
  useTenantTheme();

  return (
    <div className="min-h-screen flex flex-col w-full bg-background">
      <TopNavbar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </main>
      <footer className="border-t border-border bg-card shrink-0">
        <div className="container mx-auto px-4 py-3 text-center text-sm text-muted-foreground font-medium">
          © 2025 Solo Ventures. Todos os direitos reservados. | {tenant.name} é uma plataforma proprietária.
        </div>
      </footer>
      <WhatsAppButton />
    </div>
  );
};

export default AuthenticatedLayout;
