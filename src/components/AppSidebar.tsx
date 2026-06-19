import { Home, MessageCircle, LayoutDashboard, HelpCircle, LogOut, ExternalLink, CreditCard, BarChart3, BookOpen, Webhook, Wrench, Star, Shield, Bot, Cpu } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import { TenantLogo } from "@/components/TenantLogo";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import icon from "@/assets/solo-ventures-icon.png";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar } from "@/components/ui/sidebar";

interface MenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  external: boolean;
  badge?: string;
  requiredRole?: 'user' | 'admin' | 'owner' | 'super_admin';
  permissionKey?: string;
}

export function AppSidebar() {
  const { open } = useSidebar();
  const { signOut, profile, equipe } = useAuth();
  const { hasRole, isSuperAdmin } = useRole();
  const chatHref = profile?.chat_link_base || "/chat";
  const isExternalChatLink = chatHref.startsWith("http");

  const menuItems: MenuItem[] = [
    { title: "Início", url: "/home", icon: Home, external: false },
    { title: "Dashboard", url: "/dashboard", icon: BarChart3, external: false },
    { title: "Chat", url: isExternalChatLink ? chatHref : chatHref || "/chat", icon: MessageCircle, external: isExternalChatLink },
    { title: "CRM", url: "/crm", icon: LayoutDashboard, external: false },
    { title: "Copiloto", url: "/copiloto", icon: Bot, external: false },
    { title: "AI Studio", url: "/ai-studio", icon: Cpu, external: false, requiredRole: 'admin', permissionKey: 'ai_studio' },
    { title: "Webhooks", url: "/webhooks", icon: Webhook, external: false, requiredRole: 'admin', permissionKey: 'webhooks' },
    { title: "Billing", url: "/billing", icon: CreditCard, external: false, requiredRole: 'admin', permissionKey: 'billing' },
    { title: "Toolkit", url: "/toolkit", icon: Wrench, external: false, badge: "Em Breve", requiredRole: 'admin', permissionKey: 'toolkit' },
    { title: "Clube Solo", url: "/clube", icon: Star, external: false, badge: "Em Breve", requiredRole: 'admin', permissionKey: 'clube' },
    { title: "Suporte", url: "/suporte", icon: HelpCircle, external: false, requiredRole: 'admin', permissionKey: 'suporte' },
    { title: "Tutorial", url: "/tutorial", icon: BookOpen, external: false },
  ];

  const permissions = equipe?.page_permissions;

  // Filter menu items based on role and page permissions
  const visibleMenuItems = menuItems.filter(item => {
    if (item.requiredRole && !hasRole(item.requiredRole)) {
      return false;
    }
    if (item.permissionKey && permissions && !isSuperAdmin()) {
      if (permissions[item.permissionKey] === false) {
        return false;
      }
    }
    return true;
  });

  return (
    <Sidebar className={cn(open ? "w-64" : "w-16", "glass-sidebar")} collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center justify-center">
          {open ? (
            <TenantLogo className="h-9" />
          ) : (
            <img src={icon} alt="Solo Ventures" className="h-7 w-7 shrink-0" />
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className={!open ? "sr-only" : ""}>Menu Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    {item.external ? (
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-sidebar-accent transition-colors">
                        <item.icon className="h-4 w-4 shrink-0" />
                        {open && (
                          <span className="flex items-center gap-1 text-sm">
                            {item.title}
                            <ExternalLink className="h-3 w-3" />
                          </span>
                        )}
                      </a>
                    ) : (
                      <NavLink to={item.url} end className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-sidebar-accent transition-colors" activeClassName="bg-sidebar-accent text-foreground font-semibold">
                        <item.icon className="h-4 w-4 shrink-0" />
                        {open && (
                          <span className="flex items-center gap-2 text-sm">
                            {item.title}
                            {item.badge && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                                {item.badge}
                              </Badge>
                            )}
                          </span>
                        )}
                      </NavLink>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin Section - Only visible to super_admin */}
        {isSuperAdmin() && (
          <SidebarGroup>
            <SidebarGroupLabel className={!open ? "sr-only" : ""}>Administração</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/admin" end className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-sidebar-accent transition-colors" activeClassName="bg-sidebar-accent text-foreground font-semibold">
                      <Shield className="h-4 w-4 shrink-0" />
                      {open && <span className="text-sm">Admin Panel</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-4">
        {open && profile && (
          <div className="mb-3 px-2">
            <p className="text-sm font-medium text-foreground truncate">{profile.nome_completo}</p>
            <p className="text-xs text-muted-foreground truncate font-mono-data">{profile.email}</p>
            {profile.role && profile.role !== 'user' && (
              <Badge variant="outline" className="mt-1 text-[10px] capitalize">
                {profile.role.replace('_', ' ')}
              </Badge>
            )}
          </div>
        )}
        <SidebarMenuButton onClick={signOut} className="w-full hover:bg-sidebar-accent">
          <LogOut className="h-4 w-4 shrink-0" />
          {open && <span className="text-sm">Sair</span>}
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}
