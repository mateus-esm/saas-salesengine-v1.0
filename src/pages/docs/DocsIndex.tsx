import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Rocket, LayoutDashboard, MessageCircle, Database, Cpu, Plug, CreditCard, User } from "lucide-react";
import { useHelpArticles } from "@/hooks/useHelpArticles";
import { DocsSidebar } from "./DocsLayout";

/** Ícone por grupo de módulo — só apresentação, sem semântica de permissão. */
const MODULE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "Comece por aqui": Rocket,
  Dashboard: LayoutDashboard,
  Chat: MessageCircle,
  CRM: Database,
  "AI Studio": Cpu,
  "Integrações": Plug,
  Billing: CreditCard,
  Conta: User,
};

/**
 * SE-DOCS-001 — índice da Central de Ajuda.
 * Desktop: o índice vive na sidebar do layout; aqui mostramos os destaques.
 * Mobile: a sidebar está oculta, então renderizamos o índice completo.
 */
export default function DocsIndex() {
  const { data: articles, isLoading } = useHelpArticles();

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const groups = new Map<string, NonNullable<typeof articles>>();
  for (const a of articles ?? []) {
    const list = groups.get(a.module) ?? [];
    list.push(a);
    groups.set(a.module, list);
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Por onde começar?</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Escolha um guia abaixo ou use a busca no índice ao lado.
        </p>
      </div>

      {[...groups.entries()].map(([module, list]) => {
        const Icon = MODULE_ICONS[module] ?? BookOpen;
        return (
          <section key={module}>
            <h3 className="flex items-center gap-2 text-sm font-semibold mb-3">
              <Icon className="h-4 w-4 text-primary" />
              {module}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {list.map((a) => (
                <Link key={a.slug} to={`/docs/${a.slug}`}>
                  <Card className="h-full hover:border-primary/40 transition-colors">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{a.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription>{a.summary}</CardDescription>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      {/* Mobile: índice completo (a sidebar do layout está oculta abaixo de md) */}
      <div className="md:hidden border-t border-border pt-4">
        <h3 className="text-sm font-semibold mb-2">Todos os artigos</h3>
        <DocsSidebar />
      </div>
    </div>
  );
}
