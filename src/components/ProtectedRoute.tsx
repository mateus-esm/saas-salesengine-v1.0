import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, equipe } = useAuth();
  const { tenant } = useTenant();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Multi-tenancy check
  if (tenant.id !== 'default') {
    const userNiche = equipe?.niche?.toLowerCase() || '';
    const tenantId = tenant.id.toLowerCase();

    // If user has a niche defined but it doesn't match the current tenant ID
    // We only check if we have the niche info (authorized user should have it)
    if (userNiche && userNiche !== tenantId) {
      // Redirect to login (Access Denied)
      return <Navigate to="/login" replace />;
    }
  }

  return <>{children}</>;
};
