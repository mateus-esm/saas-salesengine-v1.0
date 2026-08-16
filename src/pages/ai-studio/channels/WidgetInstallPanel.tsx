import { useState, useEffect, useCallback } from "react";
import { Loader2, Copy, Check, Code2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

interface Props { channelId: string }

// The one connection flow a tenant can complete entirely inside our app: the
// provider hands back ready-made embed snippets, no login or credentials.
const SNIPPETS = [
  {
    key: "float" as const,
    title: "Botão flutuante",
    hint: "Cole antes do </body>. Mostra um botão de chat no canto da página.",
  },
  {
    key: "iframe" as const,
    title: "Iframe",
    hint: "Cole onde quiser embutir o chat dentro de uma seção da página.",
  },
];

export function WidgetInstallPanel({ channelId }: Props) {
  const { toast } = useToast();
  const [links, setLinks] = useState<{ float: string | null; iframe: string | null }>({ float: null, iframe: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const { data, error: err } = await supabase.functions.invoke("manage-agent-channels", {
        body: { action: "widget-links", channel_id: channelId },
      });
      if (err) throw err;
      if (data?.message) throw new Error(data.message);
      setLinks({ float: data?.float ?? null, iframe: data?.iframe ?? null });
    } catch (e) {
      setError(String((e as any)?.message ?? e));
    } finally { setLoading(false); }
  }, [channelId]);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    } catch {
      toast({ title: "Não foi possível copiar", description: "Selecione e copie manualmente.", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10 border border-dashed border-border rounded-lg space-y-2">
        <AlertCircle className="w-7 h-7 mx-auto text-muted-foreground/50" />
        <p className="text-sm text-foreground">Não foi possível carregar o código de instalação</p>
        <p className="text-[11px] text-muted-foreground break-words max-w-sm mx-auto">{error}</p>
        <Button size="sm" variant="outline" className="text-xs" onClick={fetchLinks}>Tentar novamente</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Copie um dos códigos abaixo e cole no HTML do seu site. O widget já está pronto —
        não exige login nem credenciais.
      </p>

      {SNIPPETS.map(({ key, title, hint }) => {
        const value = links[key];
        if (!value) return null;
        return (
          <div key={key} className="border border-border rounded-lg overflow-hidden bg-card">
            <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Code2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
                  {title}
                </span>
              </div>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] gap-1.5 shrink-0"
                      onClick={() => copy(key, value)}>
                {copied === key ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                {copied === key ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <div className="p-3 space-y-2">
              <pre className="text-[11px] font-mono text-foreground/80 bg-muted/40 border border-border
                              rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all">
                {value}
              </pre>
              <p className="text-[11px] text-muted-foreground">{hint}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
