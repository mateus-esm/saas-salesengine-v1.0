import { useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { ColumnDef, CellMutation, GridRow } from "./types";
import { InlineCell } from "./InlineCell";
import { MassActionBar, type MassAction } from "./MassActionBar";
import { useGridSelection } from "./useGridSelection";
import { ICPScoreBadge } from "../ICPScoreBadge";
import { VelocityScoreBadge } from "../VelocityScoreBadge";

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

  // -- Loading skeleton -----------------------------------------------------
  if (loading) {
    return (
      <div className="w-full overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="w-10 px-2 py-2" />
              <th className="w-16 px-1 py-2 text-[10px] font-mono text-muted-foreground text-center">
                ICP Vel
              </th>
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
                <td className="px-1 py-2">
                  <Skeleton className="h-4 w-14 mx-auto" />
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
              <th className="w-16 px-1 py-2 text-[10px] font-mono text-muted-foreground text-center">
                ICP Vel
              </th>
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
            <th className="w-16 px-1 py-2 text-[10px] font-mono text-muted-foreground text-center">
              ICP Vel
            </th>
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
              <td className="px-1 py-2">
                <div className="flex items-center gap-1">
                  <ICPScoreBadge score={(row._icp_score as number | null) ?? null} />
                  <VelocityScoreBadge velocity={(row._velocity as number | null) ?? null} />
                </div>
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
