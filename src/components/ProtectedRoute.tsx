import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, equipe, signOut } = useAuth();
  const { tenant } = useTenant();

  useEffect(() => {
    if (!loading && user && tenant.id !== 'default') {
      const userNiche = equipe?.niche?.toLowerCase() || '';
      const tenantId = tenant.id.toLowerCase();

      if (userNiche && userNiche !== tenantId) {
        toast.error(`Acesso negado! Sua conta pertence ao nicho "${equipe?.niche}" le não tem acesso ao portal "${tenant.name}".`);
        signOut();
      }
    }
  }, [user, loading, equipe, tenant, signOut]);

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

  // If there's a mismatch, the useEffect above will trigger sign out.
  // In the meantime, we show a loading state to prevent the children from rendering
  // and to prevent the render-time redirect loop.
  if (tenant.id !== 'default') {
    const userNiche = equipe?.niche?.toLowerCase() || '';
    const tenantId = tenant.id.toLowerCase();
    
    if (userNiche && userNiche !== tenantId) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-destructive mx-auto mb-4"></div>
            <p className="text-destructive font-medium">Verificando permissões de acesso...</p>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
};
