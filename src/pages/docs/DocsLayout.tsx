import { useMemo, useState } from "react";
import { Link, Outlet, useLocation, useParams } from "react-router-dom";
import { BookOpen, Search, ArrowLeft, LifeBuoy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useHelpArticles } from "@/hooks/useHelpArticles";

/**
 * SE-DOCS-001 — shell da Central de Ajuda (/docs).
 *
 * Índice lateral agrupado por módulo + busca local + conteúdo via <Outlet/>.
 * Sem PageRouteGuard de propósito: ajuda é visível para todos os usuários,
 * como o /tutorial sempre foi.
 */
export function DocsSidebar() {
  const { data: articles, isLoading } = useHelpArticles();
  const [q, setQ] = useState("");
  const location = useLocation();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return articles ?? [];
    return (articles ?? []).filter(
      (a) =>
        a.title.toLowerCase().includes(needle) ||
        a.summary.toLowerCase().includes(needle) ||
        a.body_md.toLowerCase().includes(needle),
    );
  }, [articles, q]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const a of filtered) {
      const list = map.get(a.module) ?? [];
      list.push(a);
      map.set(a.module, list);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar na ajuda..."
            className="pl-9"
          />
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {isLoading ? (
          <div className="space-y-2 px-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-5 w-28 mt-4" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground px-2 py-4">
            Nenhum artigo encontrado para "{q}".
          </p>
        ) : (
          groups.map(([module, list]) => (
            <div key={module} className="mb-3">
              <p className="px-2 py-1.5 text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-muted-foreground">
                {module}
              </p>
              {list.map((a) => {
                const active = location.pathname === `/docs/${a.slug}`;
                return (
                  <Link
                    key={a.slug}
                    to={`/docs/${a.slug}`}
                    className={cn(
                      "block px-3 py-2 rounded-md text-sm transition-colors",
                      active
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    {a.title}
                  </Link>
                );
              })}
            </div>
          ))
        )}
      </nav>
    </div>
  );
}

export default function DocsLayout() {
  const { data: articles } = useHelpArticles();
  const params = useParams();
  const showingArticle = Boolean(params.slug);
  const isStale = articles && articles.length > 0 && !articles[0].fromRemote;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="border-b border-border bg-header-bg">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          {showingArticle && (
            <Link
              to="/docs"
              className="md:hidden p-1.5 rounded-md hover:bg-muted text-muted-foreground"
              aria-label="Voltar ao índice"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-primary" />
              Central de Ajuda
            </h1>
            <p className="text-sm text-foreground/70 mt-1 font-medium">
              Guias práticos para operar cada parte da plataforma
            </p>
          </div>
          {isStale && (
            <Badge variant="outline" className="hidden sm:inline-flex text-[10px]">
              conteúdo offline
            </Badge>
          )}
        </div>
      </div>

      <div className="flex-1 flex min-h-0 container mx-auto">
        {/* Índice: sidebar no desktop, tela própria no mobile */}
        <aside className="w-[280px] shrink-0 border-r border-border hidden md:block overflow-hidden">
          <DocsSidebar />
        </aside>
        <main className="flex-1 min-w-0 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      <div className="border-t border-border">
        <div className="container mx-auto px-4 py-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <LifeBuoy className="h-3.5 w-3.5" />
          Não resolveu? Fale com a equipe na página
          <Link to="/suporte" className="text-primary font-medium hover:underline">
            Suporte
          </Link>
        </div>
      </div>
    </div>
  );
}
