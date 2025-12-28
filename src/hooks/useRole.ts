import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type UserRole = 'user' | 'admin' | 'owner' | 'super_admin';

// Role hierarchy (higher number = more permissions)
const ROLE_HIERARCHY: Record<UserRole, number> = {
    user: 1,
    admin: 2,
    owner: 3,
    super_admin: 4,
};

export function useRole() {
    const { user } = useAuth();

    // Fetch role from user_roles table
    const { data: roleData } = useQuery({
        queryKey: ['user_role', user?.id],
        queryFn: async () => {
            if (!user?.id) return null;
            
            const { data, error } = await supabase
                .from('user_roles')
                .select('role')
                .eq('user_id', user.id)
                .order('role')
                .limit(1)
                .maybeSingle();
            
            if (error) {
                console.error('Error fetching user role:', error);
                return null;
            }
            
            return data?.role as UserRole | null;
        },
        enabled: !!user?.id,
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    });

    const currentRole: UserRole = (roleData as UserRole) || 'user';

    const isSuperAdmin = () => currentRole === 'super_admin';
    const isOwner = () => currentRole === 'owner' || isSuperAdmin();
    const isAdmin = () => currentRole === 'admin' || isOwner();
    const isUser = () => true; // Everyone is at least a user

    /**
     * Check if current user has at least the required role level
     */
    const hasRole = (requiredRole: UserRole) => {
        return ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY[requiredRole];
    };

    /**
     * Check if user can access a specific feature
     */
    const canAccess = (feature: string): boolean => {
        const featurePermissions: Record<string, UserRole> = {
            dashboard: 'user',
            crm: 'user',
            chat: 'user',
            billing: 'owner',
            webhooks: 'admin',
            admin: 'super_admin',
            toolkit: 'user', // Will show "Coming Soon"
            clube: 'user',   // Will show "Coming Soon"
        };

        const requiredRole = featurePermissions[feature] || 'user';
        return hasRole(requiredRole);
    };

    return {
        role: currentRole,
        isSuperAdmin,
        isOwner,
        isAdmin,
        isUser,
        hasRole,
        canAccess,
    };
}
