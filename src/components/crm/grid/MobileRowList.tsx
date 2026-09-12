// Sprint 11 · Onda 2B · T26 — a table on a phone is a list.
//
// A spreadsheet at 360 px is a horizontal scroll with one column visible. Below
// 768 px the grid hands each row to the screen's `renderMobileRow` (name, the
// two or three facts that matter, the owner) and a tap opens the record. The
// same infinite scroll: a sentinel under the last row asks for the next page.

import { useEffect, useRef, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

import type { GridRow } from "./types";

interface MobileRowListProps {
  rows: GridRow[];
  renderRow: (row: GridRow) => ReactNode;
  onRowOpen?: (rowId: string) => void;
  loading?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onEndReached?: () => void;
  emptyLabel?: string;
}

export function MobileRowList({
  rows,
  renderRow,
  onRowOpen,
  loading,
  hasMore,
  loadingMore,
  onEndReached,
  emptyLabel = "Nada por aqui.",
}: MobileRowListProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onEndReachedRef = useRef(onEndReached);
  onEndReachedRef.current = onEndReached;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loadingMore || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onEndReachedRef.current?.();
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, rows.length]);

  if (loading && rows.length === 0) {
    return (
      <div className="flex justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.id}>
            {onRowOpen ? (
              <button
                type="button"
                onClick={() => onRowOpen(row.id)}
                className="block w-full px-3 py-2.5 text-left active:bg-muted/60"
              >
                {renderRow(row)}
              </button>
            ) : (
              <div className="px-3 py-2.5">{renderRow(row)}</div>
            )}
          </li>
        ))}
      </ul>
      {hasMore && <div ref={sentinelRef} className="h-2" aria-hidden />}
      {loadingMore && (
        <div className="flex justify-center py-3 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}
    </div>
  );
}
