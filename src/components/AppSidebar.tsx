import { Home, MessageCircle, LayoutDashboard, HelpCircle, LogOut, ExternalLink, CreditCard, BarChart3, BookOpen, Webhook } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { TenantLogo } from "@/components/TenantLogo";
import icon from "@/assets/solo-ventures-icon.png";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar } from "@/components/ui/sidebar";

export function AppSidebar() {
  const { open } = useSidebar();
  const { signOut, profile } = useAuth();
  const { tenant } = useTenant();
  const chatHref = profile?.chat_link_base || "/chat";
  const isExternalChatLink = chatHref.startsWith("http");

  const menuItems = [
    { title: "Início", url: "/home", icon: Home, external: false },
    { title: "Dashboard", url: "/dashboard", icon: BarChart3, external: false },
    { title: `Chat ${tenant.name}`, url: isExternalChatLink ? chatHref : chatHref || "/chat", icon: MessageCircle, external: isExternalChatLink },
    { title: "CRM", url: "/crm", icon: LayoutDashboard, external: false },
    { title: "Webhooks", url: "/webhooks", icon: Webhook, external: false },
    { title: "Billing", url: "/billing", icon: CreditCard, external: false },
    { title: "Suporte", url: "/suporte", icon: HelpCircle, external: false },
    { title: "Tutorial", url: "/tutorial", icon: BookOpen, external: false },
  ];

  return (
    <Sidebar className={open ? "w-64" : "w-16"} collapsible="icon">
      <SidebarHeader className="border-b border-border p-4">
        <div className="flex items-center justify-center">
          {open ? (
            <TenantLogo className="h-10" showName />
          ) : (
            <img src={icon} alt={tenant.name} className="h-8 w-8 shrink-0" />
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className={!open ? "sr-only" : ""}>Menu Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    {item.external ? (
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <item.icon className="h-5 w-5 shrink-0" />
                        {open && <span className="flex items-center gap-1">{item.title}<ExternalLink className="h-3 w-3" /></span>}
                      </a>
                    ) : (
                      <NavLink to={item.url} end className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors" activeClassName="bg-primary/10 text-primary font-medium">
                        <item.icon className="h-5 w-5 shrink-0" />
                        {open && <span>{item.title}</span>}
                      </NavLink>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-border p-4">
        {open && profile && (
          <div className="mb-3 px-2">
            <p className="text-sm font-medium text-foreground truncate">{profile.nome_completo}</p>
            <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
          </div>
        )}
        <SidebarMenuButton onClick={signOut} className="w-full">
          <LogOut className="h-5 w-5 shrink-0" />
          {open && <span>Sair</span>}
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}
