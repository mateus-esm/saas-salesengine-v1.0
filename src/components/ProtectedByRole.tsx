import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useRole, UserRole } from '@/hooks/useRole';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedByRoleProps {
    children: ReactNode;
    requiredRole: UserRole;
    fallback?: ReactNode;
    redirectTo?: string;
}

/**
 * Wrapper component that protects content based on user role.
 * Can either redirect or show a fallback for unauthorized users.
 */
export function ProtectedByRole({
    children,
    requiredRole,
    fallback,
    redirectTo,
}: ProtectedByRoleProps) {
    const { hasRole } = useRole();
    const { loading } = useAuth();

    // Show nothing while loading auth state
    if (loading) {
        return null;
    }

    // Check if user has required role
    if (!hasRole(requiredRole)) {
        // Redirect if specified
        if (redirectTo) {
            return <Navigate to={redirectTo} replace />;
        }
        // Otherwise show fallback or nothing
        return <>{fallback}</>;
    }

    return <>{children}</>;
}

/**
 * HOC version for convenience
 */
export function withRoleProtection<P extends object>(
    Component: React.ComponentType<P>,
    requiredRole: UserRole,
    redirectTo?: string
) {
    return function ProtectedComponent(props: P) {
        return (
            <ProtectedByRole requiredRole={requiredRole} redirectTo={redirectTo}>
                <Component {...props} />
            </ProtectedByRole>
        );
    };
}
