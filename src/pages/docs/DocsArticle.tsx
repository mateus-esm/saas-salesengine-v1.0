import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useHelpArticle, useHelpArticles } from "@/hooks/useHelpArticles";

/**
 * SE-DOCS-001 — render mínimo de Markdown.
 *
 * Subconjunto usado pelos artigos: títulos ##, parágrafos, listas (-/1.),
 * negrito **, código `inline` e links [t](u). Sem dependência nova de
 * propósito: o corpo é conteúdo interno versionado, não input de usuário.
 */
export function renderMarkdown(md: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const lines = md.split("\n");
  let i = 0;
  let key = 0;

  const inline = (text: string, k: number): React.ReactNode => {
    // **negrito**, `código`, [texto](url)
    const parts: React.ReactNode[] = [];
    const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let j = 0;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      const tok = m[0];
      if (tok.startsWith("**")) {
        parts.push(<strong key={j++}>{tok.slice(2, -2)}</strong>);
      } else if (tok.startsWith("`")) {
        parts.push(
          <code key={j++} className="px-1 py-0.5 rounded bg-muted font-mono text-[0.85em]">
            {tok.slice(1, -1)}
          </code>,
        );
      } else {
        const lm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok)!;
        parts.push(
          <Link key={j++} to={lm[2]} className="text-primary hover:underline">
            {lm[1]}
          </Link>,
        );
      }
      last = m.index + tok.length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return <span key={k}>{parts}</span>;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      out.push(
        <h2 key={key++} className="text-lg font-bold mt-6 mb-2 first:mt-0">
          {inline(line.slice(3), key)}
        </h2>,
      );
      i++;
    } else if (/^[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(lines[i].slice(2));
        i++;
      }
      out.push(
        <ul key={key++} className="list-disc pl-5 space-y-1 my-2 text-sm text-foreground/90">
          {items.map((t, n) => (
            <li key={n}>{inline(t, n)}</li>
          ))}
        </ul>,
      );
    } else if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ""));
        i++;
      }
      out.push(
        <ol key={key++} className="list-decimal pl-5 space-y-1 my-2 text-sm text-foreground/90">
          {items.map((t, n) => (
            <li key={n}>{inline(t, n)}</li>
          ))}
        </ol>,
      );
    } else if (line.trim() === "") {
      i++;
    } else {
      out.push(
        <p key={key++} className="text-sm text-foreground/90 leading-relaxed my-2">
          {inline(line, key)}
        </p>,
      );
      i++;
    }
  }
  return out;
}

export default function DocsArticle() {
  const { slug } = useParams();
  const { data: article, isLoading } = useHelpArticle(slug);
  const { data: all } = useHelpArticles();

  if (isLoading) {
    return (
      <div className="p-6 space-y-3 max-w-3xl">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="p-6 max-w-3xl">
        <h2 className="text-xl font-bold">Artigo não encontrado</h2>
        <p className="text-sm text-muted-foreground mt-2">
          O endereço pode ter mudado. Volte ao índice da Central de Ajuda.
        </p>
        <Link to="/docs" className="text-primary text-sm font-medium hover:underline mt-4 inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Voltar à Central de Ajuda
        </Link>
      </div>
    );
  }

  const idx = (all ?? []).findIndex((a) => a.slug === article.slug);
  const prev = idx > 0 ? all![idx - 1] : undefined;
  const next = idx >= 0 && idx < all!.length - 1 ? all![idx + 1] : undefined;

  return (
    <article className="p-6 max-w-3xl">
      <div className="flex items-center gap-2 mb-2">
        <Badge variant="secondary" className="text-[10px]">
          {article.module}
        </Badge>
        {!article.fromRemote && (
          <Badge variant="outline" className="text-[10px]">
            conteúdo offline
          </Badge>
        )}
      </div>
      <h2 className="text-2xl font-bold tracking-tight">{article.title}</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-4">{article.summary}</p>
      <div>{renderMarkdown(article.body_md)}</div>

      <nav className="flex items-center justify-between gap-4 border-t border-border mt-8 pt-4">
        <div className="flex-1">
          {prev && (
            <Link to={`/docs/${prev.slug}`} className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" /> {prev.title}
            </Link>
          )}
        </div>
        <div className="flex-1 text-right">
          {next && (
            <Link to={`/docs/${next.slug}`} className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1">
              {next.title} <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </nav>
    </article>
  );
}
