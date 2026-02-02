import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { TenantProvider, useTenant } from "@/contexts/TenantContext";
import { useTenantTheme } from "@/hooks/useTenantTheme";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { TopNavbar } from "@/components/TopNavbar";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Chat from "./pages/Chat";
import CRM from "./pages/CRM";
import Webhooks from "./pages/Webhooks";
import Suporte from "./pages/Suporte";
import Dashboard from "./pages/Dashboard";
import Billing from "./pages/Billing";
import Tutorial from "./pages/Tutorial";
import NotFound from "./pages/NotFound";
import Admin from "./pages/Admin";
import Agent from "./pages/Agent";
import { ToolkitPage, ClubePage } from "./pages/ComingSoon";
import { WhatsAppButton } from "./components/WhatsAppButton";

const queryClient = new QueryClient();

const AuthenticatedLayout = ({ children }: { children: React.ReactNode }) => {
  const { tenant } = useTenant();
  useTenantTheme();

  return (
    <div className="min-h-screen flex flex-col w-full bg-background">
      <TopNavbar />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TenantProvider>
      <AuthProvider>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Navigate to="/login" replace />} />
                <Route path="/login" element={<Login />} />
                <Route
                  path="/home"
                  element={
                    <ProtectedRoute>
                      <AuthenticatedLayout>
                        <Home />
                      </AuthenticatedLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <AuthenticatedLayout>
                        <Dashboard />
                      </AuthenticatedLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/chat"
                  element={
                    <ProtectedRoute>
                      <AuthenticatedLayout>
                        <Chat />
                      </AuthenticatedLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/crm"
                  element={
                    <ProtectedRoute>
                      <AuthenticatedLayout>
                        <CRM />
                      </AuthenticatedLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/webhooks"
                  element={
                    <ProtectedRoute>
                      <AuthenticatedLayout>
                        <Webhooks />
                      </AuthenticatedLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/agent"
                  element={
                    <ProtectedRoute>
                      <AuthenticatedLayout>
                        <Agent />
                      </AuthenticatedLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/billing"
                  element={
                    <ProtectedRoute>
                      <AuthenticatedLayout>
                        <Billing />
                      </AuthenticatedLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/suporte"
                  element={
                    <ProtectedRoute>
                      <AuthenticatedLayout>
                        <Suporte />
                      </AuthenticatedLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tutorial"
                  element={
                    <ProtectedRoute>
                      <AuthenticatedLayout>
                        <Tutorial />
                      </AuthenticatedLayout>
                    </ProtectedRoute>
                  }
                />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute>
                      <AuthenticatedLayout>
                        <Admin />
                      </AuthenticatedLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/toolkit"
                  element={
                    <ProtectedRoute>
                      <AuthenticatedLayout>
                        <ToolkitPage />
                      </AuthenticatedLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/clube"
                  element={
                    <ProtectedRoute>
                      <AuthenticatedLayout>
                        <ClubePage />
                      </AuthenticatedLayout>
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </ThemeProvider>
      </AuthProvider>
    </TenantProvider>
  </QueryClientProvider>
);

export default App;
