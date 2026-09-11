import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus, Settings2, Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GridToolbar } from "@/components/crm/grid/GridToolbar";
import type { MassAction } from "@/components/crm/grid/MassActionBar";
import { SpreadsheetGrid } from "@/components/crm/grid/SpreadsheetGrid";
import type { CellMutation, ColumnDef, GridRow } from "@/components/crm/grid/types";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  customTableKeys,
  useCustomTableRecords,
  useCustomTableRelations,
} from "@/hooks/useCustomTableRecords";
import {
  useCustomTables,
  type CustomTable,
  type CustomTableColumn,
  type CustomTableColumnType,
} from "@/hooks/useCustomTables";
import { useMemberDirectory } from "@/hooks/useMemberDirectory";
import { activeColumns, newColumnKey, type RelationChips } from "@/lib/customTables";
import { columnFromField } from "@/lib/fields/columns";

import { CustomRecordDrawer } from "./CustomRecordDrawer";

const sb = supabase as any;

const COLUMN_TYPES: { value: CustomTableColumnType; label: string }[] = [
  { value: "text", label: "Texto" },
  { value: "number", label: "Número" },
  { value: "currency", label: "Moeda (R$)" },
  { value: "date", label: "Data" },
  { value: "boolean", label: "Sim/Não" },
  { value: "select", label: "Seleção" },
  { value: "multi_select", label: "Multi-seleção" },
  { value: "url", label: "URL" },
  { value: "phone", label: "Telefone" },
  { value: "user", label: "Usuário (membro da equipe)" },
  { value: "relation", label: "Relação (outra tabela)" },
];
const TYPE_LABEL = Object.fromEntries(COLUMN_TYPES.map((t) => [t.value, t.label])) as Record<string, string>;

interface CustomTableViewProps {
  table: CustomTable;
  onBack: () => void;
}

/**
 * Sprint 5.3 T15 / Sprint 11 · T21 — a custom table in the same pattern as the
 * CRM tables: full height, a grid cell per field type (the registry), the first
 * column opens the record, rows deleted one or many, every record (no 1,000 cap)
 * and relation chips resolved per column instead of per cell.
 */
export function CustomTableView({ table, onBack }: CustomTableViewProps) {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id ?? "";
  const queryClient = useQueryClient();
  const { nameOf } = useMemberDirectory();
  const { tables, updateTable } = useCustomTables();
  const { records, isLoading, createRecord, updateRecord, deleteRecords } = useCustomTableRecords(table.id);

  const visible = useMemo(() => activeColumns(table.table_schema), [table.table_schema]);
  const relations = useCustomTableRelations(table, visible);
  const recordById = useMemo(() => new Map(records.map((r) => [r.id, r])), [records]);

  const [search, setSearch] = useState("");
  const [openRecordId, setOpenRecordId] = useState<string | null>(null);
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[]>([]);

  // ---- Columns --------------------------------------------------------------
  const columns: ColumnDef[] = useMemo(() => {
    const primaryKey = visible.find((c) => c.type !== "relation")?.key;
    return visible.map((col): ColumnDef => {
      if (col.type === "relation") {
        return {
          key: col.key,
          label: col.label,
          kind: "relation",
          source: "jsonb",
          jsonbField: "data",
          relation: {
            table: col.relationConfig?.targetTableSlug ?? "",
            displayField: col.relationConfig?.displayField ?? "name",
            targetTableId: col.relationConfig?.targetTableId,
            resolvedFromRow: true,
          },
        };
      }
      const def = columnFromField(col, "data", "key", { nameOf });
      return col.key === primaryKey ? { ...def, primary: true, width: 200 } : def;
    });
  }, [visible, nameOf]);

  // ---- Rows -----------------------------------------------------------------
  const allRows: GridRow[] = useMemo(
    () =>
      records.map((r) => {
        const row: GridRow = { id: r.id, equipe_id: equipeId, ...(r.data ?? {}) };
        for (const [key, byRow] of Object.entries(relations)) row[key] = byRow[r.id] ?? [];
        return row;
      }),
    [records, relations, equipeId],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter((row) =>
      Object.values(row).some((v) =>
        typeof v === "string"
          ? v.toLowerCase().includes(q)
          : Array.isArray(v) && v.some((c) => typeof c?.name === "string" && c.name.toLowerCase().includes(q)),
      ),
    );
  }, [allRows, search]);

  // ---- Cell commit ----------------------------------------------------------
  const handleCellCommit = useCallback(
    async (m: CellMutation) => {
      const record = recordById.get(m.rowId);
      if (!record) return;

      if (m.column.kind === "relation") {
        const link = m.value as { toId?: string; label?: string; action?: string } | null;
        if (!link?.toId) return;
        const relKey = customTableKeys.relation(table.id, m.column.key);
        const current = (relations[m.column.key]?.[m.rowId] ?? []) as RelationChips;
        const remove = link.action === "remove";
        if (!remove && current.some((c) => c.id === link.toId)) return;

        const previous = queryClient.getQueryData<Record<string, RelationChips>>(relKey);
        queryClient.setQueryData<Record<string, RelationChips>>(relKey, (byRow) => ({
          ...(byRow ?? {}),
          [m.rowId]: remove
            ? current.filter((c) => c.id !== link.toId)
            : [...current, { id: link.toId!, name: link.label ?? "[registro]" }],
        }));

        // Links are soft-deleted (the opportunity_links pattern); to_table holds
        // the target custom table's id.
        const { error } = remove
          ? await sb
              .from("custom_table_links")
              .update({ deleted_at: new Date().toISOString() })
              .eq("equipe_id", equipeId)
              .eq("from_table", table.slug)
              .eq("from_id", m.rowId)
              .eq("relation_key", m.column.key)
              .eq("to_id", link.toId)
              .is("deleted_at", null)
          : await sb.from("custom_table_links").insert({
              equipe_id: equipeId,
              from_table: table.slug,
              from_id: m.rowId,
              to_table: m.column.relation?.targetTableId ?? m.column.relation?.table ?? "",
              to_id: link.toId,
              relation_key: m.column.key,
            });
        if (error) {
          queryClient.setQueryData(relKey, previous);
          throw new Error(error.message);
        }
        return;
      }

      await updateRecord.mutateAsync({ id: m.rowId, data: { ...(record.data ?? {}), [m.column.key]: m.value } });
    },
    [recordById, relations, queryClient, table.id, table.slug, equipeId, updateRecord],
  );

  // ---- Rows: add, delete ----------------------------------------------------
  const handleAddRow = async () => {
    try {
      const created = await createRecord.mutateAsync({});
      setOpenRecordId(created.id);
    } catch {
      // the hook shows the error
    }
  };

  const massActions: MassAction[] = useMemo(
    () => [
      {
        id: "delete",
        label: "Excluir",
        icon: <Trash2 className="mr-1 h-4 w-4" />,
        run: async (ids) => setConfirmDeleteIds(ids),
        destructive: true,
      },
    ],
    [],
  );

  const openRecord = openRecordId ? recordById.get(openRecordId) ?? null : null;

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
          </Button>
          <h2 className="truncate text-lg font-semibold">{table.name}</h2>
          <span className="text-sm text-muted-foreground">
            {records.length.toLocaleString("pt-BR")} {records.length === 1 ? "registro" : "registros"}
          </span>
        </div>

        <GridToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar..."
          filters={[]}
          onClearFilters={() => {}}
          activeFilterCount={0}
        >
          <ColumnsEditor
            table={table}
            otherTables={tables.filter((t) => t.id !== table.id)}
            onChange={(table_schema) => updateTable.mutateAsync({ id: table.id, table_schema })}
            saving={updateTable.isPending}
          />
          <Button variant="outline" size="sm" onClick={handleAddRow} disabled={createRecord.isPending}>
            {createRecord.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />}
            Linha
          </Button>
        </GridToolbar>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <SpreadsheetGrid
          rows={rows}
          columns={columns}
          onCellCommit={handleCellCommit}
          massActions={massActions}
          loading={isLoading}
          equipeId={equipeId}
          fromTable={table.slug}
          surfaceKey={`custom_table_${table.id}`}
          allowColumnReorder
          allowColumnResize
          allowColumnHide
          onRowOpen={setOpenRecordId}
        />
      </div>

      <CustomRecordDrawer
        record={openRecord}
        columns={visible}
        relations={relations}
        onClose={() => setOpenRecordId(null)}
        onSave={(id, data) => updateRecord.mutateAsync({ id, data })}
        onDelete={(id) => deleteRecords.mutate([id])}
      />

      <AlertDialog open={confirmDeleteIds.length > 0} onOpenChange={(o) => !o && setConfirmDeleteIds([])}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Excluir {confirmDeleteIds.length} {confirmDeleteIds.length === 1 ? "registro" : "registros"}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteRecords.mutate(confirmDeleteIds);
                setConfirmDeleteIds([]);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Columns editor
// ---------------------------------------------------------------------------

interface ColumnsEditorProps {
  table: CustomTable;
  otherTables: CustomTable[];
  onChange: (schema: CustomTableColumn[]) => Promise<unknown>;
  saving: boolean;
}

/**
 * A new column asks only for its label and type (plus options, or the target
 * table). The key is born from the label and never edited — the same contract as
 * the pipeline's fields. Removing a column hides it; its values stay stored.
 */
function ColumnsEditor({ table, otherTables, onChange, saving }: ColumnsEditorProps) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomTableColumnType>("text");
  const [options, setOptions] = useState("");
  const [targetTableId, setTargetTableId] = useState("");
  const [displayField, setDisplayField] = useState("");

  const visible = activeColumns(table.table_schema);
  const target = otherTables.find((t) => t.id === targetTableId);
  const targetFields = target ? activeColumns(target.table_schema).filter((c) => c.type !== "relation") : [];

  const reset = () => {
    setLabel("");
    setType("text");
    setOptions("");
    setTargetTableId("");
    setDisplayField("");
  };

  const canAdd =
    !!label.trim() && (type !== "relation" || !!target) && !((type === "select" || type === "multi_select") && !options.trim());

  const handleAdd = async () => {
    if (!canAdd) return;
    const column: CustomTableColumn = {
      key: newColumnKey(table.table_schema, label.trim()),
      label: label.trim(),
      type,
    };
    if (type === "select" || type === "multi_select") {
      column.options = options
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);
    }
    if (type === "relation" && target) {
      column.relationConfig = {
        targetTable: target.name,
        targetTableSlug: target.slug,
        targetTableId: target.id,
        displayField: displayField || targetFields[0]?.key || "name",
      };
    }
    try {
      await onChange([...table.table_schema, column]);
      reset();
    } catch {
      // the hook shows the error
    }
  };

  const handleRemove = (key: string) =>
    onChange(table.table_schema.map((c) => (c.key === key ? { ...c, is_deleted: true } : c))).catch(() => {});

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="mr-1 h-3 w-3" /> Colunas
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Colunas</h4>
          {visible.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma coluna ainda.</p>}
          <div className="max-h-56 space-y-1.5 overflow-y-auto">
            {visible.map((col) => (
              <div
                key={col.key}
                className="flex items-center justify-between gap-2 rounded border border-border px-3 py-1.5 text-sm"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{col.label}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {TYPE_LABEL[col.type] ?? col.type}
                    {col.type === "relation" && col.relationConfig && ` → ${col.relationConfig.targetTable}`}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => void handleRemove(col.key)}
                  disabled={saving}
                  aria-label={`Remover a coluna ${col.label}`}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t border-border pt-2">
            <h5 className="text-xs font-medium">Nova coluna</h5>
            <Input
              placeholder="Nome (ex: Data de instalação)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="h-8 text-xs"
            />
            <Select
              value={type}
              onValueChange={(v) => {
                setType(v as CustomTableColumnType);
                setTargetTableId("");
                setDisplayField("");
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLUMN_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(type === "select" || type === "multi_select") && (
              <div className="space-y-1">
                <Label className="text-[10px] font-medium text-muted-foreground">Opções (separadas por vírgula)</Label>
                <Input
                  value={options}
                  onChange={(e) => setOptions(e.target.value)}
                  placeholder="Opção 1, Opção 2, Opção 3"
                  className="h-8 text-xs"
                />
              </div>
            )}

            {type === "relation" && (
              <div className="space-y-2 rounded-md border border-border bg-muted/30 p-2">
                <Select value={targetTableId} onValueChange={(v) => { setTargetTableId(v); setDisplayField(""); }}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="Tabela alvo" />
                  </SelectTrigger>
                  <SelectContent>
                    {otherTables.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {target && targetFields.length > 0 && (
                  <Select value={displayField || targetFields[0].key} onValueChange={setDisplayField}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Mostrar pelo campo" />
                    </SelectTrigger>
                    <SelectContent>
                      {targetFields.map((c) => (
                        <SelectItem key={c.key} value={c.key}>
                          Mostrar: {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {otherTables.length === 0 && (
                  <p className="text-[10px] text-muted-foreground">Crie outra tabela para relacionar.</p>
                )}
              </div>
            )}

            <Button size="sm" className="h-8 w-full text-xs" onClick={handleAdd} disabled={!canAdd || saving}>
              Adicionar coluna
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
