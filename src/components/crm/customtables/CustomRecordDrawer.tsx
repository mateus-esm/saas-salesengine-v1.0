import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { CustomTableRecord } from "@/hooks/useCustomTableRecords";
import type { CustomTableColumn } from "@/hooks/useCustomTables";
import { useMemberDirectory } from "@/hooks/useMemberDirectory";
import { recordTitle } from "@/lib/artifacts";
import { formatLookup, recordValues, type RelationChips } from "@/lib/customTables";
import type { CustomFieldSchema, CustomFieldType } from "@/types/pipelines";

import { DynamicFieldRenderer, validateCustomData } from "../DynamicFieldRenderer";
import { RelationChip } from "../grid/RelationChip";

interface CustomRecordDrawerProps {
  record: CustomTableRecord | null;
  /** The table's columns on screen (removed ones already out). */
  columns: CustomTableColumn[];
  /** Column field_id → row id → chips (useCustomTableRelations). */
  relations: Record<string, Record<string, RelationChips>>;
  onClose: () => void;
  onSave: (id: string, data: Record<string, unknown>) => Promise<unknown>;
  onDelete: (id: string) => void;
}

const fmt = (iso: string) => {
  try {
    return format(new Date(iso), "dd/MM/yyyy HH:mm");
  } catch {
    return iso;
  }
};

/**
 * Sprint 11 · T21 — one record of a custom table: every field (by the same
 * renderer as the deal form, so each type has its editor), the relations, when
 * it was created and changed, and delete. The row's first column opens it.
 */
export function CustomRecordDrawer({ record, columns, relations, onClose, onSave, onDelete }: CustomRecordDrawerProps) {
  const { nameOf } = useMemberDirectory();
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setDraft(record?.data ?? {});
  }, [record]);

  // Sprint 11 · T39 — records keep their values under the column's field_id, the
  // same address the renderer uses for the deal's fields.
  const schema: CustomFieldSchema[] = useMemo(
    () =>
      columns
        .filter((c) => c.type !== "relation" && c.type !== "lookup")
        .map((c, i) => ({
          field_id: c.field_id,
          key: c.key,
          label: c.label,
          type: c.type as CustomFieldType,
          required: false,
          options: c.options,
          position: i,
        })),
    [columns],
  );
  const relationColumns = columns.filter((c) => c.type === "relation");
  const lookupColumns = columns.filter((c) => c.type === "lookup");

  const dirty = !!record && JSON.stringify(draft) !== JSON.stringify(record.data ?? {});
  const title = record ? recordTitle(recordValues(record), columns, { nameOf }, "Registro") : "Registro";

  const handleSave = async () => {
    if (!record) return;
    const errors = validateCustomData(schema, draft);
    if (errors.length > 0) {
      toast.error(errors[0].message);
      return;
    }
    setSaving(true);
    try {
      await onSave(record.id, draft);
      onClose();
    } catch {
      // the hook shows the error; the drawer stays open with the draft
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={!!record} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-5 py-4 text-left">
          <SheetTitle className="truncate">{title}</SheetTitle>
          {record && (
            <SheetDescription className="text-xs">
              Criado em {fmt(record.created_at)} · Atualizado em {fmt(record.updated_at)}
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {schema.length > 0 ? (
            <DynamicFieldRenderer schema={schema} value={draft} onChange={setDraft} />
          ) : (
            <p className="text-sm text-muted-foreground">Esta tabela ainda não tem colunas.</p>
          )}

          {/* Sprint 11 · T41 — read from the deal holding the record, now. */}
          {record && lookupColumns.length > 0 && (
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Do negócio</p>
              {record.opportunity_id ? (
                <dl className="space-y-1.5">
                  {lookupColumns.map((col) => (
                    <div key={col.field_id} className="flex items-baseline justify-between gap-3 text-sm">
                      <dt className="shrink-0 text-muted-foreground">{col.label}</dt>
                      <dd className="min-w-0 text-right">
                        {formatLookup(col.lookupConfig?.source, record.lookups?.[col.field_id]) || "—"}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-xs text-muted-foreground">Sem negócio: as consultas leem do negócio que prende o registro.</p>
              )}
            </div>
          )}

          {record && relationColumns.length > 0 && (
            <div className="space-y-3 border-t border-border pt-4">
              {relationColumns.map((col) => {
                const chips = relations[col.field_id]?.[record.id] ?? [];
                return (
                  <div key={col.field_id} className="space-y-1.5">
                    <p className="text-sm font-medium">{col.label}</p>
                    {chips.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {chips.map((c) => (
                          <RelationChip key={c.id} label={c.name} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Nenhum vínculo. Vincule pela célula na tabela.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-5 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Excluir
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8" onClick={onClose}>
              Cancelar
            </Button>
            <Button size="sm" className="h-8" onClick={handleSave} disabled={!dirty || saving}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      </SheetContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este registro?</AlertDialogTitle>
            <AlertDialogDescription>“{title}” sai da tabela e dos vínculos que apontam para ele.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (record) onDelete(record.id);
                setConfirmDelete(false);
                onClose();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
