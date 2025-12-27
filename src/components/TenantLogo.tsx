import { useTenant } from '@/contexts/TenantContext';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import soloLogoLight from '@/assets/solo-ventures-logo-light.png';
import soloLogoDark from '@/assets/solo-ventures-logo.png';

interface TenantLogoProps {
  className?: string;
  showName?: boolean;
}

export function TenantLogo({ className, showName = false }: TenantLogoProps) {
  const { tenant } = useTenant();
  const { resolvedTheme } = useTheme();
  
  // Use Solo Ventures logo for all tenants - light version for dark mode
  const logoSrc = resolvedTheme === 'dark' ? soloLogoLight : soloLogoDark;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <img
        src={logoSrc}
        alt="Solo Ventures Logo"
        className="h-8 w-auto object-contain"
      />
      {showName && (
        <span className="text-lg font-semibold text-foreground">
          {tenant.name}
        </span>
      )}
    </div>
  );
}