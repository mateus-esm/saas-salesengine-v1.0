import { useState, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWebhookConfigs } from "@/hooks/useWebhookConfigs";
import { WebhookConfig, WEBHOOK_TRIGGER_EVENTS } from "@/types/webhook";
import { Loader2, TestTube } from "lucide-react";
import { toast } from "sonner";

interface WebhookConfigModalProps {
  open: boolean;
  onClose: () => void;
  config: WebhookConfig | null;
}

export const WebhookConfigModal = ({
  open,
  onClose,
  config,
}: WebhookConfigModalProps) => {
  const { createConfig, updateConfig } = useWebhookConfigs();
  const isEditing = !!config;

  const [formData, setFormData] = useState({
    name: "",
    url: "",
    trigger_event: "",
    headers: "{}",
    active: true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (config) {
      setFormData({
        name: config.name,
        url: config.url,
        trigger_event: config.trigger_event,
        headers: JSON.stringify(config.headers, null, 2),
        active: config.active,
      });
    } else {
      setFormData({
        name: "",
        url: "",
        trigger_event: "",
        headers: "{}",
        active: true,
      });
    }
  }, [config, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.url || !formData.trigger_event) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    let headers: Record<string, string> = {};
    try {
      headers = JSON.parse(formData.headers);
    } catch {
      toast.error("Headers JSON inválido");
      return;
    }

    setIsSaving(true);
    try {
      if (isEditing && config) {
        await updateConfig.mutateAsync({
          id: config.id,
          name: formData.name,
          url: formData.url,
          trigger_event: formData.trigger_event,
          headers,
          active: formData.active,
        });
      } else {
        await createConfig.mutateAsync({
          name: formData.name,
          url: formData.url,
          trigger_event: formData.trigger_event,
          headers,
          active: formData.active,
        });
      }
      onClose();
    } catch (error) {
      // Error handled by mutation
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!formData.url) {
      toast.error("URL é obrigatória para testar");
      return;
    }

    let headers: Record<string, string> = {};
    try {
      headers = JSON.parse(formData.headers);
    } catch {
      toast.error("Headers JSON inválido");
      return;
    }

    setIsTesting(true);
    try {
      const response = await fetch(formData.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          event: "test",
          timestamp: new Date().toISOString(),
          data: {
            message: "Webhook test from SoloAI CRM",
          },
        }),
      });

      if (response.ok) {
        toast.success("Webhook testado com sucesso!");
      } else {
        toast.error(`Erro: ${response.status} ${response.statusText}`);
      }
    } catch (error: any) {
      toast.error(`Erro ao testar: ${error.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Webhook" : "Novo Webhook"}
          </DialogTitle>
          <DialogDescription>
            Configure um webhook de saída para notificar sistemas externos
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Notificar RD Station"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="url">URL de destino *</Label>
            <Input
              id="url"
              type="url"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder="https://..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="trigger_event">Evento de disparo *</Label>
            <Select
              value={formData.trigger_event}
              onValueChange={(value) =>
                setFormData({ ...formData, trigger_event: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar evento..." />
              </SelectTrigger>
              <SelectContent>
                {WEBHOOK_TRIGGER_EVENTS.map((event) => (
                  <SelectItem key={event.value} value={event.value}>
                    {event.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="headers">Headers (JSON)</Label>
            <Textarea
              id="headers"
              value={formData.headers}
              onChange={(e) => setFormData({ ...formData, headers: e.target.value })}
              placeholder='{"Authorization": "Bearer token"}'
              className="font-mono text-sm"
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="active">Ativo</Label>
            <Switch
              id="active"
              checked={formData.active}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, active: checked })
              }
            />
          </div>

          <div className="flex justify-between pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={isTesting || !formData.url}
            >
              {isTesting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4 mr-2" />
              )}
              Testar
            </Button>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isEditing ? "Salvar" : "Criar"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
