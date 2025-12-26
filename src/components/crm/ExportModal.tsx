import { useState } from "react";
import Papa from "papaparse";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Lead } from "@/types/crm";
import { usePipelineStages } from "@/hooks/usePipelineStages";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { Download, FileSpreadsheet, FileJson } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  leads: Lead[];
  allLeads: Lead[];
  selectedCount: number;
}

const EXPORT_FIELDS = [
  { key: "name", label: "Nome", default: true },
  { key: "email", label: "Email", default: true },
  { key: "phone", label: "Telefone", default: true },
  { key: "stage", label: "Etapa", default: true },
  { key: "responsible", label: "Responsável", default: true },
  { key: "opportunity_value", label: "Valor", default: true },
  { key: "source", label: "Origem", default: true },
  { key: "tags", label: "Tags", default: false },
  { key: "observations", label: "Observações", default: false },
  { key: "meeting_scheduled", label: "Reunião Agendada", default: false },
  { key: "meeting_done", label: "Reunião Realizada", default: false },
  { key: "no_show", label: "No Show", default: false },
  { key: "created_at", label: "Data de Criação", default: true },
  { key: "updated_at", label: "Última Atualização", default: false },
];

export const ExportModal = ({
  open,
  onClose,
  leads,
  allLeads,
  selectedCount,
}: ExportModalProps) => {
  const { stages } = usePipelineStages();
  const { teamMembers: members } = useTeamMembers();
  
  const [exportScope, setExportScope] = useState<"selected" | "all">(
    selectedCount > 0 ? "selected" : "all"
  );
  const [exportFormat, setExportFormat] = useState<"csv" | "json">("csv");
  const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>(
    EXPORT_FIELDS.reduce((acc, field) => ({ ...acc, [field.key]: field.default }), {})
  );

  const getStageById = (id: string | null) => stages.find(s => s.id === id);
  const getMemberById = (id: string | null) => members.find(m => m.id === id);

  const handleExport = () => {
    const dataToExport = exportScope === "selected" ? leads : allLeads;
    
    if (dataToExport.length === 0) {
      toast.error("Nenhum lead para exportar");
      return;
    }

    const exportData = dataToExport.map((lead) => {
      const row: Record<string, any> = {};
      
      if (selectedFields.name) row["Nome"] = lead.name;
      if (selectedFields.email) row["Email"] = lead.email || "";
      if (selectedFields.phone) row["Telefone"] = lead.phone || "";
      if (selectedFields.stage) {
        const stage = getStageById(lead.stage_id);
        row["Etapa"] = stage?.name || "";
      }
      if (selectedFields.responsible) {
        const member = getMemberById(lead.responsible_id);
        row["Responsável"] = member?.nome_completo || "";
      }
      if (selectedFields.opportunity_value) {
        row["Valor"] = lead.opportunity_value || 0;
      }
      if (selectedFields.source) row["Origem"] = lead.source || "";
      if (selectedFields.tags) {
        row["Tags"] = (lead.tags || []).join(", ");
      }
      if (selectedFields.observations) {
        row["Observações"] = lead.observations || "";
      }
      if (selectedFields.meeting_scheduled) {
        row["Reunião Agendada"] = lead.meeting_scheduled ? "Sim" : "Não";
      }
      if (selectedFields.meeting_done) {
        row["Reunião Realizada"] = lead.meeting_done ? "Sim" : "Não";
      }
      if (selectedFields.no_show) {
        row["No Show"] = lead.no_show ? "Sim" : "Não";
      }
      if (selectedFields.created_at) {
        row["Data de Criação"] = format(new Date(lead.created_at), "dd/MM/yyyy HH:mm");
      }
      if (selectedFields.updated_at) {
        row["Última Atualização"] = format(new Date(lead.updated_at), "dd/MM/yyyy HH:mm");
      }
      
      return row;
    });

    const timestamp = format(new Date(), "yyyy-MM-dd_HH-mm");
    const filename = `leads_export_${timestamp}`;

    if (exportFormat === "csv") {
      const csv = Papa.unparse(exportData);
      const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}.csv`;
      link.click();
    } else {
      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}.json`;
      link.click();
    }

    toast.success(`${dataToExport.length} leads exportados com sucesso!`);
    onClose();
  };

  const toggleAllFields = (checked: boolean) => {
    setSelectedFields(
      EXPORT_FIELDS.reduce((acc, field) => ({ ...acc, [field.key]: checked }), {})
    );
  };

  const allSelected = Object.values(selectedFields).every(Boolean);
  const someSelected = Object.values(selectedFields).some(Boolean);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Exportar Leads
          </DialogTitle>
          <DialogDescription>
            Configure as opções de exportação
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Export Scope */}
          <div className="space-y-3">
            <Label>Leads para exportar</Label>
            <RadioGroup value={exportScope} onValueChange={(v) => setExportScope(v as "selected" | "all")}>
              {selectedCount > 0 && (
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="selected" id="selected" />
                  <Label htmlFor="selected" className="font-normal cursor-pointer">
                    Selecionados ({selectedCount} leads)
                  </Label>
                </div>
              )}
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="all" />
                <Label htmlFor="all" className="font-normal cursor-pointer">
                  Todos os leads filtrados ({allLeads.length} leads)
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Export Format */}
          <div className="space-y-3">
            <Label>Formato</Label>
            <RadioGroup value={exportFormat} onValueChange={(v) => setExportFormat(v as "csv" | "json")}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="csv" id="csv" />
                <Label htmlFor="csv" className="font-normal cursor-pointer flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  CSV (Excel)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="json" id="json" />
                <Label htmlFor="json" className="font-normal cursor-pointer flex items-center gap-2">
                  <FileJson className="h-4 w-4" />
                  JSON
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Fields to Export */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Campos para exportar</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleAllFields(!allSelected)}
              >
                {allSelected ? "Desmarcar todos" : "Marcar todos"}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
              {EXPORT_FIELDS.map((field) => (
                <div key={field.key} className="flex items-center space-x-2">
                  <Checkbox
                    id={field.key}
                    checked={selectedFields[field.key]}
                    onCheckedChange={(checked) =>
                      setSelectedFields({ ...selectedFields, [field.key]: !!checked })
                    }
                  />
                  <Label htmlFor={field.key} className="font-normal cursor-pointer text-sm">
                    {field.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleExport} disabled={!someSelected}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
