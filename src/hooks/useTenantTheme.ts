import { useEffect } from 'react';
import { useTenant } from '@/contexts/TenantContext';

export function useTenantTheme() {
  const { tenant } = useTenant();

  useEffect(() => {
    const root = document.documentElement;
    
    // Override primary color with tenant color
    root.style.setProperty('--primary', tenant.primaryColor);
    
    // Calculate lighter/darker variants for hover states
    const [h, s, l] = tenant.primaryColor.split(' ').map(v => parseFloat(v));
    
    // Primary foreground (white or black based on lightness)
    const foreground = l > 50 ? '0 0% 0%' : '0 0% 100%';
    root.style.setProperty('--primary-foreground', foreground);
    
    // Accent color (slightly lighter version of primary)
    root.style.setProperty('--accent', `${h} ${s}% ${Math.min(l + 10, 95)}%`);
    
    return () => {
      // Cleanup - restore defaults when component unmounts
      root.style.removeProperty('--primary');
      root.style.removeProperty('--primary-foreground');
      root.style.removeProperty('--accent');
    };
  }, [tenant]);

  return tenant;
}
