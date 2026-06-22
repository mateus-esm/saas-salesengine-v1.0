import { useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SpreadsheetGrid } from "@/components/crm/grid/SpreadsheetGrid";
import { useCustomTableRecords } from "@/hooks/useCustomTableRecords";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
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

    // Relation columns write to custom_table_links bridge, not JSONB data
    if (m.column.kind === "relation") {
      const linkVal = m.value as { toId?: string; action?: string } | null;
      if (!linkVal?.toId) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      if (linkVal.action === "remove") {
        await sb
          .from("custom_table_links")
          .delete()
          .eq("from_table", table.slug)
          .eq("from_id", m.rowId)
          .eq("relation_key", m.column.key)
          .eq("to_id", linkVal.toId)
          .execute();
      } else {
        await sb.from("custom_table_links").insert({
          from_table: table.slug,
          from_id: m.rowId,
          relation_key: m.column.key,
          to_id: linkVal.toId,
          equipe_id: profile?.equipe_id,
        }).execute();
      }
      return;
    }

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
