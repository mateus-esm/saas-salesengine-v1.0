import {
  MessageCircle,
  LayoutDashboard,
  Headphones,
  Zap,
  BarChart3,
  Bot,
  Webhook,
  CreditCard,
  BookOpen,
  Wrench,
  Star,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { useRole } from "@/hooks/useRole";
import { AppHubCard } from "@/components/AppHubCard";

const Home = () => {
  const { profile, equipe } = useAuth();
  const { tenant } = useTenant();
  const { hasRole } = useRole();
  const chatHref = profile?.chat_link_base || "/chat";
  const isExternalChatLink = chatHref.startsWith("http");

  // Define all modules with descriptions
  const modules = [
    {
      title: "Central de Chat",
      description:
        "Gerencie todas as conversas do WhatsApp. Responda clientes, transfira para humanos e acompanhe em tempo real.",
      icon: MessageCircle,
      href: chatHref,
      external: isExternalChatLink,
      requiredRole: undefined,
    },
    {
      title: "Pipeline CRM",
      description:
        "Visualize seu funil de vendas com Kanban drag-and-drop. Mova leads entre etapas e nunca perca uma oportunidade.",
      icon: LayoutDashboard,
      href: "/crm",
      external: false,
      requiredRole: undefined,
    },
    {
      title: "Dashboard",
      description:
        "Métricas de performance: leads, reuniões, no-shows, valor do pipeline. Exporte relatórios em CSV.",
      icon: BarChart3,
      href: "/dashboard",
      external: false,
      requiredRole: undefined,
    },
    {
      title: "Agente IA",
      description:
        "Configure o comportamento do seu agente de vendas. Treine com documentos e ajuste prompts.",
      icon: Bot,
      href: "/agent",
      external: false,
      requiredRole: "admin" as const,
    },
    {
      title: "Webhooks",
      description:
        "Integre com sistemas externos via webhooks. Monitore logs e configure automações.",
      icon: Webhook,
      href: "/webhooks",
      external: false,
      requiredRole: "admin" as const,
    },
    {
      title: "Billing",
      description:
        "Gerencie créditos e assinatura. Compre pacotes via PIX ou cartão.",
      icon: CreditCard,
      href: "/billing",
      external: false,
      requiredRole: "admin" as const,
    },
    {
      title: "Expert Support",
      description:
        "Acesse suporte técnico e estratégico dedicado da Solo Ventures.",
      icon: Headphones,
      href: "/suporte",
      external: false,
      requiredRole: "admin" as const,
    },
    {
      title: "Tutorial",
      description:
        "Aprenda a usar a plataforma com guias passo-a-passo e vídeos.",
      icon: BookOpen,
      href: "/tutorial",
      external: false,
      requiredRole: undefined,
    },
    {
      title: "Toolkit",
      description:
        "Ferramentas avançadas para potencializar suas vendas.",
      icon: Wrench,
      href: "/toolkit",
      external: false,
      requiredRole: "admin" as const,
      badge: "Em Breve",
      disabled: true,
    },
    {
      title: "Clube Solo",
      description:
        "Comunidade exclusiva com conteúdos e networking para membros.",
      icon: Star,
      href: "/clube",
      external: false,
      requiredRole: "admin" as const,
      badge: "Em Breve",
      disabled: true,
    },
  ];

  // Filter modules based on role
  const visibleModules = modules.filter((module) => {
    if (module.requiredRole) {
      return hasRole(module.requiredRole);
    }
    return true;
  });

  return (
    <div className="flex-1 flex flex-col bg-background overflow-y-auto">
      {/* Hero Section */}
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-12 md:py-16 text-center">
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            <span className="text-gradient-solo">{tenant.name}</span>
          </h1>
          <p className="text-lg text-muted-foreground mb-2">
            {equipe?.nome || "Assistente"} • Sua máquina de vendas automatizada
          </p>
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-1.5">
            {profile?.nome_completo} • Powered by Solo Ventures{" "}
            <Zap className="h-4 w-4 text-solo-orange fill-solo-orange" />
          </p>
        </div>
      </div>

      {/* App Hub Grid */}
      <div className="flex-1 container mx-auto px-4 py-8 md:py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
          {visibleModules.map((module) => (
            <AppHubCard
              key={module.title}
              title={module.title}
              description={module.description}
              icon={module.icon}
              href={module.href}
              external={module.external}
              badge={module.badge}
              disabled={module.disabled}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Home;
