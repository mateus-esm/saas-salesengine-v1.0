import { useTenant } from '@/contexts/TenantContext';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

interface TenantLogoProps {
  className?: string;
  showName?: boolean;
}

export function TenantLogo({ className, showName = false }: TenantLogoProps) {
  const { tenant } = useTenant();
  const { resolvedTheme } = useTheme();
  
  const logoSrc = resolvedTheme === 'dark' ? tenant.logoLight : tenant.logo;
  
  // Fallback to text if logo not found
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.style.display = 'none';
    const textFallback = e.currentTarget.nextElementSibling;
    if (textFallback) {
      (textFallback as HTMLElement).style.display = 'flex';
    }
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <img
        src={logoSrc}
        alt={`${tenant.name} Logo`}
        className="h-8 w-auto object-contain"
        onError={handleImageError}
      />
      <span 
        className="hidden items-center text-xl font-bold text-foreground"
        style={{ display: 'none' }}
      >
        {tenant.name}
      </span>
      {showName && (
        <span className="text-lg font-semibold text-foreground">
          {tenant.name}
        </span>
      )}
    </div>
  );
}
