import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { TenantConfig, getTenantByHostname, tenants } from '@/config/tenants';

interface TenantContextType {
  tenant: TenantConfig;
  isLoading: boolean;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  
  const tenant = useMemo(() => {
    return getTenantByHostname(window.location.hostname);
  }, []);

  useEffect(() => {
    // Apply tenant-specific CSS variables
    const root = document.documentElement;
    root.style.setProperty('--tenant-primary', tenant.primaryColor);
    
    // Update document title
    document.title = `${tenant.name} - Portal`;
    
    // Update meta description
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', tenant.description);
    }
    
    setIsLoading(false);
  }, [tenant]);

  return (
    <TenantContext.Provider value={{ tenant, isLoading }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}

// Export for use in components that need all tenants
export { tenants };
