import { Outlet } from "react-router-dom";
import { useTenantTheme } from "@/hooks/useTenantTheme";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppShellSidebar } from "@/components/shell/AppShellSidebar";
import { AppHeader } from "@/components/shell/AppHeader";
import { WhatsAppButton } from "@/components/WhatsAppButton";

/**
 * Sprint 5.2 T12 — persistent authenticated shell (zero-reload architecture).
 * Sprint 15 T5 — barra lateral no lugar da barra superior e do rodapé.
 *
 * Mounted ONCE as a layout route so the sidebar, header and WhatsApp button never
 * remount on navigation — only <Outlet/> swaps the page.
 *
 * Sprint 15 T7 — a casca tem a altura da tela: a página rola dentro do <main>,
 * não na janela. Assim uma tela com `h-full` (a grade do CRM) tem altura de
 * verdade, e o cabeçalho e o rodapé da grade ficam presos.
 */
export const AuthenticatedLayout = () => {
  useTenantTheme();

  return (
    <SidebarProvider>
      <AppShellSidebar />
      <SidebarInset className="h-svh min-h-0 min-w-0 bg-background">
        <AppHeader />
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <Outlet />
        </main>
      </SidebarInset>
      <WhatsAppButton />
    </SidebarProvider>
  );
};

export default AuthenticatedLayout;
