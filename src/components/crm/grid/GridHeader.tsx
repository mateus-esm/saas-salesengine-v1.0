// Sprint 15 · T7 — the grid's one header, the same in the three states (loading,
// empty, data): same cells, same labels, same widths. Sort, resize and reorder
// only act once there are rows; selecting all needs rows too.

import { useEffect, useRef, useState } from "react";
import { Columns2, GripVertical, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { columnIcon } from "./columnTypes";
import { LEAD_SCORE_COL_KEY, stickyLeft, type StickySlot } from "./gridLayout";
import type { ColumnDef } from "./types";

export type GridState = "loading" | "empty" | "data";

// Header cells stick to the top above the body; the ones over sticky columns
// also stick to the left, above the other header cells.
const TH = "sticky top-0 z-20 h-9 border-b border-border bg-card text-xs font-medium text-foreground/70";
const TH_STICKY = "z-30";

export interface GridHeaderProps {
  state: GridState;
  columns: ColumnDef[];
  /** Every column, hidden ones included (the visibility menu). */
  allColumns: ColumnDef[];
  stickyCheckbox: StickySlot;
  stickyScore?: StickySlot;
  /** Set when the first rendered column is the primary one. */
  stickyPrimary?: StickySlot;
  showLeadScore: boolean;
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: () => void;
  sortKey?: string;
  sortDir?: "asc" | "desc" | null;
  onSort?: (key: string, dir: "asc" | "desc" | null) => void;
  onResizeLeadScore?: (key: string, width: number) => void;
  resizeEnabled: boolean;
  onStartResize: (key: string, startX: number, startWidth: number) => void;
  widthOf: (col: ColumnDef) => number;
  allowColumnReorder: boolean;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onAddColumn?: () => void;
  showColumnsMenu: boolean;
  hiddenColumns: string[];
  onToggleColumn: (key: string) => void;
  onResetLayout: () => void;
}

function nextSort(key: string, sortKey?: string, sortDir?: "asc" | "desc" | null): "asc" | "desc" | null {
  if (sortKey !== key) return "asc";
  if (sortDir === "asc") return "desc";
  if (sortDir === "desc") return null;
  return "asc";
}

function sortIndicator(key: string, sortKey?: string, sortDir?: "asc" | "desc" | null) {
  if (sortKey !== key) return "";
  return sortDir === "asc" ? " ↑" : sortDir === "desc" ? " ↓" : "";
}

function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      className="group/resize absolute bottom-0 right-0 top-0 w-[4px] cursor-col-resize"
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onMouseDown(e);
      }}
    >
      <div className="mx-auto h-full w-[2px] bg-transparent transition-colors group-hover/resize:bg-border" />
    </div>
  );
}

function LeadScoreHeader({
  slot,
  interactive,
  sortKey,
  sortDir,
  onSort,
  onResize,
}: {
  slot?: StickySlot;
  interactive: boolean;
  sortKey?: string;
  sortDir?: "asc" | "desc" | null;
  onSort?: (key: string, dir: "asc" | "desc" | null) => void;
  onResize?: (key: string, w: number) => void;
}) {
  const [resizing, setResizing] = useState<{ startX: number; startWidth: number } | null>(null);
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

  const sticky = slot ? stickyLeft(slot) : null;
  const sortable = interactive && !!onSort;
  return (
    <th className={cn(TH, sticky?.className, sticky && TH_STICKY, "select-none px-1 text-center")} style={sticky?.style}>
      <span
        className={sortable ? "cursor-pointer" : undefined}
        onClick={() => sortable && onSort?.(LEAD_SCORE_COL_KEY, nextSort(LEAD_SCORE_COL_KEY, sortKey, sortDir))}
      >
        Score{sortIndicator(LEAD_SCORE_COL_KEY, sortKey, sortDir)}
      </span>
      {interactive && <ResizeHandle onMouseDown={(e) => setResizing({ startX: e.clientX, startWidth: 64 })} />}
    </th>
  );
}

export function GridHeader({
  state,
  columns,
  allColumns,
  stickyCheckbox,
  stickyScore,
  stickyPrimary,
  showLeadScore,
  allSelected,
  someSelected,
  onToggleAll,
  sortKey,
  sortDir,
  onSort,
  onResizeLeadScore,
  resizeEnabled,
  onStartResize,
  widthOf,
  allowColumnReorder,
  onReorder,
  onAddColumn,
  showColumnsMenu,
  hiddenColumns,
  onToggleColumn,
  onResetLayout,
}: GridHeaderProps) {
  const interactive = state === "data";
  const reorder = interactive && allowColumnReorder;
  const [dragCol, setDragCol] = useState<{ key: string; index: number } | null>(null);
  const checkbox = stickyLeft(stickyCheckbox);

  return (
    <thead>
      <tr>
        <th className={cn(TH, checkbox.className, TH_STICKY, "px-3")} style={checkbox.style}>
          <Checkbox
            checked={allSelected || (someSelected ? "indeterminate" : false)}
            onCheckedChange={() => onToggleAll()}
            disabled={!interactive}
            aria-label="Selecionar todos"
          />
        </th>
        {showLeadScore && (
          <LeadScoreHeader
            slot={stickyScore}
            interactive={interactive}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            onResize={onResizeLeadScore}
          />
        )}
        {columns.map((col, index) => {
          const Icon = columnIcon(col.kind);
          const sticky = index === 0 && stickyPrimary ? stickyLeft(stickyPrimary) : null;
          const sortable = interactive && !!onSort;
          return (
            <th
              key={col.key}
              className={cn(
                TH,
                sticky?.className,
                sticky && TH_STICKY,
                "group/th select-none px-3 text-left",
                reorder && "cursor-grab",
                dragCol?.key === col.key && "opacity-50",
              )}
              style={sticky?.style}
              draggable={reorder}
              onDragStart={(e) => {
                if (!reorder) return;
                setDragCol({ key: col.key, index });
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (!reorder || !dragCol) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                if (!reorder || !dragCol) return;
                e.preventDefault();
                if (dragCol.index !== index) onReorder(dragCol.index, index);
                setDragCol(null);
              }}
              onDragEnd={() => setDragCol(null)}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                {reorder && (
                  <GripVertical className="-ml-1 h-3 w-3 shrink-0 opacity-0 group-hover/th:opacity-40" />
                )}
                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span
                  className={cn("truncate", sortable && "cursor-pointer")}
                  title={col.label}
                  onClick={() => sortable && onSort?.(col.key, nextSort(col.key, sortKey, sortDir))}
                >
                  {col.label}
                  {sortIndicator(col.key, sortKey, sortDir)}
                </span>
              </span>
              {interactive && resizeEnabled && (
                <ResizeHandle onMouseDown={(e) => onStartResize(col.key, e.clientX, widthOf(col))} />
              )}
            </th>
          );
        })}
        {onAddColumn && (
          <th className={cn(TH, "px-2 text-center")}>
            {state !== "loading" && (
              <Button variant="ghost" size="sm" onClick={onAddColumn} className="h-6 w-6 p-0" aria-label="Adicionar coluna">
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </th>
        )}
        {showColumnsMenu && (
          <th className={cn(TH, "px-2 text-center")}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground"
                  title="Visibilidade de colunas"
                  aria-label="Colunas"
                >
                  <Columns2 className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Colunas</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {allColumns.map((col) => (
                  <DropdownMenuCheckboxItem
                    key={col.key}
                    checked={!hiddenColumns.includes(col.key)}
                    onCheckedChange={() => onToggleColumn(col.key)}
                  >
                    {col.label}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onResetLayout()}>Restaurar layout</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </th>
        )}
        {/* Filler: the width left over to the right edge. */}
        <th className={TH} aria-hidden="true" />
      </tr>
    </thead>
  );
}
