import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { CustomTable } from "@/hooks/useCustomTables";
import { useSaveFormConfig } from "@/hooks/usePublicForm";
import { EMPTY_FORM_CONFIG, formEligibleColumns, type FormConfig } from "@/lib/publicForm";

interface FormConfigEditorProps {
  table: CustomTable;
}

/**
 * Sprint 11 · Onda 4 · T45 — which fields of the table the client fills through
 * the record's public link ("Dados para Contrato"), in the table's order, and
 * which are required. The link itself is made in the record's drawer.
 */
export function FormConfigEditor({ table }: FormConfigEditorProps) {
  const [open, setOpen] = useState(false);
  const save = useSaveFormConfig(table.id);
  const eligible = useMemo(() => formEligibleColumns(table.table_schema), [table.table_schema]);
  const [draft, setDraft] = useState<FormConfig>(table.form_config ?? EMPTY_FORM_CONFIG);

  useEffect(() => {
    if (open) setDraft(table.form_config ?? EMPTY_FORM_CONFIG);
  }, [open, table.form_config]);

  const chosen = new Map(draft.fields.map((f) => [f.field_id, f]));
  const toggle = (fieldId: string, on: boolean) =>
    setDraft((d) => {
      const rest = d.fields.filter((f) => f.field_id !== fieldId);
      const fields = on ? [...rest, { field_id: fieldId, required: false }] : rest;
      // Keep the table's order.
      const order = new Map(eligible.map((c, i) => [c.field_id, i]));
      return { ...d, fields: fields.sort((a, b) => (order.get(a.field_id) ?? 0) - (order.get(b.field_id) ?? 0)) };
    });
  const setRequired = (fieldId: string, required: boolean) =>
    setDraft((d) => ({ ...d, fields: d.fields.map((f) => (f.field_id === fieldId ? { ...f, required } : f)) }));

  const invalid = draft.enabled && draft.fields.length === 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <ClipboardList className="mr-1 h-3 w-3" /> Formulário
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[22rem]" align="end">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-medium">Formulário público</h4>
              <p className="text-[11px] text-muted-foreground">
                Cada registro ganha um link para o cliente preencher sem login (vale até o envio ou 30 dias).
              </p>
            </div>
            <Switch checked={draft.enabled} onCheckedChange={(enabled) => setDraft((d) => ({ ...d, enabled }))} />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Título</Label>
            <Input
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder={table.name}
              className="h-8 text-xs"
              maxLength={120}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Texto de abertura</Label>
            <Textarea
              value={draft.intro}
              onChange={(e) => setDraft((d) => ({ ...d, intro: e.target.value }))}
              placeholder="Ex: Preencha seus dados para gerarmos o contrato."
              className="min-h-[56px] text-xs"
              maxLength={1000}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Campos</Label>
            {eligible.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma coluna que um formulário aceite (texto, número, data…).</p>
            ) : (
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {eligible.map((c) => {
                  const f = chosen.get(c.field_id);
                  return (
                    <li key={c.field_id} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1 text-xs">
                      <label className="flex min-w-0 items-center gap-2">
                        <Checkbox checked={!!f} onCheckedChange={(v) => toggle(c.field_id, v === true)} />
                        <span className="truncate">{c.label}</span>
                      </label>
                      {f && (
                        <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                          <Checkbox checked={f.required} onCheckedChange={(v) => setRequired(c.field_id, v === true)} />
                          obrigatório
                        </label>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {invalid && <p className="text-[11px] text-destructive">Escolha pelo menos um campo.</p>}

          <div className="flex justify-end border-t border-border pt-2">
            <Button size="sm" className="h-7 text-xs" onClick={() => save.mutate(draft)} disabled={invalid || save.isPending}>
              {save.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
