import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import { useEntitlements } from "@/hooks/useEntitlements";
import { toast } from "sonner";

interface PageRouteGuardProps {
  permissionKey: string;
  children: React.ReactNode;
}

/**
 * Sprint 8 T12 — access now follows what the tenant BOUGHT.
 *
 * This used to read `equipe.page_permissions` directly: a JSONB somebody had to
 * remember to toggle after a sale, which drifts from reality the moment a plan
 * changes. It now asks useEntitlements, which derives access from contract_items
 * and treats page_permissions as a super-admin override only.
 */
export const PageRouteGuard = ({ permissionKey, children }: PageRouteGuardProps) => {
  const { loading } = useAuth();
  const { isSuperAdmin } = useRole();
  const { canAccess, isLoading: entLoading } = useEntitlements();

  if (loading || entLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando permissões...</p>
        </div>
      </div>
    );
  }

  // Super Admins bypass team-level restrictions to allow debugging/management
  if (isSuperAdmin()) {
    return <>{children}</>;
  }

  if (!canAccess(permissionKey)) {
    toast.error("Esta funcionalidade não está ativa para sua empresa.");
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
};
