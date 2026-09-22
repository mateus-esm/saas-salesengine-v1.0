import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  dealHref,
  groupByWhy,
  statusLabel,
  whyCounts,
  whyLabel,
  type FeedItem,
} from "@/lib/copilotFeed";
import { cn } from "@/lib/utils";

const ALL = "all";
const SELECT_ALL_ID = "copilot-approvals-select-all";

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const confidencePct = (value?: number | null) =>
  value == null ? null : `${Math.round((value <= 1 ? value * 100 : value))}%`;

interface CopilotApprovalsProps {
  items: FeedItem[];
  busyId: string | null;
  onResolve: (id: string, approve: boolean) => void;
  /** Approve or reject everything selected at once. */
  onResolveMany: (ids: string[], approve: boolean) => void;
  /** A bulk round is in flight — the individual buttons wait for it too. */
  isResolvingMany?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

/**
 * Sprint 11 · Onda 6 · T64 — what the Copilot wants to do and needs a person for:
 * won/lost, going back a stage, the deal's value, changing a filled field — or
 * anything it was not sure enough about. Approving checks the deal again first.
 *
 * SE-COPILOT-001 — the queue became selectable: pick what to answer, filter by
 * why it is waiting, and approve or reject the selection in one go. The
 * per-item buttons stay exactly as they were.
 *
 * SE-COPILOT-002 — the same queue now also backs the pipeline panel
 * (CopilotApprovalsPanel), which maps its `ai_decisions` rows into this shape.
 * It is props-driven and knows nothing about where the rows came from.
 */
export function CopilotApprovals({
  items,
  busyId,
  onResolve,
  onResolveMany,
  isResolvingMany = false,
  isLoading = false,
  isError = false,
  onRetry,
}: CopilotApprovalsProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<string>(ALL);

  // Suggestions leave the list once answered — drop them from the selection.
  useEffect(() => {
    setSelected((current) => {
      const alive = new Set(items.map((i) => i.id));
      const next = new Set([...current].filter((id) => alive.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [items]);

  // A filter for a reason that no longer exists must not hide the whole queue —
  // derived during render, so the queue never flashes empty for a frame.
  const activeFilter =
    filter !== ALL && items.some((i) => (i.why ?? "") === filter) ? filter : ALL;

  const counts = useMemo(() => whyCounts(items), [items]);
  const visible = useMemo(
    () => (activeFilter === ALL ? items : items.filter((i) => (i.why ?? "") === activeFilter)),
    [items, activeFilter],
  );
  const groups = useMemo(() => groupByWhy(visible), [visible]);

  const selectedVisible = visible.filter((i) => selected.has(i.id));
  const allVisibleSelected = visible.length > 0 && selectedVisible.length === visible.length;
  const someVisibleSelected = selectedVisible.length > 0 && !allVisibleSelected;

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visible.forEach((i) => next.delete(i.id));
      else visible.forEach((i) => next.add(i.id));
      return next;
    });

  const runBulk = (approve: boolean) => {
    const ids = selectedVisible.map((i) => i.id);
    if (ids.length === 0) return;
    onResolveMany(ids, approve);
    setSelected(new Set());
  };

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">Para aprovar</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
          {items.length}
        </span>
        {items.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox
              id={SELECT_ALL_ID}
              checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
              onCheckedChange={toggleAll}
              aria-label="Selecionar todas as sugestões visíveis"
              className="h-3.5 w-3.5"
            />
            <label htmlFor={SELECT_ALL_ID} className="cursor-pointer">
              {allVisibleSelected ? "Limpar" : "Selecionar"}
            </label>
          </div>
        )}
      </header>

      {isLoading ? (
        <div className="space-y-3 px-4 py-4" aria-busy="true" aria-label="Carregando sugestões">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <p className="text-sm text-muted-foreground">Não consegui carregar as sugestões.</p>
          {onRetry && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onRetry}>
              Tentar de novo
            </Button>
          )}
        </div>
      ) : items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nada esperando por você.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2">
            <FilterChip
              active={activeFilter === ALL}
              label="Todas"
              count={items.length}
              onClick={() => setFilter(ALL)}
            />
            {counts.map((c) => (
              <FilterChip
                key={c.why || "sem-motivo"}
                active={activeFilter === c.why}
                label={c.label}
                count={c.count}
                onClick={() => setFilter(c.why)}
              />
            ))}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {groups.map((group) => (
              <div key={group.why || "sem-motivo"}>
                <p className="sticky top-0 z-10 bg-card/95 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                  {group.label} · {group.items.length}
                </p>
                <ul className="divide-y divide-border/60">
                  {group.items.map((item) => {
                    const href = dealHref(item);
                    const busy = busyId === item.id || isResolvingMany;
                    const isSelected = selected.has(item.id);
                    const pct = confidencePct(item.confidence);
                    return (
                      <li
                        key={item.id}
                        className={cn("flex items-start gap-3 px-4 py-3", isSelected && "bg-primary/5")}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggle(item.id)}
                          disabled={isResolvingMany}
                          aria-label={`Selecionar ${item.label ?? "sugestão"}`}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                            <p className="min-w-0 text-sm font-medium">{item.label ?? "Sugestão"}</p>
                            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                              {pct && (
                                <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
                                  {pct}
                                </Badge>
                              )}
                              <Badge variant="secondary" className="text-[10px] font-medium">
                                {whyLabel(item.why) || "sem motivo"}
                              </Badge>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {href ? (
                              <Link to={href} className="hover:text-foreground hover:underline">
                                {item.contact ?? "Negócio"}
                              </Link>
                            ) : (
                              (item.contact ?? "Negócio")
                            )}
                            {" · "}
                            {statusLabel(item.status)}
                            {when(item.at) && ` · ${when(item.at)}`}
                          </p>
                          {item.reason && (
                            <p className="text-xs italic text-muted-foreground/80">“{item.reason}”</p>
                          )}
                          <div className="flex flex-wrap gap-2 pt-0.5">
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              disabled={busy}
                              onClick={() => onResolve(item.id, true)}
                            >
                              {busy ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="mr-1 h-3.5 w-3.5" />
                              )}
                              Aprovar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              disabled={busy}
                              onClick={() => onResolve(item.id, false)}
                            >
                              <X className="mr-1 h-3.5 w-3.5" />
                              Recusar
                            </Button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          {selectedVisible.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/40 px-4 py-2">
              <span className="text-xs tabular-nums text-muted-foreground">
                {selectedVisible.length} selecionada{selectedVisible.length === 1 ? "" : "s"}
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={isResolvingMany}
                  onClick={() => runBulk(true)}
                >
                  {isResolvingMany ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="mr-1 h-3.5 w-3.5" />
                  )}
                  Aprovar selecionadas
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs text-destructive hover:text-destructive"
                  disabled={isResolvingMany}
                  onClick={() => runBulk(false)}
                >
                  <X className="mr-1 h-3.5 w-3.5" />
                  Recusar selecionadas
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  disabled={isResolvingMany}
                  onClick={() => setSelected(new Set())}
                >
                  Limpar
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function FilterChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
        active
          ? "border-primary/30 bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {label} <span className="tabular-nums text-muted-foreground">{count}</span>
    </button>
  );
}
