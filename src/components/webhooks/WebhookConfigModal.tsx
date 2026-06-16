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
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { useQuery } from "@tanstack/react-query";
import { useWebhookConfigs } from "@/hooks/useWebhookConfigs";
import { useAuth } from "@/contexts/AuthContext";
import { WebhookConfig, WEBHOOK_TRIGGER_EVENTS, FieldMapping, FieldMappingTargetType } from "@/types/webhook";
import { Loader2, TestTube, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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
    webhookType: "outbound" as "outbound" | "inbound",
    pipelineId: "",
  });
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
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
        webhookType: config.inbound_function === "receive_lead" ? "inbound" : "outbound",
        pipelineId: config.pipeline_id || "",
      });
      setFieldMappings(config.field_mappings || []);
    } else {
      setFormData({
        name: "",
        url: "",
        trigger_event: "",
        headers: "{}",
        active: true,
        webhookType: "outbound",
        pipelineId: "",
      });
      setFieldMappings([]);
    }
  }, [config, open]);

  const { equipe } = useAuth();
  const isInbound = formData.webhookType === "inbound";

  // Fetch pipelines for inbound mode
  const { data: pipelines = [] } = useQuery({
    queryKey: ["pipelines", equipe?.id],
    queryFn: async () => {
      if (!equipe?.id) return [];
      const { data } = await supabase
        .from("pipelines")
        .select("id, name")
        .eq("equipe_id", equipe.id)
        .is("deleted_at", null)
        .order("name");
      return data || [];
    },
    enabled: !!equipe?.id && isInbound,
  });

  const addMapping = () => {
    setFieldMappings([...fieldMappings, { source_field: "", target_field: "", target_type: "lead" as FieldMappingTargetType }]);
  };

  const updateMapping = (index: number, key: keyof FieldMapping, value: string) => {
    const updated = [...fieldMappings];
    updated[index] = { ...updated[index], [key]: key === "target_type" ? value as FieldMappingTargetType : value };
    setFieldMappings(updated);
  };

  const removeMapping = (index: number) => {
    setFieldMappings(fieldMappings.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name) {
      toast.error("Nome é obrigatório");
      return;
    }

    if (!isInbound && (!formData.url || !formData.trigger_event)) {
      toast.error("URL e evento de disparo são obrigatórios para webhooks de saída");
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
      const baseData = {
        name: formData.name,
        url: isInbound ? "" : formData.url,
        trigger_event: isInbound ? "lead_created" : formData.trigger_event,
        headers,
        active: formData.active,
        inbound_function: isInbound ? "receive_lead" : null,
        pipeline_id: isInbound ? (formData.pipelineId || null) : null,
        field_mappings: isInbound ? fieldMappings : [],
      };

      if (isEditing && config) {
        await updateConfig.mutateAsync({
          id: config.id,
          ...baseData,
        });
      } else {
        await createConfig.mutateAsync(baseData);
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
    } catch (error: unknown) {
      toast.error(`Erro ao testar: ${(error as Error).message}`);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Webhook" : "Novo Webhook"}
          </DialogTitle>
          <DialogDescription>
            Configure um webhook de entrada ou saída
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Facebook Ads - Cliente ABC"
            />
          </div>

          {/* Tipo de Webhook toggle */}
          <div className="space-y-2">
            <Label>Tipo de Webhook</Label>
            <RadioGroup
              value={formData.webhookType}
              onValueChange={(v) => setFormData({ ...formData, webhookType: v as "outbound" | "inbound" })}
              className="flex gap-4"
            >
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="outbound" />
                <span>Saída (disparar para URL)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="inbound" />
                <span>Entrada (Receber Lead)</span>
              </label>
            </RadioGroup>
          </div>

          {!isInbound && (
            <>
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
            </>
          )}

          {/* Inbound-specific fields */}
          {isInbound && (
            <>
              <div className="space-y-2">
                <Label>Pipeline alvo</Label>
                <Select
                  value={formData.pipelineId}
                  onValueChange={(value) => setFormData({ ...formData, pipelineId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um pipeline" />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelines.map((p: { id: string; name: string }) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Mapeamento de campos</Label>
                <p className="text-sm text-muted-foreground">
                  Mapeie os campos do payload recebido para campos do CRM
                </p>
                {fieldMappings.map((mapping, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      placeholder="Campo de origem (ex: full_name)"
                      value={mapping.source_field}
                      onChange={(e) => updateMapping(index, "source_field", e.target.value)}
                      className="flex-1"
                    />
                    <Select
                      value={mapping.target_type}
                      onValueChange={(v) => updateMapping(index, "target_type", v)}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lead">Base de Contatos</SelectItem>
                        <SelectItem value="lead_custom">Campo Personalizado (Lead)</SelectItem>
                        <SelectItem value="opportunity">Valor / Coluna Nativa</SelectItem>
                        <SelectItem value="custom_data">Pipeline (custom_data)</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Campo destino"
                      value={mapping.target_field}
                      onChange={(e) => updateMapping(index, "target_field", e.target.value)}
                      className="flex-1"
                    />
                    <Button variant="ghost" size="icon" type="button" onClick={() => removeMapping(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" type="button" onClick={addMapping}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar mapeamento
                </Button>
              </div>
            </>
          )}

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
            {!isInbound ? (
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
            ) : (
              <div /> // Spacer
            )}

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
