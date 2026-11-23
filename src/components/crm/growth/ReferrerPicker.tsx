import { useEffect, useState } from "react";
import { Loader2, Search, X } from "lucide-react";

import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

type Hit = { id: string; name: string; phone: string | null };

/** Sprint 16 — "Indicado por": a contact of the team, searched by name or phone. */
export function ReferrerPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Hit | null>(null);
  const [results, setResults] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!value) setPicked(null);
  }, [value]);

  useEffect(() => {
    const q = query.trim().replace(/[%,()]/g, "");
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("leads")
      .select("id, name, phone")
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
      .is("deleted_at", null)
      .limit(8)
      .then(({ data }) => {
        if (!cancelled) {
          setResults((data ?? []) as Hit[]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <div>
      <Label>Indicado por</Label>
      {picked ? (
        <div className="mt-1.5 flex h-9 items-center justify-between rounded-md border border-input px-3 text-sm">
          <span>
            <span className="font-medium">{picked.name}</span>
            {picked.phone && <span className="ml-2 text-muted-foreground">{picked.phone}</span>}
          </span>
          <button type="button" aria-label="Tirar quem indicou" onClick={() => { setPicked(null); onChange(null); setQuery(""); }}>
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      ) : (
        <div className="relative mt-1.5">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            className="flex h-9 w-full rounded-md border border-input bg-transparent py-1 pl-8 pr-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Buscar quem indicou (nome ou telefone)…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
          />
          {open && query.trim().length >= 2 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-auto rounded-md border border-border bg-popover shadow-md">
              {loading ? (
                <div className="p-2 text-center text-xs text-muted-foreground"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Buscando…</div>
              ) : results.length === 0 ? (
                <div className="p-2 text-center text-xs text-muted-foreground">Nenhum contato encontrado</div>
              ) : (
                results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => { setPicked(r); onChange(r.id); setOpen(false); }}
                  >
                    <span className="font-medium">{r.name}</span>
                    {r.phone && <span className="ml-2 text-muted-foreground">{r.phone}</span>}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">Conta para o programa de indicação: quem mais indica e quanto as indicações venderam.</p>
    </div>
  );
}
