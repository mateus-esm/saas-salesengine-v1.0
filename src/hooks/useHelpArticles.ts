import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { HELP_ARTICLES_SEED, type HelpArticleSeed } from "@/data/help-articles.seed";

/**
 * SE-DOCS-001 — leitura dos artigos da Central de Ajuda.
 *
 * Fonte primária: tabela `help_articles` no Supabase (atualizável sem deploy:
 * um UPDATE no banco muda o texto exibido sem rebuild). Fallback: o seed
 * estático do bundle, usado quando o banco está inacessível — a ajuda nunca
 * quebra por falha de rede, apenas mostra a versão do build.
 *
 * Tipos locais de propósito: `src/integrations/supabase/types.ts` é gerado e
 * não deve ser editado à mão; o acesso via `from()` com strings funciona sem
 * ele e mantém este módulo desacoplado da regeneração dos tipos.
 */
export interface HelpArticle extends HelpArticleSeed {
  id?: string;
  updated_at?: string;
  /** true quando o texto veio do banco; false quando veio do fallback. */
  fromRemote: boolean;
}

/**
 * `help_articles` nasce na migration SE-DOCS-001. `src/integrations/supabase/types.ts`
 * é gerado por `supabase gen types` e só passa a listar a tabela depois de
 * regenerado — o cast tipado abaixo mantém este módulo compilando sem editar o
 * arquivo gerado à mão, e preserva o formato do retorno.
 */
interface HelpArticlesQuery {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        order: (
          column: string,
          options: { ascending: boolean },
        ) => Promise<{ data: HelpArticleSeed[] | null; error: unknown }>;
      };
    };
  };
}

async function fetchRemote(): Promise<HelpArticleSeed[] | null> {
  try {
    const db = supabase as unknown as HelpArticlesQuery;
    const { data, error } = await db
      .from("help_articles")
      .select("slug, module, title, summary, body_md, order")
      .eq("is_published", true)
      .order("order", { ascending: true });
    if (error) return null;
    if (!data || data.length === 0) return null;
    return data;
  } catch {
    return null;
  }
}

export function useHelpArticles() {
  return useQuery({
    queryKey: ["help-articles"],
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async (): Promise<HelpArticle[]> => {
      const remote = await fetchRemote();
      if (remote) {
        return remote.map((a) => ({ ...a, fromRemote: true }));
      }
      return HELP_ARTICLES_SEED.map((a) => ({ ...a, fromRemote: false }));
    },
  });
}

export function useHelpArticle(slug: string | undefined) {
  const list = useHelpArticles();
  return {
    ...list,
    data: slug ? list.data?.find((a) => a.slug === slug) : undefined,
  };
}
