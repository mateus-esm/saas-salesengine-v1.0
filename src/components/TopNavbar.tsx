import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Home,
  MessageCircle,
  LayoutDashboard,
  HelpCircle,
  ExternalLink,
  CreditCard,
  BarChart3,
  BookOpen,
  Webhook,
  Wrench,
  Star,
  Shield,
  Cpu,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import { TenantLogo } from "@/components/TenantLogo";
import { UserMenu } from "@/components/UserMenu";
import { ModeToggle } from "@/components/ModeToggle";
import { CreditBalanceBadge } from "@/components/crm/copilot/CreditBalanceBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface MenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  external: boolean;
  badge?: string;
  requiredRole?: "user" | "admin" | "owner" | "super_admin";
}

export function TopNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { profile } = useAuth();
  const { hasRole, isSuperAdmin } = useRole();

  const chatHref = profile?.chat_link_base || "/chat";
  const isExternalChatLink = chatHref.startsWith("http");

  const menuItems: MenuItem[] = [
    { title: "Início", url: "/home", icon: Home, external: false },
    { title: "Dashboard", url: "/dashboard", icon: BarChart3, external: false },
    {
      title: "Chat",
      url: isExternalChatLink ? chatHref : chatHref || "/chat",
      icon: MessageCircle,
      external: isExternalChatLink,
    },
    { title: "CRM", url: "/crm", icon: LayoutDashboard, external: false },
    {
      title: "AI Studio",
      url: "/ai-studio",
      icon: Cpu,
      external: false,
      requiredRole: "admin",
    },
    {
      title: "Webhooks",
      url: "/webhooks",
      icon: Webhook,
      external: false,
      requiredRole: "admin",
    },
    {
      title: "Billing",
      url: "/billing",
      icon: CreditCard,
      external: false,
      requiredRole: "admin",
    },
    {
      title: "Suporte",
      url: "/suporte",
      icon: HelpCircle,
      external: false,
      requiredRole: "admin",
    },
    { title: "Tutorial", url: "/tutorial", icon: BookOpen, external: false },
  ];

  // Items hidden from main nav but shown in mobile
  const mobileOnlyItems: MenuItem[] = [
    {
      title: "Toolkit",
      url: "/toolkit",
      icon: Wrench,
      external: false,
      badge: "Em Breve",
      requiredRole: "admin",
    },
    {
      title: "Clube Solo",
      url: "/clube",
      icon: Star,
      external: false,
      badge: "Em Breve",
      requiredRole: "admin",
    },
  ];

  const visibleMenuItems = menuItems.filter((item) => {
    if (item.requiredRole) {
      return hasRole(item.requiredRole);
    }
    return true;
  });

  const visibleMobileItems = [...visibleMenuItems, ...mobileOnlyItems].filter(
    (item) => {
      if (item.requiredRole) {
        return hasRole(item.requiredRole);
      }
      return true;
    }
  );

  const isActive = (url: string) => location.pathname === url;

  const NavLinkContent = ({
    item,
    mobile = false,
  }: {
    item: MenuItem;
    mobile?: boolean;
  }) => {
    const baseClasses = mobile
      ? "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors"
      : "flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors hover-gradient-border";

    const activeClasses = mobile
      ? "bg-muted text-foreground font-medium"
      : "text-foreground";

    const inactiveClasses = mobile
      ? "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      : "text-muted-foreground hover:text-foreground";

    const content = (
      <>
        {mobile && <item.icon className="h-5 w-5" />}
        <span>{item.title}</span>
        {item.external && <ExternalLink className="h-3 w-3" />}
        {item.badge && (
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0 h-4 ml-1"
          >
            {item.badge}
          </Badge>
        )}
      </>
    );

    if (item.external) {
      return (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            baseClasses,
            isActive(item.url) ? activeClasses : inactiveClasses
          )}
          onClick={() => mobile && setMobileOpen(false)}
        >
          {content}
        </a>
      );
    }

    return (
      <Link
        to={item.url}
        className={cn(
          baseClasses,
          isActive(item.url) ? activeClasses : inactiveClasses
        )}
        onClick={() => mobile && setMobileOpen(false)}
      >
        {content}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-50 h-14 border-b border-border glass">
      <div className="h-full px-4 flex items-center justify-between">
        {/* Left: Logo */}
        <Link to="/home" className="flex items-center hover:opacity-80 transition-opacity">
          <TenantLogo className="h-8" />
        </Link>

        {/* Center: Navigation (Desktop) */}
        <nav className="hidden md:flex items-center gap-1">
          {visibleMenuItems.map((item) => (
            <NavLinkContent key={item.title} item={item} />
          ))}
          {isSuperAdmin() && (
            <Link
              to="/admin"
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors hover-gradient-border",
                isActive("/admin")
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Shield className="h-4 w-4" />
              <span>Admin</span>
            </Link>
          )}
        </nav>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <CreditBalanceBadge className="hidden sm:inline-flex" />
          <ModeToggle />
          <UserMenu />

          {/* Mobile Menu Button */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-0">
              <div className="flex flex-col h-full">
                <div className="p-4 border-b border-border">
                  <TenantLogo className="h-8" />
                </div>
                <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                  {visibleMobileItems.map((item) => (
                    <NavLinkContent key={item.title} item={item} mobile />
                  ))}
                  {isSuperAdmin() && (
                    <Link
                      to="/admin"
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                        isActive("/admin")
                          ? "bg-muted text-foreground font-medium"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                      onClick={() => setMobileOpen(false)}
                    >
                      <Shield className="h-5 w-5" />
                      <span>Admin Panel</span>
                    </Link>
                  )}
                </nav>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
