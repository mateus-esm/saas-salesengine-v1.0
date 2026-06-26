import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@/components/crm/grid/types";

const DEFAULT_WIDTH = 150;

interface PersistedLayout {
  widths: Record<string, number>;
  order: string[];
  hidden: string[];
}

function loadLayout(storageKey: string): PersistedLayout | null {
  try {
    const raw = localStorage.getItem(`grid_layout_${storageKey}`);
    return raw ? (JSON.parse(raw) as PersistedLayout) : null;
  } catch {
    return null;
  }
}

function saveLayout(storageKey: string, layout: PersistedLayout) {
  try {
    localStorage.setItem(`grid_layout_${storageKey}`, JSON.stringify(layout));
  } catch {
    // localStorage full or unavailable
  }
}

/**
 * Pure reorder helper — exported for unit tests.
 * When `prev` is null (no persisted order), falls back to `columnKeys`
 * (the full ordered list of column keys) so the result is always a valid
 * full-length array with no undefined entries.
 */
export function resolveReorder(
  prev: string[] | null,
  columnKeys: string[],
  fromIndex: number,
  toIndex: number,
): string[] {
  const base = prev ?? columnKeys;
  const list = [...base];
  const [moved] = list.splice(fromIndex, 1);
  list.splice(toIndex, 0, moved);
  return list;
}

export function useColumnLayout(columns: ColumnDef[], storageKey: string) {
  const persisted = useMemo(() => loadLayout(storageKey), [storageKey]);

  // Keep a ref to `columns` so reorderColumn stays stable (no dep on columns)
  // while still reading the latest value inside the setOrder updater.
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  const [widths, setWidths] = useState<Record<string, number>>(
    () => persisted?.widths ?? {},
  );
  const [order, setOrder] = useState<string[] | null>(
    () => persisted?.order ?? null,
  );
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(persisted?.hidden ?? []),
  );

  useEffect(() => {
    if (storageKey === "_noop_") return;
    saveLayout(storageKey, { widths, order: order ?? [], hidden: [...hidden] });
  }, [widths, order, hidden, storageKey]);

  const validKeys = useMemo(() => new Set(columns.map((c) => c.key)), [columns]);

  const visibleColumns = useMemo(() => {
    const ordered = order ?? columns.map((c) => c.key);
    const valid = ordered.filter((k) => validKeys.has(k) && !hidden.has(k));
    const orderedSet = new Set(ordered);
    for (const col of columns) {
      if (!orderedSet.has(col.key) && !hidden.has(col.key)) {
        valid.push(col.key);
      }
    }
    const keyMap = new Map(columns.map((c) => [c.key, c]));
    return valid
      .map((k) => keyMap.get(k))
      .filter((c): c is ColumnDef => !!c)
      .map((c) => ({
        ...c,
        width: widths[c.key] ?? c.width ?? DEFAULT_WIDTH,
      }));
  }, [columns, order, hidden, widths, validKeys]);

  const hiddenColumns = useMemo(
    () => columns.filter((c) => hidden.has(c.key)).map((c) => c.key),
    [columns, hidden],
  );

  const toggleColumn = useCallback((key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const resizeColumn = useCallback((key: string, width: number) => {
    setWidths((prev) => ({ ...prev, [key]: Math.max(60, width) }));
  }, []);

  const reorderColumn = useCallback((fromIndex: number, toIndex: number) => {
    setOrder((prev) =>
      resolveReorder(prev, columnsRef.current.map((c) => c.key), fromIndex, toIndex),
    );
  }, []);

  const resetLayout = useCallback(() => {
    setWidths({});
    setOrder(null);
    setHidden(new Set());
  }, []);

  return {
    visibleColumns,
    columnWidths: widths,
    columnOrder: order ?? columns.map((c) => c.key),
    hiddenColumns,
    toggleColumn,
    resizeColumn,
    reorderColumn,
    resetLayout,
  };
}
