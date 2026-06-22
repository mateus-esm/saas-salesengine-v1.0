import { useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SpreadsheetGrid } from "@/components/crm/grid/SpreadsheetGrid";
import { useCustomTableRecords } from "@/hooks/useCustomTableRecords";
import { useAuth } from "@/contexts/AuthContext";
import type { CustomTable, CustomTableColumn } from "@/hooks/useCustomTables";
import type { ColumnDef, CellMutation } from "@/components/crm/grid/types";

interface CustomTableViewProps {
  table: CustomTable;
  onBack: () => void;
}

export function CustomTableView({ table, onBack }: CustomTableViewProps) {
  const { profile } = useAuth();
  const { records, isLoading, createRecord, updateRecord } =
    useCustomTableRecords(table.id);

  const columns = useMemo(() => {
    return table.table_schema.map((col: CustomTableColumn): ColumnDef => ({
      key: col.key,
      label: col.label,
      kind: col.type as ColumnDef["kind"],
      source: "jsonb",
      jsonbField: "data",
      editable: true,
    }));
  }, [table.table_schema]);

  const rows = useMemo(() => {
    return records.map((r) => ({
      id: r.id,
      equipe_id: profile?.equipe_id ?? "",
      ...(r.data as Record<string, unknown>),
    }));
  }, [records, profile?.equipe_id]);

  const handleCellCommit = async (m: CellMutation) => {
    const record = records.find((r) => r.id === m.rowId);
    if (!record) return;
    const existing = { ...(record.data as Record<string, unknown>) };
    existing[m.column.key] = m.value;
    await updateRecord.mutateAsync({
      id: m.rowId,
      data: existing,
    });
  };

  // No mass actions for now
  const massActions = [];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
        </Button>
        <h2 className="text-lg font-semibold">{table.name}</h2>
      </div>
      <SpreadsheetGrid
        rows={rows}
        columns={columns}
        onCellCommit={handleCellCommit}
        massActions={massActions}
        loading={isLoading}
        equipeId={profile?.equipe_id ?? ""}
        fromTable={table.slug}
      />
    </div>
  );
}
