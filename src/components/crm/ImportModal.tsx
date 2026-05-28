import { useState, useCallback } from "react";
import Papa from "papaparse";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { useLeads } from "@/hooks/useLeads";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
}

const CRM_FIELDS = [
  { key: "name", label: "Nome", required: true },
  { key: "email", label: "Email", required: false },
  { key: "phone", label: "Telefone", required: false },
  { key: "observations", label: "Observações", required: false },
  { key: "tags", label: "Tags (separadas por vírgula)", required: false },
];

export const ImportModal = ({
  open,
  onClose,
}: ImportModalProps) => {
  const { createLead } = useLeads();

  const [step, setStep] = useState<"upload" | "mapping" | "preview" | "importing">("upload");
  const [csvData, setCsvData] = useState<Record<string, string>[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, success: 0, errors: 0 });

  const resetState = () => {
    setStep("upload");
    setCsvData([]);
    setCsvHeaders([]);
    setColumnMapping({});
    setImportProgress({ current: 0, total: 0, success: 0, errors: 0 });
  };

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as Record<string, string>[];
        if (data.length === 0) {
          toast.error("Arquivo CSV vazio");
          return;
        }

        const headers = Object.keys(data[0]);
        setCsvData(data);
        setCsvHeaders(headers);

        // Auto-map columns based on common names
        const autoMapping: Record<string, string> = {};
        headers.forEach((header) => {
          const lowerHeader = header.toLowerCase().trim();
          if (lowerHeader.includes("nome") || lowerHeader === "name") {
            autoMapping["name"] = header;
          } else if (lowerHeader.includes("email") || lowerHeader === "e-mail") {
            autoMapping["email"] = header;
          } else if (lowerHeader.includes("telefone") || lowerHeader.includes("phone") || lowerHeader.includes("celular")) {
            autoMapping["phone"] = header;
          } else if (lowerHeader.includes("observ") || lowerHeader.includes("notes")) {
            autoMapping["observations"] = header;
          } else if (lowerHeader.includes("tag")) {
            autoMapping["tags"] = header;
          }
        });
        setColumnMapping(autoMapping);
        setStep("mapping");
      },
      error: () => {
        toast.error("Erro ao processar arquivo CSV");
      },
    });
  }, []);

  const handleImport = async () => {
    if (!columnMapping.name) {
      toast.error("O campo Nome é obrigatório");
      return;
    }

    setStep("importing");
    const total = csvData.length;
    setImportProgress({ current: 0, total, success: 0, errors: 0 });

    let success = 0;
    let errors = 0;

    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];

      try {
        const leadData: Partial<import("@/types/crm").CreateLeadData> = {
          name: row[columnMapping.name]?.trim(),
          source: "csv_import",
        };

        if (!leadData.name) {
          errors++;
          setImportProgress({ current: i + 1, total, success, errors });
          continue;
        }

        if (columnMapping.email && row[columnMapping.email]) {
          leadData.email = row[columnMapping.email].trim();
        }

        if (columnMapping.phone && row[columnMapping.phone]) {
          // Clean phone number
          leadData.phone = row[columnMapping.phone].replace(/\D/g, "");
        }

        if (columnMapping.observations && row[columnMapping.observations]) {
          leadData.observations = row[columnMapping.observations].trim();
        }

        if (columnMapping.tags && row[columnMapping.tags]) {
          leadData.tags = row[columnMapping.tags].split(",").map((t: string) => t.trim()).filter(Boolean);
        }

        await createLead.mutateAsync(leadData as import("@/types/crm").CreateLeadData);
        success++;
      } catch (error) {
        errors++;
      }

      setImportProgress({ current: i + 1, total, success, errors });
    }

    toast.success(`Importação concluída: ${success} leads importados, ${errors} erros`);

    setTimeout(() => {
      resetState();
      onClose();
    }, 2000);
  };

  const previewData = csvData.slice(0, 5);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) {
        resetState();
        onClose();
      }
    }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Importar Leads via CSV
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Faça upload de um arquivo CSV com os dados dos leads"}
            {step === "mapping" && "Mapeie as colunas do CSV para os campos do CRM"}
            {step === "preview" && "Confira os dados antes de importar"}
            {step === "importing" && "Importando leads..."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {/* Step 1: Upload */}
          {step === "upload" && (
            <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-muted-foreground/25 rounded-lg">
              <Upload className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                Arraste um arquivo CSV ou clique para selecionar
              </p>
              <Input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="max-w-xs"
              />
              <p className="text-xs text-muted-foreground mt-4">
                Formatos aceitos: CSV (separado por vírgula)
              </p>
            </div>
          )}

          {/* Step 2: Mapping */}
          {step === "mapping" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                {CRM_FIELDS.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label className="flex items-center gap-1">
                      {field.label}
                      {field.required && <span className="text-destructive">*</span>}
                    </Label>
                    <Select
                      value={columnMapping[field.key] || ""}
                      onValueChange={(value) =>
                        setColumnMapping({ ...columnMapping, [field.key]: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar coluna..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Não mapear</SelectItem>
                        {csvHeaders.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="skip-duplicates"
                  checked={skipDuplicates}
                  onCheckedChange={(checked) => setSkipDuplicates(!!checked)}
                />
                <Label htmlFor="skip-duplicates" className="text-sm cursor-pointer">
                  Ignorar leads com email duplicado
                </Label>
              </div>

              {/* Preview Table */}
              <div className="space-y-2">
                <Label>Preview (primeiras 5 linhas)</Label>
                <ScrollArea className="h-[200px] border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {csvHeaders.map((header) => (
                          <TableHead key={header}>{header}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.map((row, i) => (
                        <TableRow key={i}>
                          {csvHeaders.map((header) => (
                            <TableCell key={header} className="max-w-[150px] truncate">
                              {row[header]}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            </div>
          )}

          {/* Step 3: Importing */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-12 space-y-6">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <div className="text-center">
                <p className="text-lg font-medium">
                  Importando {importProgress.current} de {importProgress.total}
                </p>
                <div className="w-64 h-2 bg-muted rounded-full mt-4 overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width: `${(importProgress.current / importProgress.total) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <div className="flex gap-6 text-sm">
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  {importProgress.success} importados
                </span>
                {importProgress.errors > 0 && (
                  <span className="flex items-center gap-1 text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    {importProgress.errors} erros
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== "importing" && (
          <div className="flex justify-between pt-4 border-t">
            <Button variant="outline" onClick={() => {
              if (step === "mapping") {
                setStep("upload");
              } else {
                resetState();
                onClose();
              }
            }}>
              {step === "mapping" ? "Voltar" : "Cancelar"}
            </Button>

            {step === "mapping" && (
              <Button
                onClick={handleImport}
                disabled={!columnMapping.name}
              >
                Importar {csvData.length} leads
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
