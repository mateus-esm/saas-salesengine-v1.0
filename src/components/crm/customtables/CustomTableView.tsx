import { useMemo, useState } from "react";
import { ArrowLeft, Plus, Settings2, Grip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SpreadsheetGrid } from "@/components/crm/grid/SpreadsheetGrid";
import { useCustomTableRecords } from "@/hooks/useCustomTableRecords";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useCustomTables, type CustomTable, type CustomTableColumn } from "@/hooks/useCustomTables";
import type { ColumnDef, CellMutation } from "@/components/crm/grid/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CustomTableViewProps {
  table: CustomTable;
  onBack: () => void;
}

export function CustomTableView({ table, onBack }: CustomTableViewProps) {
  const { profile } = useAuth();
  const { records, isLoading, createRecord, updateRecord } =
    useCustomTableRecords(table.id);
  const { updateTable } = useCustomTables();

  // Column editor state
  const [colEditorOpen, setColEditorOpen] = useState(false);
  const [newColKey, setNewColKey] = useState("");
  const [newColLabel, setNewColLabel] = useState("");
  const [newColType, setNewColType] = useState<CustomTableColumn["type"]>("text");

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

  const handleAddColumn = async () => {
    if (!newColKey.trim()) return;
    const key = newColKey.trim().toLowerCase().replace(/\s+/g, "_");
    await updateTable.mutateAsync({
      id: table.id,
      table_schema: [
        ...table.table_schema,
        { key, label: newColLabel.trim() || key, type: newColType },
      ],
    });
    setNewColKey("");
    setNewColLabel("");
    setNewColType("text");
  };

  const handleRemoveColumn = async (key: string) => {
    await updateTable.mutateAsync({
      id: table.id,
      table_schema: table.table_schema.filter((c) => c.key !== key),
    });
  };

  const handleAddRow = async () => {
    await createRecord.mutateAsync({ table_id: table.id, data: {} });
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
        <div className="ml-auto flex items-center gap-2">
          <Popover open={colEditorOpen} onOpenChange={setColEditorOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings2 className="mr-1 h-3 w-3" /> Colunas
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Colunas</h4>
                {table.table_schema.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nenhuma coluna ainda.
                  </p>
                )}
                {table.table_schema.map((col) => (
                  <div
                    key={col.key}
                    className="flex items-center justify-between rounded border border-border px-3 py-1.5 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <Grip className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{col.label}</span>
                      <span className="text-[10px] text-muted-foreground uppercase">
                        {col.type}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => handleRemoveColumn(col.key)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
                <div className="border-t border-border pt-2 space-y-2">
                  <h5 className="text-xs font-medium">Nova coluna</h5>
                  <Input
                    placeholder="Chave (ex: email)"
                    value={newColKey}
                    onChange={(e) => setNewColKey(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Input
                    placeholder="Rótulo (ex: E-mail)"
                    value={newColLabel}
                    onChange={(e) => setNewColLabel(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Select
                    value={newColType}
                    onValueChange={(v) =>
                      setNewColType(v as CustomTableColumn["type"])
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Texto</SelectItem>
                      <SelectItem value="number">Número</SelectItem>
                      <SelectItem value="date">Data</SelectItem>
                      <SelectItem value="boolean">Sim/Não</SelectItem>
                      <SelectItem value="select">Seleção</SelectItem>
                      <SelectItem value="relation">Relação</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="w-full h-8 text-xs"
                    onClick={handleAddColumn}
                    disabled={!newColKey.trim()}
                  >
                    Adicionar coluna
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" onClick={handleAddRow}>
            <Plus className="mr-1 h-3 w-3" /> Linha
          </Button>
        </div>
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
