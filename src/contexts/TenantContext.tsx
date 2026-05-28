import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TenantConfig, CustomFieldDefinition, getTenantByHostname } from '@/config/tenants';

interface TenantContextType {
  tenant: TenantConfig;
  isLoading: boolean;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

function resolveFromHostname(): TenantConfig {
  return getTenantByHostname(window.location.hostname);
}

function applyTenantCSS(tenant: TenantConfig) {
  const root = document.documentElement;
  root.style.setProperty('--tenant-primary', tenant.primaryColor);
  document.title = `${tenant.name} - Portal`;
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', tenant.description);
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  // Start synchronously with static config so first render is instant
  const [tenant, setTenant] = useState<TenantConfig>(resolveFromHostname);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    applyTenantCSS(tenant);
  }, [tenant]);

  useEffect(() => {
    // Try to load the niche registry from DB (allows dynamic tenant creation without redeployment)
    const hostname = window.location.hostname.split(':')[0];

    const loadTenant = async () => {
      const { data, error } = await supabase
        .from('niches' as any)
        .select('id, nome, domain, description, primary_color, custom_fields')
        .eq('active', true);

        if (error || !data || data.length === 0) return;

        // Find match: exact domain or subdomain slug included in hostname
        const matched = (data as any[]).find(
          (n) => n.domain === hostname || (n.id !== 'default' && hostname.includes(n.id))
        );

        if (matched) {
          const dynamic: TenantConfig = {
            id: matched.id,
            name: matched.nome,
            nicho: matched.id,
            domain: matched.domain,
            logo: '/solo-ventures-icon-512.png',
            logoLight: '/solo-ventures-icon-512.png',
            primaryColor: matched.primary_color || '28 100% 50%',
            description: matched.description || '',
            customFields: (matched.custom_fields as CustomFieldDefinition[]) || [],
          };
          setTenant(dynamic);
        }
    };

    loadTenant().finally(() => setIsLoading(false));
  }, []);

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
