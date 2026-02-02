import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AppHubCardProps {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  external?: boolean;
  badge?: string;
  disabled?: boolean;
}

export function AppHubCard({
  title,
  description,
  icon: Icon,
  href,
  external = false,
  badge,
  disabled = false,
}: AppHubCardProps) {
  const cardContent = (
    <div
      className={cn(
        "group relative flex flex-col p-6 h-full rounded-lg border border-border bg-card transition-all duration-200",
        !disabled && "card-hover-solo cursor-pointer hover:shadow-sm",
        disabled && "opacity-60 cursor-not-allowed"
      )}
    >
      {/* Icon */}
      <div className="mb-4">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-solo-orange/10 to-solo-yellow/10 flex items-center justify-center group-hover:from-solo-orange/20 group-hover:to-solo-yellow/20 transition-colors">
          <Icon className="h-6 w-6 text-solo-orange" />
        </div>
      </div>

      {/* Title */}
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        {external && (
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        {badge && (
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0 h-4"
          >
            {badge}
          </Badge>
        )}
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground leading-relaxed flex-1">
        {description}
      </p>

      {/* Hover indicator line */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-solo-orange to-solo-yellow opacity-0 group-hover:opacity-100 transition-opacity rounded-b-lg" />
    </div>
  );

  if (disabled) {
    return cardContent;
  }

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block h-full">
        {cardContent}
      </a>
    );
  }

  return (
    <Link to={href} className="block h-full">
      {cardContent}
    </Link>
  );
}
