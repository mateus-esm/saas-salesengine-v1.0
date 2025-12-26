import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  GripVertical,
  Plus,
  Trash2,
  Copy,
  Check,
  Webhook,
} from "lucide-react";
import { PipelineStage } from "@/types/crm";
import { toast } from "sonner";

interface StageManagerModalProps {
  open: boolean;
  stages: PipelineStage[];
  webhookUrl: string;
  onClose: () => void;
  onUpdateStage: (id: string, updates: Partial<PipelineStage>) => void;
  onAddStage: (name: string, color: string) => void;
  onDeleteStage: (id: string) => void;
  onReorderStages: (orderedIds: string[]) => void;
}

const STAGE_COLORS = [
  "#6366f1", // Indigo
  "#8b5cf6", // Violet
  "#a855f7", // Purple
  "#d946ef", // Fuchsia
  "#ec4899", // Pink
  "#f43f5e", // Rose
  "#ef4444", // Red
  "#f97316", // Orange
  "#f59e0b", // Amber
  "#eab308", // Yellow
  "#84cc16", // Lime
  "#22c55e", // Green
  "#10b981", // Emerald
  "#14b8a6", // Teal
  "#06b6d4", // Cyan
  "#0ea5e9", // Sky
  "#3b82f6", // Blue
  "#6b7280", // Gray
];

export const StageManagerModal = ({
  open,
  stages,
  webhookUrl,
  onClose,
  onUpdateStage,
  onAddStage,
  onDeleteStage,
}: StageManagerModalProps) => {
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState(STAGE_COLORS[0]);
  const [copied, setCopied] = useState(false);

  const handleAddStage = () => {
    if (newStageName.trim()) {
      onAddStage(newStageName.trim(), newStageColor);
      setNewStageName("");
      setNewStageColor(STAGE_COLORS[Math.floor(Math.random() * STAGE_COLORS.length)]);
    }
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success("URL copiada!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Gerenciar Pipeline</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-6 pr-4">
            {/* Stage List */}
            <div>
              <Label className="text-sm font-medium">Etapas do Pipeline</Label>
              <div className="space-y-2 mt-3">
                {stages
                  .sort((a, b) => a.position - b.position)
                  .map((stage) => (
                    <div
                      key={stage.id}
                      className="flex items-center gap-2 p-2 rounded-lg border border-border bg-card"
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                      
                      <input
                        type="color"
                        value={stage.color}
                        onChange={(e) =>
                          onUpdateStage(stage.id, { color: e.target.value })
                        }
                        className="w-6 h-6 rounded cursor-pointer border-0"
                      />
                      
                      <Input
                        value={stage.name}
                        onChange={(e) =>
                          onUpdateStage(stage.id, { name: e.target.value })
                        }
                        className="flex-1 h-8"
                      />
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDeleteStage(stage.id)}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
              </div>
            </div>

            {/* Add New Stage */}
            <div>
              <Label className="text-sm font-medium">Nova Etapa</Label>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="color"
                  value={newStageColor}
                  onChange={(e) => setNewStageColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border-0"
                />
                <Input
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddStage()}
                  placeholder="Nome da etapa"
                  className="flex-1"
                />
                <Button
                  onClick={handleAddStage}
                  disabled={!newStageName.trim()}
                  size="sm"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar
                </Button>
              </div>
            </div>

            <Separator />

            {/* Webhook Integration */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Webhook className="h-4 w-4 text-primary" />
                <Label className="text-sm font-medium">Integração via Webhook</Label>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Use esta URL para integrar seu agente SDR ou outras ferramentas.
                Envie um POST com os dados do lead em JSON.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  value={webhookUrl}
                  readOnly
                  className="flex-1 text-xs font-mono bg-muted"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyWebhookUrl}
                  className="shrink-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border">
                <p className="text-xs font-medium mb-2">Exemplo de payload:</p>
                <pre className="text-xs text-muted-foreground overflow-x-auto">
{`{
  "name": "João Silva",
  "email": "joao@email.com",
  "phone": "(11) 99999-0000",
  "source": "agente_sdr",
  "opportunity_value": 5000,
  "observations": "Interessado em..."
}`}
                </pre>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
