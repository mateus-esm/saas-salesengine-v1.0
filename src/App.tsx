import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { TenantProvider } from "@/contexts/TenantContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AuthenticatedLayout } from "@/components/AuthenticatedLayout";
import { PageRouteGuard } from "@/components/PageRouteGuard";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Chat from "./pages/Chat";
import CRM from "./pages/CRM";
import PipelineSettings from "./pages/PipelineSettings";
import Webhooks from "./pages/Webhooks";
import Suporte from "./pages/Suporte";
import Dashboard from "./pages/Dashboard";
import Billing from "./pages/Billing";
import Tutorial from "./pages/Tutorial";
import NotFound from "./pages/NotFound";
import Admin from "./pages/Admin";
import AIStudioLayout from "./pages/ai-studio/AIStudioLayout";
import UsagePage from "./pages/ai-studio/UsagePage";
import KnowledgePage from "./pages/ai-studio/KnowledgePage";
import SkillsPage from "./pages/ai-studio/SkillsPage";
import ChannelsPage from "./pages/ai-studio/ChannelsPage";
import SettingsPage from "./pages/ai-studio/SettingsPage";
import { ToolkitPage, ClubePage } from "./pages/ComingSoon";

// Sprint 5.2 T12 — keep query data hot between screen switches so navigating
// (e.g. CRM -> Chat) is a layout swap, not a refetch-and-flash.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000, // 1 min: data stays fresh across navigations
      gcTime: 5 * 60_000, // keep unmounted query cache warm for 5 min
      refetchOnWindowFocus: false,
    },
  },
});

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
                {/* Public */}
                <Route path="/" element={<Navigate to="/login" replace />} />
                <Route path="/login" element={<Login />} />

                {/* Authenticated shell — mounted once; children swap via <Outlet/> */}
                <Route
                  element={
                    <ProtectedRoute>
                      <AuthenticatedLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/home" element={<Home />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/chat" element={<Chat />} />
                  <Route path="/crm" element={<CRM />} />
                  {/* Tasks live inside CRM now; keep this redirect for old links/bookmarks. */}
                  <Route path="/tasks" element={<Navigate to="/crm?tab=tasks" replace />} />
                  <Route path="/pipeline" element={<PipelineSettings />} />
                  <Route path="/webhooks" element={
                    <PageRouteGuard permissionKey="webhooks">
                      <Webhooks />
                    </PageRouteGuard>
                  } />
                  <Route path="/ai-studio" element={
                    <PageRouteGuard permissionKey="ai_studio">
                      <AIStudioLayout />
                    </PageRouteGuard>
                  }>
                    <Route path="usage" element={<UsagePage />} />
                    <Route path="knowledge" element={<KnowledgePage />} />
                    <Route path="skills" element={<SkillsPage />} />
                    <Route path="channels" element={<ChannelsPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                  </Route>
                  <Route path="/billing" element={
                    <PageRouteGuard permissionKey="billing">
                      <Billing />
                    </PageRouteGuard>
                  } />
                  <Route path="/suporte" element={
                    <PageRouteGuard permissionKey="suporte">
                      <Suporte />
                    </PageRouteGuard>
                  } />
                  <Route path="/tutorial" element={<Tutorial />} />
                  {/* ADD ALL CUSTOM AUTHENTICATED ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="/admin" element={<Admin />} />
                  <Route path="/toolkit" element={
                    <PageRouteGuard permissionKey="toolkit">
                      <ToolkitPage />
                    </PageRouteGuard>
                  } />
                  <Route path="/clube" element={
                    <PageRouteGuard permissionKey="clube">
                      <ClubePage />
                    </PageRouteGuard>
                  } />
                </Route>

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
