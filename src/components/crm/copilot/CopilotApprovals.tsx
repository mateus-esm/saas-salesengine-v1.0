import { Link } from "react-router-dom";
import { Check, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { dealHref, whyLabel, type FeedItem } from "@/lib/copilotFeed";

interface CopilotApprovalsProps {
  items: FeedItem[];
  busyId: string | null;
  onResolve: (id: string, approve: boolean) => void;
}

/**
 * Sprint 11 · Onda 6 · T64 — what the Copilot wants to do and needs a person for:
 * won/lost, going back a stage, the deal's value, changing a filled field — or
 * anything it was not sure enough about. Approving checks the deal again first.
 */
export function CopilotApprovals({ items, busyId, onResolve }: CopilotApprovalsProps) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">Para aprovar</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{items.length}</span>
      </header>
      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nada esperando por você.</p>
      ) : (
        <ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
          {items.map((item) => {
            const href = dealHref(item);
            const busy = busyId === item.id;
            return (
              <li key={item.id} className="space-y-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{item.label ?? "Sugestão"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {href ? (
                      <Link to={href} className="hover:text-foreground hover:underline">{item.contact ?? "Negócio"}</Link>
                    ) : (
                      item.contact ?? "Negócio"
                    )}
                    {item.why ? ` · ${whyLabel(item.why)}` : ""}
                  </p>
                  {item.reason && <p className="mt-0.5 text-xs text-muted-foreground/80">“{item.reason}”</p>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={() => onResolve(item.id, true)}>
                    {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
                    Aprovar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={() => onResolve(item.id, false)}>
                    <X className="mr-1 h-3.5 w-3.5" />
                    Recusar
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
