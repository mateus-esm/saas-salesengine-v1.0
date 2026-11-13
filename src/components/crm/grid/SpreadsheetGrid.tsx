import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Inbox } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useColumnLayout } from "@/hooks/useColumnLayout";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

import { LeadScoreBadge } from "../LeadScoreBadge";
import type { LeadScoreBreakdown } from "../LeadScoreBadge";
import { GridHeader, type GridState } from "./GridHeader";
import { ACTION_W, CHECKBOX_W, DEFAULT_W, PRIMARY_W, SCORE_W, stickyLeft, type StickySlot } from "./gridLayout";
import { InlineCell } from "./InlineCell";
import { MassActionBar, type MassAction } from "./MassActionBar";
import { MobileRowList } from "./MobileRowList";
import type { ColumnDef, CellMutation, GridRow } from "./types";
import { useGridSelection } from "./useGridSelection";

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
  // Sprint 6.9.1 W6 — grid capabilities
  showLeadScore?: boolean;
  allowColumnReorder?: boolean;
  allowColumnResize?: boolean;
  allowColumnHide?: boolean;
  allowColumnCreate?: boolean;
  surfaceKey?: string;
  onReorderColumn?: (fromIndex: number, toIndex: number) => void;
  /** Column visibility toggle callback: (key) => void */
  onToggleColumn?: (key: string) => void;
  // Sprint 11 · Onda 2 — server pages + open the record
  /** The primary column (ColumnDef.primary) opens the record. */
  onRowOpen?: (rowId: string) => void;
  /** Infinite scroll: a sentinel under the last row asks for the next page. */
  hasMore?: boolean;
  loadingMore?: boolean;
  onEndReached?: () => void;
  /**
   * Sprint 11 · T26 — below 768 px the grid becomes a list and each row is
   * drawn by this (the screen knows which facts matter). Omit to keep the grid.
   */
  renderMobileRow?: (row: GridRow) => ReactNode;
  /** Shown by the mobile list when there are no rows. */
  mobileEmptyLabel?: string;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

// Sprint 15 · T7 — the table has a fixed layout: each column's width comes from
// the colgroup (widths in gridLayout.ts), never from its content, so columns
// don't jump between pages.

// A sticky body cell is opaque (the columns scroll under it). The row's tint
// (selected / hover) is redrawn on it by an overlay under its content.
const STICKY_TD =
  "z-[1] bg-card before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:content-['']";
const TD = "overflow-hidden border-b border-border p-0";

function countLabel(n: number, hasMore: boolean): string {
  if (hasMore) return `${n}+ registros`;
  return `${n} ${n === 1 ? "registro" : "registros"}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function DesktopGrid({
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
  showLeadScore = false,
  allowColumnReorder = false,
  allowColumnResize = true,
  allowColumnHide = false,
  allowColumnCreate = true,
  surfaceKey,
  onReorderColumn,
  onToggleColumn: _onToggleColumn,
  onRowOpen,
  hasMore = false,
  loadingMore = false,
  onEndReached,
}: SpreadsheetGridProps) {
  const allIds = rows.map((r) => r.id);
  const { selectedIds, isSelected, toggle, toggleAll, clear, count } = useGridSelection(allIds);

  // ---- Internal layout management ----------------------------------------
  // Hook is always called (React rules); results only applied when surfaceKey set.
  const columnLayout = useColumnLayout(columns, surfaceKey ?? "_noop_");
  const {
    visibleColumns: layoutVisibleColumns,
    resizeColumn: layoutResizeColumn,
    reorderColumn: layoutReorderColumn,
    toggleColumn: layoutToggleColumn,
    resetLayout: layoutResetLayout,
    hiddenColumns: layoutHiddenColumns,
  } = columnLayout;

  const layoutEnabled = !!surfaceKey;
  const renderColumns = layoutEnabled ? layoutVisibleColumns : columns;
  const showColumnsMenu = layoutEnabled && allowColumnHide;
  const addColumn = allowColumnCreate ? onAddColumn : undefined;

  // The promise goes back to the cell, which shows a failed save on itself.
  const handleCellCommit = useCallback(
    (row: GridRow, column: ColumnDef) => (value: unknown) => onCellCommit({ rowId: row.id, column, value }),
    [onCellCommit],
  );

  const state: GridState = loading ? "loading" : rows.length === 0 ? "empty" : "data";

  // ---- Infinite scroll ----------------------------------------------------
  // The grid root is the scroll container. While it actually scrolls, it is the
  // observer root, so the 400px margin preloads before the end of the grid; when
  // its height is not bounded (it grows with the rows) the viewport is the root,
  // as before — a root that never clips would see the sentinel at every page and
  // load them all.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLTableRowElement | null>(null);
  const onEndReachedRef = useRef(onEndReached);
  onEndReachedRef.current = onEndReached;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loadingMore || typeof IntersectionObserver === "undefined") return;
    const container = rootRef.current;
    const scrolls = !!container && container.scrollHeight > container.clientHeight + 1;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onEndReachedRef.current?.();
      },
      { root: scrolls ? container : null, rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // `state`: the sentinel row unmounts in the loading and empty states and is a
    // new element when it comes back, so the observer has to attach again.
  }, [hasMore, loadingMore, rows.length, state]);

  // ---- Resize: drag tracking ---------------------------------------------
  const [resizing, setResizing] = useState<{ key: string; startX: number; startWidth: number } | null>(null);
  const [liveWidths, setLiveWidths] = useState<Record<string, number>>({});

  // Combined resize ref: routes to internal layout or external callback
  const onResizeRef = useRef<((key: string, w: number) => void) | undefined>(undefined);
  onResizeRef.current = layoutEnabled ? layoutResizeColumn : onResizeColumn;

  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - resizing.startX;
      setLiveWidths((prev) => ({ ...prev, [resizing.key]: Math.max(60, resizing.startWidth + diff) }));
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

  // Combined reorder: routes to internal layout or external callback
  const handleReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (layoutEnabled) layoutReorderColumn(fromIndex, toIndex);
      else onReorderColumn?.(fromIndex, toIndex);
    },
    [layoutEnabled, layoutReorderColumn, onReorderColumn],
  );

  const resizeEnabled = allowColumnResize && (layoutEnabled || !!onResizeColumn);

  // ---- Widths and sticky columns -----------------------------------------
  const widthOf = (col: ColumnDef) => liveWidths[col.key] ?? col.width ?? (col.primary ? PRIMARY_W : DEFAULT_W);
  // The primary column sticks only while it is the first one (the user may move it).
  const primaryFirst = !!renderColumns[0]?.primary;
  const stickyCheckbox: StickySlot = { left: 0, last: !showLeadScore && !primaryFirst };
  const stickyScore: StickySlot | undefined = showLeadScore
    ? { left: CHECKBOX_W, last: !primaryFirst }
    : undefined;
  const stickyPrimary: StickySlot | undefined = primaryFirst
    ? { left: CHECKBOX_W + (showLeadScore ? SCORE_W : 0), last: true }
    : undefined;
  const tableWidth =
    CHECKBOX_W +
    (showLeadScore ? SCORE_W : 0) +
    renderColumns.reduce((sum, col) => sum + widthOf(col), 0) +
    (addColumn ? ACTION_W : 0) +
    (showColumnsMenu ? ACTION_W : 0);
  // +1 for the checkbox, +1 for the filler.
  const colSpan = renderColumns.length + 2 + (showLeadScore ? 1 : 0) + (addColumn ? 1 : 0) + (showColumnsMenu ? 1 : 0);

  const isAllSelected = rows.length > 0 && selectedIds.size === rows.length;
  const isIndeterminate = selectedIds.size > 0 && selectedIds.size < rows.length;

  /** A body cell, sticky when its column is; `tint` is the row's state on it. */
  const stickyTd = (slot: StickySlot | undefined, tint: string, extra?: string) => {
    if (!slot) return { className: cn(TD, extra), style: undefined };
    const sticky = stickyLeft(slot);
    return { className: cn(TD, sticky.className, STICKY_TD, tint, extra), style: sticky.style };
  };

  // The filler column takes the width left over to the right edge, so the
  // fixed columns keep their widths and the row runs to the edge.
  const trailingCells = (
    <>
      {addColumn && <td className={TD} />}
      {showColumnsMenu && <td className={TD} />}
      <td className={TD} aria-hidden="true" />
    </>
  );

  const renderRow = (row: GridRow) => {
    const selected = isSelected(row.id);
    const tint = selected ? "before:bg-primary/5" : "group-hover/row:before:bg-muted/60";
    const checkboxTd = stickyTd(stickyCheckbox, tint, "px-3");
    const scoreTd = stickyTd(stickyScore, tint, "px-1 text-center");
    return (
      <tr
        key={row.id}
        className={cn("group/row h-10 text-sm transition-colors", selected ? "bg-primary/5" : "hover:bg-muted/60")}
      >
        <td className={checkboxTd.className} style={checkboxTd.style}>
          <Checkbox checked={selected} onCheckedChange={() => toggle(row.id)} aria-label={`Selecionar linha ${row.id}`} />
        </td>
        {showLeadScore && (
          <td className={scoreTd.className} style={scoreTd.style}>
            <LeadScoreBadge
              score={(row._lead_score as number | null) ?? undefined}
              breakdown={row._lead_breakdown as LeadScoreBreakdown | undefined}
              size="sm"
            />
          </td>
        )}
        {renderColumns.map((col, index) => {
          const cell = stickyTd(index === 0 ? stickyPrimary : undefined, tint);
          return (
            <td key={col.key} className={cell.className} style={cell.style}>
              <InlineCell
                row={row}
                column={col}
                value={row[col.key]}
                onCommit={handleCellCommit(row, col)}
                equipeId={equipeId}
                fromTable={fromTable}
                onOpen={col.primary && onRowOpen ? () => onRowOpen(row.id) : undefined}
              />
            </td>
          );
        })}
        {trailingCells}
      </tr>
    );
  };

  const renderSkeletonRow = (i: number) => {
    const checkboxTd = stickyTd(stickyCheckbox, "", "px-3");
    const scoreTd = stickyTd(stickyScore, "", "px-1");
    return (
      <tr key={i} className="h-10">
        <td className={checkboxTd.className} style={checkboxTd.style}>
          <Skeleton className="h-4 w-4" />
        </td>
        {showLeadScore && (
          <td className={scoreTd.className} style={scoreTd.style}>
            <Skeleton className="mx-auto h-4 w-4 rounded-full" />
          </td>
        )}
        {renderColumns.map((col, index) => {
          const cell = stickyTd(index === 0 ? stickyPrimary : undefined, "", "px-3");
          return (
            <td key={col.key} className={cell.className} style={cell.style}>
              <Skeleton className="h-4 w-full" />
            </td>
          );
        })}
        {trailingCells}
      </tr>
    );
  };

  return (
    <div ref={rootRef} className="relative h-full min-h-0 overflow-auto rounded-lg border border-border bg-card">
      <table className="min-w-full table-fixed border-separate border-spacing-0" style={{ width: tableWidth }}>
        <colgroup>
          <col style={{ width: CHECKBOX_W }} />
          {showLeadScore && <col style={{ width: SCORE_W }} />}
          {renderColumns.map((col) => (
            <col key={col.key} style={{ width: widthOf(col) }} />
          ))}
          {addColumn && <col style={{ width: ACTION_W }} />}
          {showColumnsMenu && <col style={{ width: ACTION_W }} />}
          <col />
        </colgroup>
        <GridHeader
          state={state}
          columns={renderColumns}
          allColumns={columns}
          stickyCheckbox={stickyCheckbox}
          stickyScore={stickyScore}
          stickyPrimary={stickyPrimary}
          showLeadScore={showLeadScore}
          allSelected={isAllSelected}
          someSelected={isIndeterminate}
          onToggleAll={toggleAll}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
          resizeEnabled={resizeEnabled}
          onStartResize={(key, startX, startWidth) => setResizing({ key, startX, startWidth })}
          widthOf={widthOf}
          allowColumnReorder={allowColumnReorder}
          onReorder={handleReorder}
          onAddColumn={addColumn}
          showColumnsMenu={showColumnsMenu}
          hiddenColumns={layoutHiddenColumns}
          onToggleColumn={layoutToggleColumn}
          onResetLayout={layoutResetLayout}
        />
        <tbody>
          {state === "loading" && Array.from({ length: 5 }).map((_, i) => renderSkeletonRow(i))}
          {state === "data" && rows.map(renderRow)}
          {state === "data" && (hasMore || loadingMore) && (
            <tr ref={sentinelRef} aria-hidden={!loadingMore}>
              <td colSpan={colSpan} className="px-3 py-3 text-center text-xs text-muted-foreground">
                {loadingMore ? "Carregando mais…" : ""}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {state === "empty" && (
        <div className="sticky left-0 flex w-full flex-col items-center gap-2 px-4 py-16 text-sm text-muted-foreground">
          <Inbox className="h-8 w-8" aria-hidden />
          Nenhum registro encontrado.
        </div>
      )}

      <div className="sticky bottom-0 left-0 z-20 flex h-9 w-full items-center border-t border-border bg-card px-3 text-xs text-muted-foreground">
        {state === "loading" ? null : countLabel(rows.length, hasMore)}
      </div>

      <MassActionBar count={count} selectedIds={selectedIds} actions={massActions} onClear={clear} />
    </div>
  );
}

/**
 * The spreadsheet on a desktop; on a phone, when the screen gives a row
 * renderer, a list (MobileRowList) — same rows, same paging, a tap opens.
 */
export function SpreadsheetGrid(props: SpreadsheetGridProps) {
  const isMobile = useIsMobile();
  if (isMobile && props.renderMobileRow) {
    return (
      <MobileRowList
        rows={props.rows}
        renderRow={props.renderMobileRow}
        onRowOpen={props.onRowOpen}
        loading={props.loading}
        hasMore={props.hasMore}
        loadingMore={props.loadingMore}
        onEndReached={props.onEndReached}
        emptyLabel={props.mobileEmptyLabel}
      />
    );
  }
  return <DesktopGrid {...props} />;
}
