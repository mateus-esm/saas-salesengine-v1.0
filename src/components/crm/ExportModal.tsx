import { useState } from "react";
import Papa from "papaparse";
import { format } from "date-fns";
import { Download, FileJson, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ORIGIN_CATEGORY_OPTIONS } from "@/config/originTaxonomy";
import type { ContactRow } from "@/types/crmTables";

import { RELATIONSHIP_LABELS } from "./filters/model";

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  /** How many contacts match the current filters (shown before loading them). */
  total: number;
  /** Loads every contact that matches the filters (pages from the server). */
  loadRows: () => Promise<ContactRow[]>;
}

const EXPORT_FIELDS = [
  { key: "name", label: "Nome", default: true },
  { key: "email", label: "E-mail", default: true },
  { key: "phone", label: "Telefone", default: true },
  { key: "company", label: "Empresa", default: true },
  { key: "relationship", label: "Situação", default: true },
  { key: "deals", label: "Negócios (pipeline · etapa)", default: true },
  { key: "owners", label: "Responsáveis dos negócios", default: true },
  { key: "won_value", label: "Ganho total", default: true },
  { key: "last_won_at", label: "Último ganho", default: false },
  { key: "origin", label: "Origem", default: true },
  { key: "channel", label: "Canal", default: false },
  { key: "tags", label: "Etiquetas", default: false },
  { key: "observations", label: "Observações", default: false },
  { key: "created_at", label: "Criado em", default: true },
] as const;

type FieldKey = (typeof EXPORT_FIELDS)[number]["key"];

const originLabel = (v: string | null) => ORIGIN_CATEGORY_OPTIONS.find((o) => o.value === v)?.label ?? v ?? "";

function toExportRow(c: ContactRow, fields: Record<FieldKey, boolean>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (fields.name) row["Nome"] = c.name ?? "";
  if (fields.email) row["E-mail"] = c.email ?? "";
  if (fields.phone) row["Telefone"] = c.phone ?? "";
  if (fields.company) row["Empresa"] = c.company_name ?? "";
  if (fields.relationship) row["Situação"] = RELATIONSHIP_LABELS[c.relationship] ?? c.relationship;
  if (fields.deals) row["Negócios"] = c.deals.map((d) => `${d.pipeline_name} · ${d.stage_name}`).join("; ");
  // A contact has no owner of its own: its deals do.
  if (fields.owners) {
    row["Responsáveis dos negócios"] = Array.from(new Set(c.deals.map((d) => d.owner_name).filter(Boolean))).join(", ");
  }
  if (fields.won_value) row["Ganho total"] = c.won_value;
  if (fields.last_won_at) row["Último ganho"] = c.last_won_at ? format(new Date(c.last_won_at), "dd/MM/yyyy") : "";
  if (fields.origin) row["Origem"] = originLabel(c.origin_category);
  if (fields.channel) row["Canal"] = c.channel ?? "";
  if (fields.tags) row["Etiquetas"] = c.tags.join(", ");
  if (fields.observations) row["Observações"] = c.observations ?? "";
  if (fields.created_at) row["Criado em"] = format(new Date(c.created_at), "dd/MM/yyyy HH:mm");
  return row;
}

function download(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

/**
 * Sprint 11 · Onda 2 · T19 — exports every contact that matches the filters.
 * The rows come from the server at export time (the table only holds the pages
 * scrolled so far), with the contact's relationship and deals.
 */
export const ExportModal = ({ open, onClose, total, loadRows }: ExportModalProps) => {
  const [exportFormat, setExportFormat] = useState<"csv" | "json">("csv");
  const [exporting, setExporting] = useState(false);
  const [selectedFields, setSelectedFields] = useState<Record<FieldKey, boolean>>(
    () => Object.fromEntries(EXPORT_FIELDS.map((f) => [f.key, f.default])) as Record<FieldKey, boolean>,
  );

  const allSelected = Object.values(selectedFields).every(Boolean);
  const someSelected = Object.values(selectedFields).some(Boolean);

  const handleExport = async () => {
    setExporting(true);
    try {
      const rows = await loadRows();
      if (rows.length === 0) {
        toast.error("Nenhum contato para exportar");
        return;
      }
      const data = rows.map((c) => toExportRow(c, selectedFields));
      const filename = `contatos_${format(new Date(), "yyyy-MM-dd_HH-mm")}`;
      if (exportFormat === "csv") {
        download("\ufeff" + Papa.unparse(data), `${filename}.csv`, "text/csv;charset=utf-8;");
      } else {
        download(JSON.stringify(data, null, 2), `${filename}.json`, "application/json");
      }
      toast.success(`${rows.length} ${rows.length === 1 ? "contato exportado" : "contatos exportados"}`);
      onClose();
    } catch (e) {
      toast.error("Não foi possível exportar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Exportar contatos
          </DialogTitle>
          <DialogDescription>
            {total.toLocaleString("pt-BR")} {total === 1 ? "contato" : "contatos"} com os filtros atuais.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-3">
            <Label>Formato</Label>
            <RadioGroup value={exportFormat} onValueChange={(v) => setExportFormat(v as "csv" | "json")}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="csv" id="csv" />
                <Label htmlFor="csv" className="flex cursor-pointer items-center gap-2 font-normal">
                  <FileSpreadsheet className="h-4 w-4" />
                  CSV (Excel)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="json" id="json" />
                <Label htmlFor="json" className="flex cursor-pointer items-center gap-2 font-normal">
                  <FileJson className="h-4 w-4" />
                  JSON
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Campos</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setSelectedFields(
                    Object.fromEntries(EXPORT_FIELDS.map((f) => [f.key, !allSelected])) as Record<FieldKey, boolean>,
                  )
                }
              >
                {allSelected ? "Desmarcar todos" : "Marcar todos"}
              </Button>
            </div>
            <div className="grid max-h-[220px] grid-cols-2 gap-2 overflow-y-auto">
              {EXPORT_FIELDS.map((field) => (
                <div key={field.key} className="flex items-center space-x-2">
                  <Checkbox
                    id={`exp-${field.key}`}
                    checked={selectedFields[field.key]}
                    onCheckedChange={(checked) => setSelectedFields({ ...selectedFields, [field.key]: !!checked })}
                  />
                  <Label htmlFor={`exp-${field.key}`} className="cursor-pointer text-sm font-normal">
                    {field.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleExport} disabled={!someSelected || exporting || total === 0}>
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Exportar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
