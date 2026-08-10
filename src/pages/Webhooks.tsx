import { useState } from "react";
import { useWebhookConfigs } from "@/hooks/useWebhookConfigs";
import { useWebhookLogs } from "@/hooks/useWebhookLogs";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WebhookConfigModal } from "@/components/webhooks/WebhookConfigModal";
import { WebhookConfig, WebhookLog, WEBHOOK_TRIGGER_EVENTS } from "@/types/webhook";
import {
  Plus,
  Copy,
  Trash2,
  Edit,
  RefreshCw,
  Loader2,
  Webhook,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const Webhooks = () => {
  const { equipe } = useAuth();
  const { configs, isLoading: configsLoading, updateConfig, deleteConfig, refetch: refetchConfigs } = useWebhookConfigs();
  const { logs, isLoading: logsLoading, refetch: refetchLogs } = useWebhookLogs({ limit: 100 });

  const [showConfigModal, setShowConfigModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<WebhookConfig | null>(null);

  // Fetch pipelines for displaying pipeline names on inbound cards
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
    enabled: !!equipe?.id,
  });

  // Existing inbound webhook URL (secret-based, kept for backward compatibility)
  const inboundWebhookUrl = equipe?.webhook_secret
    ? `https://padduteanashekmereof.supabase.co/functions/v1/crm-webhook?secret=${equipe.webhook_secret}`
    : "";

  const webhookUrl = "https://padduteanashekmereof.supabase.co/functions/v1/gpt-maker-webhook";

  // Separate inbound configs from outbound configs
  const inboundConfigs = configs.filter((c) => c.inbound_function === "receive_lead");
  const outboundConfigs = configs.filter((c) => !c.inbound_function);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://padduteanashekmereof.supabase.co";

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("URL copiada!");
  };

  const handleEditConfig = (config: WebhookConfig) => {
    setEditingConfig(config);
    setShowConfigModal(true);
  };

  const handleDeleteConfig = async (id: string) => {
    if (confirm("Tem certeza que deseja excluir este webhook?")) {
      await deleteConfig.mutateAsync(id);
    }
  };

  const handleToggleActive = async (config: WebhookConfig) => {
    await updateConfig.mutateAsync({ id: config.id, active: !config.active });
  };

  const getEventLabel = (event: string) => {
    const found = WEBHOOK_TRIGGER_EVENTS.find(e => e.value === event);
    return found?.label || event;
  };

  const getStatusBadge = (log: WebhookLog) => {
    if (log.error_message) {
      return <Badge variant="destructive">Erro</Badge>;
    }
    if (log.response_status && log.response_status >= 200 && log.response_status < 300) {
      return <Badge className="bg-green-600">Sucesso</Badge>;
    }
    if (log.response_status) {
      return <Badge variant="destructive">HTTP {log.response_status}</Badge>;
    }
    if (log.response_body?.startsWith("Queued by pg_net")) {
      return <Badge variant="outline">Enfileirado</Badge>;
    }
    return <Badge variant="outline">Pendente</Badge>;
  };

  if (configsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Webhook className="h-8 w-8" />
            Webhooks
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure integrações de entrada e saída
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { refetchConfigs(); refetchLogs(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Button onClick={() => { setEditingConfig(null); setShowConfigModal(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Webhook
          </Button>
        </div>
      </div>

      <Tabs defaultValue="inbound" className="space-y-4">
        <TabsList>
          <TabsTrigger value="inbound" className="flex items-center gap-2">
            <ArrowDownLeft className="h-4 w-4" />
            Entrada (Inbound)
          </TabsTrigger>
          <TabsTrigger value="outbound" className="flex items-center gap-2">
            <ArrowUpRight className="h-4 w-4" />
            Saída (Outbound)
          </TabsTrigger>
          <TabsTrigger value="logs">
            Logs
          </TabsTrigger>
        </TabsList>

        {/* Inbound Webhooks */}
        <TabsContent value="inbound" className="space-y-4">
          {/* Legacy webhook cards (kept for backward compatibility) */}
          {inboundWebhookUrl && (
            <Card>
              <CardHeader>
                <CardTitle>Webhook CRM</CardTitle>
                <CardDescription>
                  Use esta URL para enviar leads de sistemas externos
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input value={inboundWebhookUrl} readOnly className="font-mono text-sm" />
                  <Button variant="outline" onClick={() => copyToClipboard(inboundWebhookUrl)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p><strong>Método:</strong> POST</p>
                  <p><strong>Payload exemplo:</strong></p>
                  <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto">
{`{
  "name": "João Silva",
  "email": "joao@email.com",
  "phone": "11999999999",
  "observations": "Interessado no produto X",
  "value": 5000,
  "tags": ["hot", "indicação"]
}`}
                  </pre>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Webhook de Integração</CardTitle>
              {/* T12: neutral title — the provider is an implementation detail. */}
              <CardDescription>
                URL específica para integração com agentes de IA
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input value={webhookUrl} readOnly className="font-mono text-sm" />
                <Button variant="outline" onClick={() => copyToClipboard(webhookUrl)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Configure este endpoint no seu agente de IA para enviar leads automaticamente.
              </p>
            </CardContent>
          </Card>

          {/* Custom inbound webhook configs (configurable field mappings) */}
          {inboundConfigs.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Webhooks de entrada configurados</h3>
              {inboundConfigs.map((config) => {
                const inboundUrl = `${supabaseUrl}/functions/v1/crm-webhook/inbound/${config.id}`;
                return (
                  <Card key={config.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium">{config.name}</h3>
                            <Badge>Receber Lead</Badge>
                            {config.active ? (
                              <Badge className="bg-green-600">Ativo</Badge>
                            ) : (
                              <Badge variant="secondary">Inativo</Badge>
                            )}
                          </div>
                          <div className="flex gap-2 max-w-xl">
                            <Input value={inboundUrl} readOnly className="font-mono text-sm flex-1" />
                            <Button variant="outline" size="icon" onClick={() => copyToClipboard(inboundUrl)}>
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                          {config.pipeline_id && (
                            <p className="text-sm text-muted-foreground">
                              Pipeline: {pipelines?.find((p: { id: string; name: string }) => p.id === config.pipeline_id)?.name || "Pipeline configurado"}
                            </p>
                          )}
                          {config.field_mappings && config.field_mappings.length > 0 && (
                            <div className="text-sm text-muted-foreground">
                              <p>Mapeamentos ({config.field_mappings.length}):</p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {config.field_mappings.map((m, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {m.source_field} → {m.target_field}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <Button variant="ghost" size="icon" onClick={() => handleEditConfig(config)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteConfig(config.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Empty state for custom inbound */}
          {inboundConfigs.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <p className="text-muted-foreground">
                  Nenhum webhook de entrada configurado. Crie um webhook com tipo "Entrada (Receber Lead)".
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Outbound Webhooks */}
        <TabsContent value="outbound" className="space-y-4">
          {outboundConfigs.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Webhook className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Nenhum webhook configurado</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Configure webhooks de saída para notificar sistemas externos sobre eventos do CRM
                </p>
                <Button onClick={() => { setEditingConfig(null); setShowConfigModal(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Webhook
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {outboundConfigs.map((config) => (
                <Card key={config.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{config.name}</h3>
                          {config.active ? (
                            <Badge className="bg-green-600">Ativo</Badge>
                          ) : (
                            <Badge variant="secondary">Inativo</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground font-mono truncate max-w-md">
                          {config.url}
                        </p>
                        <Badge variant="outline">
                          {getEventLabel(config.trigger_event)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={config.active}
                          onCheckedChange={() => handleToggleActive(config)}
                        />
                        <Button variant="ghost" size="icon" onClick={() => handleEditConfig(config)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteConfig(config.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Logs */}
        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Webhooks</CardTitle>
              <CardDescription>
                Últimas 100 chamadas de webhooks
              </CardDescription>
            </CardHeader>
            <CardContent>
              {logsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : logs.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nenhum log de webhook encontrado
                </p>
              ) : (
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Direção</TableHead>
                        <TableHead>Evento</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                          </TableCell>
                          <TableCell>
                            {log.direction === "inbound" ? (
                              <Badge variant="outline" className="flex items-center gap-1 w-fit">
                                <ArrowDownLeft className="h-3 w-3" />
                                Entrada
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="flex items-center gap-1 w-fit">
                                <ArrowUpRight className="h-3 w-3" />
                                Saída
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {log.event_type === "test" ? "Teste manual" : getEventLabel(log.event_type)}
                          </TableCell>
                          <TableCell>{getStatusBadge(log)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Config Modal */}
      <WebhookConfigModal
        open={showConfigModal}
        onClose={() => {
          setShowConfigModal(false);
          setEditingConfig(null);
        }}
        config={editingConfig}
      />
    </div>
  );
};

export default Webhooks;
