import { useEffect } from 'react';
import { useTenant } from '@/contexts/TenantContext';
import { contrastRatio, pickForeground } from '@/lib/contrast';

export function useTenantTheme() {
  const { tenant } = useTenant();

  useEffect(() => {
    const root = document.documentElement;
    
    // Override primary color with tenant color
    root.style.setProperty('--primary', tenant.primaryColor);
    
    // Calculate lighter/darker variants for hover states
    const [h, s, l] = tenant.primaryColor.split(' ').map(v => parseFloat(v));
    
    // Primary foreground: whichever of white / near-black reads better
    root.style.setProperty('--primary-foreground', pickForeground(tenant.primaryColor));
    
    // Accent color (slightly lighter version of primary)
    root.style.setProperty('--accent', `${h} ${s}% ${Math.min(l + 10, 95)}%`);

    // Focus ring: the tenant color is used only if it shows (>= 3:1) on white
    const ringOverridden = contrastRatio(tenant.primaryColor, '0 0% 100%') < 3;
    if (ringOverridden) {
      root.style.setProperty('--ring', '240 10% 3.9%');
    } else {
      root.style.removeProperty('--ring');
    }
    
    return () => {
      // Cleanup - restore defaults when component unmounts
      root.style.removeProperty('--primary');
      root.style.removeProperty('--primary-foreground');
      root.style.removeProperty('--accent');
      root.style.removeProperty('--ring');
    };
  }, [tenant]);

  return tenant;
}
