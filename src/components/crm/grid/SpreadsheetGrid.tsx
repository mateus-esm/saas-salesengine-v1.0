import { useCallback, useEffect, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { ColumnDef, CellMutation, GridRow } from "./types";
import { InlineCell } from "./InlineCell";
import { MassActionBar, type MassAction } from "./MassActionBar";
import { useGridSelection } from "./useGridSelection";
import { LeadScoreBadge } from "../LeadScoreBadge";
import type { LeadScoreBreakdown } from "../LeadScoreBadge";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SpreadsheetGridProps {
  rows: GridRow[];
  columns: ColumnDef[];
  onCellCommit: (m: CellMutation) => Promise<void>;
  massActions: MassAction[];
  onAddColumn?: () => void;
  loading?: boolean;
  equipeId?: string;
  fromTable?: string;
  // Sprint 6.8 T4.2 — sort & resize
  onSort?: (key: string, dir: "asc" | "desc" | null) => void;
  sortKey?: string;
  sortDir?: "asc" | "desc" | null;
  onResizeColumn?: (key: string, width: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LEAD_SCORE_COL_KEY = "_lead_score";

/** Shared lead-score column header for all table states. */
function LeadScoreHeader({
  onSort,
  sortKey,
  sortDir,
  onResize,
}: {
  onSort?: (key: string, dir: "asc" | "desc" | null) => void;
  sortKey?: string;
  sortDir?: "asc" | "desc" | null;
  onResize?: (key: string, w: number) => void;
}) {
  const [resizing, setResizing] = useState<{
    startX: number;
    startWidth: number;
  } | null>(null);
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

  useEffect(() => {
    if (!resizing) return;
    const handleMouseUp = (e: MouseEvent) => {
      const diff = e.clientX - resizing.startX;
      onResizeRef.current?.(LEAD_SCORE_COL_KEY, Math.max(60, resizing.startWidth + diff));
      setResizing(null);
    };
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [resizing]);

  const indicator =
    sortKey === LEAD_SCORE_COL_KEY && sortDir === "asc"
      ? " \u2191"
      : sortKey === LEAD_SCORE_COL_KEY && sortDir === "desc"
        ? " \u2193"
        : "";

  return (
    <th className="w-16 px-1 py-2 text-[10px] font-mono text-muted-foreground text-center relative select-none">
      <span
        className={onSort ? "cursor-pointer" : undefined}
        onClick={() => {
          if (!onSort) return;
          if (sortKey !== LEAD_SCORE_COL_KEY) onSort(LEAD_SCORE_COL_KEY, "asc");
          else if (sortDir === "asc") onSort(LEAD_SCORE_COL_KEY, "desc");
          else if (sortDir === "desc") onSort(LEAD_SCORE_COL_KEY, null);
          else onSort(LEAD_SCORE_COL_KEY, "asc");
        }}
      >
        Score{indicator}
      </span>
      {/* Resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-[4px] cursor-col-resize group/resize"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setResizing({ startX: e.clientX, startWidth: 64 });
        }}
      >
        <div className="w-[2px] mx-auto h-full bg-transparent group-hover/resize:bg-border/50 transition-colors" />
      </div>
    </th>
  );
}

/** Resize-handle element placed in each <th>. */
function ResizeHandle({
  onResize,
}: {
  onResize: (key: string, w: number) => void;
}) {
  // Handled in parent via column-specific state — placeholder maintains structure.
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SpreadsheetGrid({
  rows,
  columns,
  onCellCommit,
  massActions,
  onAddColumn,
  loading = false,
  equipeId,
  fromTable,
  onSort,
  sortKey,
  sortDir,
  onResizeColumn,
}: SpreadsheetGridProps) {
  const allIds = rows.map((r) => r.id);
  const { selectedIds, isSelected, toggle, toggleAll, clear, count } =
    useGridSelection(allIds);

  const handleCellCommit = useCallback(
    (row: GridRow, column: ColumnDef) =>
      (value: unknown) => {
        onCellCommit({ rowId: row.id, column, value });
      },
    [onCellCommit],
  );

  // ---- Resize: drag tracking ---------------------------------------------
  const [resizing, setResizing] = useState<{
    key: string;
    startX: number;
    startWidth: number;
  } | null>(null);
  const [liveWidths, setLiveWidths] = useState<Record<string, number>>({});
  const onResizeRef = useRef(onResizeColumn);
  onResizeRef.current = onResizeColumn;

  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - resizing.startX;
      setLiveWidths((prev) => ({
        ...prev,
        [resizing.key]: Math.max(60, resizing.startWidth + diff),
      }));
    };

    const handleMouseUp = (e: MouseEvent) => {
      const diff = e.clientX - resizing.startX;
      const finalWidth = Math.max(60, resizing.startWidth + diff);
      setLiveWidths((prev) => {
        const next = { ...prev };
        delete next[resizing.key];
        return next;
      });
      setResizing(null);
      onResizeRef.current?.(resizing.key, finalWidth);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizing]);

  // ---- Sort cycling -------------------------------------------------------
  const cycleSort = useCallback(
    (key: string) => {
      if (!onSort) return;
      if (sortKey !== key) {
        onSort(key, "asc");
      } else if (sortDir === "asc") {
        onSort(key, "desc");
      } else if (sortDir === "desc") {
        onSort(key, null);
      } else {
        onSort(key, "asc");
      }
    },
    [onSort, sortKey, sortDir],
  );

  // ---- Render a column header with sort + resize --------------------------
  const renderColumnHeader = useCallback(
    (col: ColumnDef) => {
      const key = col.key;
      const width = liveWidths[key] ?? col.width;
      const isSorted = sortKey === key;
      const indicator = isSorted
        ? sortDir === "asc"
          ? " \u2191"
          : " \u2193"
        : "";

      return (
        <th
          key={key}
          className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider relative select-none"
          style={width ? { width } : undefined}
        >
          <span
            className={onSort ? "cursor-pointer" : undefined}
            onClick={() => cycleSort(key)}
          >
            {col.label}
            {indicator}
          </span>
          {/* Resize handle */}
          {onResizeColumn && (
            <div
              className="absolute right-0 top-0 bottom-0 w-[4px] cursor-col-resize group/resize"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setResizing({
                  key,
                  startX: e.clientX,
                  startWidth: width ?? 150,
                });
              }}
            >
              <div className="w-[2px] mx-auto h-full bg-transparent group-hover/resize:bg-border/50 transition-colors" />
            </div>
          )}
        </th>
      );
    },
    [liveWidths, sortKey, sortDir, onSort, onResizeColumn, cycleSort],
  );

  // -- Loading skeleton -----------------------------------------------------
  if (loading) {
    return (
      <div className="w-full overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="w-10 px-2 py-2" />
              <LeadScoreHeader />
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.label}
                </th>
              ))}
              {onAddColumn && <th className="w-10 px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b">
                <td className="px-2 py-2">
                  <Skeleton className="h-4 w-4" />
                </td>
                <td className="px-1 py-2 text-center">
                  <Skeleton className="h-4 w-4 mx-auto rounded-full" />
                </td>
                {columns.map((col) => (
                  <td key={col.key} className="px-3 py-2">
                    <Skeleton className="h-4 w-full" />
                  </td>
                ))}
                {onAddColumn && <td className="px-2 py-2" />}
              </tr>
            ))}
          </tbody>
        </table>

        <MassActionBar
          count={count}
          selectedIds={selectedIds}
          actions={massActions}
          onClear={clear}
        />
      </div>
    );
  }

  // -- Empty state ----------------------------------------------------------
  if (rows.length === 0) {
    return (
      <div className="w-full overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="w-10 px-2 py-2">
                <Checkbox
                  checked={false}
                  disabled
                  aria-label="Selecionar todos"
                />
              </th>
              <LeadScoreHeader />
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.label}
                </th>
              ))}
              {onAddColumn && (
                <th className="w-10 px-2 py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onAddColumn}
                    className="h-6 w-6 p-0"
                    aria-label="Adicionar coluna"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td
                colSpan={columns.length + 2 + (onAddColumn ? 1 : 0)}
                className="px-3 py-8 text-center text-sm text-muted-foreground"
              >
                Nenhum registro encontrado.
              </td>
            </tr>
          </tbody>
        </table>

        <MassActionBar
          count={count}
          selectedIds={selectedIds}
          actions={massActions}
          onClear={clear}
        />
      </div>
    );
  }

  // -- Normal grid ----------------------------------------------------------
  const isAllSelected = rows.length > 0 && selectedIds.size === rows.length;
  const isIndeterminate =
    selectedIds.size > 0 && selectedIds.size < rows.length;

  return (
    <div className="w-full overflow-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b">
            <th className="w-10 px-2 py-2">
              <Checkbox
                checked={isAllSelected || (isIndeterminate ? "indeterminate" : false)}
                onCheckedChange={() => toggleAll()}
                aria-label="Selecionar todos"
              />
            </th>
            <LeadScoreHeader
              onSort={onSort}
              sortKey={sortKey}
              sortDir={sortDir}
              onResize={onResizeColumn}
            />
            {columns.map(renderColumnHeader)}
            {onAddColumn && (
              <th className="w-10 px-2 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onAddColumn}
                  className="h-6 w-6 p-0"
                  aria-label="Adicionar coluna"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={`border-b transition-colors ${
                isSelected(row.id) ? "bg-muted/50" : "hover:bg-muted/30"
              }`}
            >
              <td className="px-2 py-2">
                <Checkbox
                  checked={isSelected(row.id)}
                  onCheckedChange={() => toggle(row.id)}
                  aria-label={`Selecionar linha ${row.id}`}
                />
              </td>
              <td className="px-1 py-2 text-center">
                <LeadScoreBadge
                  score={(row._lead_score as number | null) ?? undefined}
                  breakdown={
                    row._lead_breakdown as LeadScoreBreakdown | undefined
                  }
                  size="sm"
                />
              </td>
              {columns.map((col) => {
                const value = row[col.key];
                return (
                  <td key={col.key} className="px-0 py-0">
                    <InlineCell
                      row={row}
                      column={col}
                      value={value}
                      onCommit={handleCellCommit(row, col)}
                      equipeId={equipeId}
                      fromTable={fromTable}
                    />
                  </td>
                );
              })}
              {onAddColumn && <td className="px-2 py-2" />}
            </tr>
          ))}
        </tbody>
      </table>

      <MassActionBar
        count={count}
        selectedIds={selectedIds}
        actions={massActions}
        onClear={clear}
      />
    </div>
  );
}
