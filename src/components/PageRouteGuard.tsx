import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import { toast } from "sonner";

interface PageRouteGuardProps {
  permissionKey: string;
  children: React.ReactNode;
}

export const PageRouteGuard = ({ permissionKey, children }: PageRouteGuardProps) => {
  const { equipe, loading } = useAuth();
  const { isSuperAdmin } = useRole();

  if (loading) {
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

  const isAllowed = equipe?.page_permissions?.[permissionKey] ?? true;

  if (!isAllowed) {
    toast.error("Esta funcionalidade não está ativa para sua empresa.");
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
};
