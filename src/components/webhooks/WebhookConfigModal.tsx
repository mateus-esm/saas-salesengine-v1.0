import { useState, useEffect } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
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
import {
  WebhookConfig,
  WEBHOOK_TRIGGER_EVENTS,
  FieldMapping,
  FieldMappingTargetType,
  LEAD_FIELD_OPTIONS,
  PIPELINE_FIELD_OPTIONS,
} from "@/types/webhook";
import { Loader2, TestTube, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface FormValues {
  name: string;
  url: string;
  trigger_event: string;
  headers: string;
  active: boolean;
  webhookType: "outbound" | "inbound";
  pipelineId: string;
  fieldMappings: FieldMapping[];
}

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

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      name: "",
      url: "",
      trigger_event: "",
      headers: "{}",
      active: true,
      webhookType: "outbound",
      pipelineId: "",
      fieldMappings: [],
    },
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "fieldMappings",
  });

  const watchWebhookType = watch("webhookType");
  const watchFieldMappings = watch("fieldMappings");
  const isInbound = watchWebhookType === "inbound";

  // Reset form when config or open changes
  useEffect(() => {
    if (config) {
      reset({
        name: config.name,
        url: config.url,
        trigger_event: config.trigger_event,
        headers: JSON.stringify(config.headers, null, 2),
        active: config.active,
        webhookType: config.inbound_function === "receive_lead" ? "inbound" : "outbound",
        pipelineId: config.pipeline_id || "",
        fieldMappings: config.field_mappings || [],
      });
    } else {
      reset({
        name: "",
        url: "",
        trigger_event: "",
        headers: "{}",
        active: true,
        webhookType: "outbound",
        pipelineId: "",
        fieldMappings: [],
      });
    }
  }, [config, open, reset]);

  const { equipe } = useAuth();

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

  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const addMapping = () => {
    append({ source_field: "", target_field: "", target_type: "lead" as FieldMappingTargetType });
  };

  const onSubmit = async (data: FormValues) => {
    if (!data.name) {
      toast.error("Nome é obrigatório");
      return;
    }

    if (!isInbound && (!data.url || !data.trigger_event)) {
      toast.error("URL e evento de disparo são obrigatórios para webhooks de saída");
      return;
    }

    let headers: Record<string, string> = {};
    try {
      headers = JSON.parse(data.headers);
    } catch {
      toast.error("Headers JSON inválido");
      return;
    }

    setIsSaving(true);
    try {
      const baseData = {
        name: data.name,
        url: isInbound ? "" : data.url,
        trigger_event: isInbound ? "lead_created" : data.trigger_event,
        headers,
        active: data.active,
        inbound_function: isInbound ? "receive_lead" : null,
        pipeline_id: isInbound ? (data.pipelineId || null) : null,
        field_mappings: isInbound ? data.fieldMappings : [],
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
    const url = watch("url");
    if (!url) {
      toast.error("URL é obrigatória para testar");
      return;
    }

    let headers: Record<string, string> = {};
    try {
      headers = JSON.parse(watch("headers"));
    } catch {
      toast.error("Headers JSON inválido");
      return;
    }

    setIsTesting(true);
    try {
      const response = await fetch(url, {
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

  /** Render the target_field input conditionally based on target_type */
  const renderTargetField = (index: number) => {
    const mapping = watchFieldMappings?.[index];
    const targetType = mapping?.target_type;

    if (targetType === "lead") {
      return (
        <Controller
          control={control}
          name={`fieldMappings.${index}.target_field`}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Selecione o campo destino" />
              </SelectTrigger>
              <SelectContent>
                {LEAD_FIELD_OPTIONS.filter((opt) => opt.value !== "custom_fields").map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      );
    }

    if (targetType === "opportunity") {
      return (
        <Controller
          control={control}
          name={`fieldMappings.${index}.target_field`}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Selecione o campo destino" />
              </SelectTrigger>
              <SelectContent>
                {PIPELINE_FIELD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      );
    }

    // lead_custom or custom_data → free text input for dynamic keys
    return (
      <Input
        placeholder="Chave customizada (ex: capacidade_kwp)"
        {...register(`fieldMappings.${index}.target_field`)}
        className="flex-1"
      />
    );
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

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome *</Label>
            <Input
              id="name"
              {...register("name", { required: "Nome é obrigatório" })}
              placeholder="Ex: Facebook Ads - Cliente ABC"
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Tipo de Webhook toggle */}
          <div className="space-y-2">
            <Label>Tipo de Webhook</Label>
            <Controller
              control={control}
              name="webhookType"
              render={({ field }) => (
                <RadioGroup
                  value={field.value}
                  onValueChange={(v) => {
                    field.onChange(v);
                    // Clear inbound-only fields when switching to outbound
                    if (v === "outbound") {
                      setValue("pipelineId", "");
                      setValue("fieldMappings", []);
                    }
                  }}
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
              )}
            />
          </div>

          {!isInbound && (
            <>
              <div className="space-y-2">
                <Label htmlFor="url">URL de destino *</Label>
                <Input
                  id="url"
                  type="url"
                  {...register("url", { required: !isInbound })}
                  placeholder="https://..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="trigger_event">Evento de disparo *</Label>
                <Controller
                  control={control}
                  name="trigger_event"
                  rules={{ required: !isInbound }}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
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
                  )}
                />
              </div>
            </>
          )}

          {/* Inbound-specific fields */}
          {isInbound && (
            <>
              <div className="space-y-2">
                <Label>Pipeline alvo</Label>
                <Controller
                  control={control}
                  name="pipelineId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um pipeline" />
                      </SelectTrigger>
                      <SelectContent>
                        {pipelines.map((p: { id: string; name: string }) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label>Mapeamento de campos</Label>
                <p className="text-sm text-muted-foreground">
                  Mapeie os campos do payload recebido para campos do CRM
                </p>
                {fields.map((field, index) => (
                  <div key={field.id} className="flex items-center gap-2">
                    <Input
                      placeholder="Campo de origem (ex: full_name)"
                      {...register(`fieldMappings.${index}.source_field`)}
                      className="flex-1"
                    />
                    <Controller
                      control={control}
                      name={`fieldMappings.${index}.target_type`}
                      render={({ field: typeField }) => (
                        <Select
                          value={typeField.value}
                          onValueChange={(v) => {
                            typeField.onChange(v);
                            // Reset target_field when type changes to avoid stale values
                            setValue(`fieldMappings.${index}.target_field`, "");
                          }}
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
                      )}
                    />
                    {renderTargetField(index)}
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      onClick={() => remove(index)}
                    >
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
              {...register("headers")}
              placeholder='{"Authorization": "Bearer token"}'
              className="font-mono text-sm"
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="active">Ativo</Label>
            <Controller
              control={control}
              name="active"
              render={({ field }) => (
                <Switch
                  id="active"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </div>

          <div className="flex justify-between pt-4 border-t">
            {!isInbound ? (
              <Button
                type="button"
                variant="outline"
                onClick={handleTest}
                disabled={isTesting || !watch("url")}
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
