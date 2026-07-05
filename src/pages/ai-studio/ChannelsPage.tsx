import { useState, useEffect, useCallback, useRef } from "react";
import {
  MessageSquare, Instagram, Globe, Plug, CheckCircle2,
  XCircle, Loader2, RefreshCw, QrCode, Wifi, WifiOff, AlertCircle, Phone, Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { CreateChannelDialog } from "@/components/ai-studio/CreateChannelDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ── Channel type → icon + label ────────────────────────────────────────────────
const CHANNEL_TYPE_CONFIG: Record<string, { icon: React.ComponentType<{className?:string}>; label: string; color: string }> = {
  WHATSAPP: { icon: MessageSquare, label: "WhatsApp", color: "text-emerald-600 bg-emerald-500/10 border-emerald-200/60" },
  INSTAGRAM: { icon: Instagram, label: "Instagram", color: "text-pink-600 bg-pink-500/10 border-pink-200/60" },
  WIDGET: { icon: Globe, label: "Widget Web", color: "text-blue-600 bg-blue-500/10 border-blue-200/60" },
  WEB: { icon: Globe, label: "Web", color: "text-blue-600 bg-blue-500/10 border-blue-200/60" },
};

const getTypeConfig = (type: string) =>
  CHANNEL_TYPE_CONFIG[type?.toUpperCase()] ?? CHANNEL_TYPE_CONFIG.WHATSAPP;

interface Channel {
  id: string;
  name: string;
  type: string;
  status: "active" | "inactive" | "connecting";
  phone?: string | null;
  connectedAt?: string | null;
}

// ── Live Channels ──────────────────────────────────────────────────────────────
function LiveChannelsSection() {
  const { toast } = useToast();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchChannels = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-agent-channels");
      if (error) throw error;
      const items: Channel[] = data?.data || data || [];
      setChannels(Array.isArray(items) ? items : []);
    } catch (err) {
      console.error("channels fetch:", err);
      if (!silent) toast({ title: "Erro", description: "Não foi possível carregar os canais.", variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { fetchChannels(); }, [fetchChannels]);

  const handleDeleteChannel = async (channelId: string) => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-agent-channels", {
        body: { action: "remove", channel_id: channelId },
      });
      if (error) throw error;
      if (data?.message) throw new Error(data.message);
      toast({ title: "Sucesso", description: "Canal removido." });
      setDeleteConfirm(null);
      fetchChannels(true);
    } catch (err: any) {
      console.error("delete channel:", err);
      toast({
        title: "Erro",
        description: err.message || "Erro ao remover canal.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/8 border border-primary/15 text-primary rounded-md">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Canais Ativos — AI Engine</h3>
            <p className="text-xs text-muted-foreground">
              Instâncias conectadas ao agente de IA.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            onClick={() => setCreateDialogOpen(true)}
            className="h-8 gap-1.5 text-xs"
          >
            + Novo canal
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchChannels(true)}
            disabled={refreshing}
            className="h-8 gap-1.5 text-xs text-muted-foreground"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : channels.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-lg">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nenhum canal encontrado.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Conecte um canal no painel do AI Engine ou via Solo API abaixo.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {channels.map((ch) => {
              const typeCfg = getTypeConfig(ch.type);
              const TypeIcon = typeCfg.icon;
              const isActive = ch.status === "active";

              return (
                <div key={ch.id} className="flex items-center justify-between py-3.5 px-1 gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn("p-2 rounded-md border shrink-0", typeCfg.color)}>
                      <TypeIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">{ch.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-mono text-muted-foreground uppercase">
                          {typeCfg.label}
                        </span>
                        {ch.phone && (
                          <span className="text-[10px] font-mono text-muted-foreground">{ch.phone}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {ch.connectedAt && (
                      <span className="hidden sm:block text-[10px] font-mono text-muted-foreground">
                        {ch.connectedAt}
                      </span>
                    )}
                    <div className={cn(
                      "flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded border",
                      isActive
                        ? "text-emerald-700 bg-emerald-500/8 border-emerald-200/60"
                        : "text-muted-foreground bg-muted/60 border-border"
                    )}>
                      {isActive
                        ? <CheckCircle2 className="w-3 h-3" />
                        : <XCircle className="w-3 h-3" />}
                      {isActive ? "Ativo" : "Inativo"}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteConfirm(ch.id)}
                      disabled={deleting}
                      className="h-7 px-2 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Channel Dialog */}
      <CreateChannelDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={() => fetchChannels(true)}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirm !== null} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover canal?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá o canal do AI Engine.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConfirm) handleDeleteChannel(deleteConfirm);
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Solo API — Direct Connection ───────────────────────────────────────────────
interface WppInstance {
  id: string;
  instance_name: string;
  display_name: string;
  status: "awaiting_qr" | "connected" | "disconnected" | "error";
  phone: string | null;
  billing_active: boolean;
  connected_at: string | null;
}

interface ManageSoloResponse {
  instance?: WppInstance;
  qr_base64?: string;
  connected?: boolean;
  monthly_price?: number;
  deleted?: boolean;
  error?: string;
}

function SoloAPISection() {
  const { toast } = useToast();
  const [instanceName, setInstanceName] = useState("");
  const [instances, setInstances] = useState<WppInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [qrData, setQrData] = useState<{ base64: string; instanceId: string } | null>(null);
  const [pollingInstanceId, setPollingInstanceId] = useState<string | null>(null);
  const [monthlyPrice, setMonthlyPrice] = useState(100);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [qrExpired, setQrExpired] = useState(false);
  const pollingStartRef = useRef<number | null>(null);

  // Fetch instances from database on mount
  const fetchInstances = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("wpp_instances").select("*").order("created_at");
      if (error) throw error;
      setInstances(data as WppInstance[] || []);
    } catch (err) {
      console.error("instances fetch:", err);
      toast({ title: "Erro", description: "Não foi possível carregar as instâncias.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchInstances(); }, [fetchInstances]);

  // Polling for connection status (max 2 min / 120 sec)
  useEffect(() => {
    if (!pollingInstanceId) {
      pollingStartRef.current = null;
      setQrExpired(false);
      return;
    }

    pollingStartRef.current = Date.now();
    const maxWaitTime = 120000; // 2 minutes in ms

    const interval = setInterval(async () => {
      const elapsed = Date.now() - (pollingStartRef.current ?? Date.now());
      if (elapsed > maxWaitTime) {
        setQrExpired(true);
        setPollingInstanceId(null);
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke("manage-solo-instances", {
          body: { action: "status", instance_id: pollingInstanceId },
        });
        if (error) throw error;
        const response = data as ManageSoloResponse;
        if (response.instance) {
          setMonthlyPrice(response.monthly_price ?? 100);
          if (response.instance.status === "connected") {
            setPollingInstanceId(null);
            setQrData(null);
            setInstanceName("");
            setQrExpired(false);
            toast({ title: "Sucesso", description: `Instância ${response.instance.display_name} conectada!` });
            fetchInstances();
          } else {
            setInstances((prev) =>
              prev.map((inst) => (inst.id === pollingInstanceId ? response.instance! : inst))
            );
          }
        }
      } catch (err) {
        console.error("status poll:", err);
      }
    }, 5000); // 5s interval
    return () => clearInterval(interval);
  }, [pollingInstanceId, fetchInstances, toast]);

  const handleCreateAndConnect = async () => {
    if (!instanceName.trim()) return;
    setCreating(true);
    try {
      // Step 1: Create
      const createRes = await supabase.functions.invoke("manage-solo-instances", {
        body: { action: "create", display_name: instanceName },
      });
      if (createRes.error) throw new Error(createRes.error.message);
      const createData = createRes.data as ManageSoloResponse;
      if (createData.error) throw new Error(createData.error);
      setMonthlyPrice(createData.monthly_price ?? 100);

      // Step 2: Connect to get QR
      const connectRes = await supabase.functions.invoke("manage-solo-instances", {
        body: { action: "connect", instance_id: createData.instance!.id },
      });
      if (connectRes.error) throw new Error(connectRes.error.message);
      const connectData = connectRes.data as ManageSoloResponse;
      if (connectData.error) throw new Error(connectData.error);
      setMonthlyPrice(connectData.monthly_price ?? 100);

      if (connectData.qr_base64) {
        setQrData({ base64: connectData.qr_base64, instanceId: createData.instance!.id });
        setPollingInstanceId(createData.instance!.id);
        setInstances((prev) => [...prev, connectData.instance!]);
      }
    } catch (err: any) {
      console.error("create/connect:", err);
      toast({
        title: "Erro",
        description: err.message || "Erro ao criar/conectar instância.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleReconnect = async (instanceId: string) => {
    setActionLoading(instanceId);
    try {
      const { data, error } = await supabase.functions.invoke("manage-solo-instances", {
        body: { action: "connect", instance_id: instanceId },
      });
      if (error) throw error;
      const response = data as ManageSoloResponse;
      if (response.error) throw new Error(response.error);
      setMonthlyPrice(response.monthly_price ?? 100);
      if (response.qr_base64) {
        setQrData({ base64: response.qr_base64, instanceId });
        setPollingInstanceId(instanceId);
        setQrExpired(false);
      }
    } catch (err: any) {
      console.error("reconnect:", err);
      toast({ title: "Erro", description: err.message || "Erro ao reconectar.", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleLogout = async (instanceId: string) => {
    setActionLoading(instanceId);
    try {
      const { data, error } = await supabase.functions.invoke("manage-solo-instances", {
        body: { action: "logout", instance_id: instanceId },
      });
      if (error) throw error;
      const response = data as ManageSoloResponse;
      if (response.error) throw new Error(response.error);
      setMonthlyPrice(response.monthly_price ?? 100);
      toast({ title: "Sucesso", description: "Instância desconectada." });
      fetchInstances();
    } catch (err: any) {
      console.error("logout:", err);
      toast({ title: "Erro", description: err.message || "Erro ao desconectar.", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (instanceId: string) => {
    setActionLoading(instanceId);
    try {
      const { data, error } = await supabase.functions.invoke("manage-solo-instances", {
        body: { action: "delete", instance_id: instanceId },
      });
      if (error) throw error;
      const response = data as ManageSoloResponse;
      if (response.error) throw new Error(response.error);
      setMonthlyPrice(response.monthly_price ?? 100);
      toast({ title: "Sucesso", description: "Instância deletada." });
      setDeleteConfirm(null);
      fetchInstances();
    } catch (err: any) {
      console.error("delete:", err);
      toast({ title: "Erro", description: err.message || "Erro ao deletar.", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "connected":
        return { label: "Conectado", color: "text-emerald-700 bg-emerald-500/8 border-emerald-200/60", icon: CheckCircle2 };
      case "disconnected":
        return { label: "Desconectado — reconectar", color: "text-amber-700 bg-amber-500/8 border-amber-200/60", icon: WifiOff };
      case "awaiting_qr":
        return { label: "Aguardando QR", color: "text-blue-700 bg-blue-500/8 border-blue-200/60", icon: QrCode };
      case "error":
        return { label: "Erro", color: "text-red-700 bg-red-500/8 border-red-200/60", icon: AlertCircle };
      default:
        return { label: status, color: "text-muted-foreground bg-muted border-border", icon: WifiOff };
    }
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/8 border border-primary/15 text-primary rounded-md">
            <Plug className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Conexão Direta (Solo API)</h3>
            <p className="text-xs text-muted-foreground">
              +R$ {monthlyPrice}/mês por instância conectada
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Create & QR Section */}
        <div className="space-y-3">
          <div className="flex items-stretch gap-3">
            <input
              type="text"
              className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
              placeholder="Nome da instância (ex: solo-principal)"
              value={instanceName}
              onChange={(e) => {
                const val = e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
                if (val.length <= 30) setInstanceName(val);
              }}
              maxLength={30}
              disabled={pollingInstanceId !== null}
            />
            <Button
              onClick={handleCreateAndConnect}
              disabled={!instanceName.trim() || creating || pollingInstanceId !== null}
              className="gap-2 shrink-0"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
              Criar e gerar QR
            </Button>
          </div>

          {/* QR Display */}
          {qrData && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                  <QrCode className="w-3.5 h-3.5" />
                  QR Code — {instanceName}
                </div>
                <div className={cn(
                  "flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded border",
                  qrExpired
                    ? "text-red-700 bg-red-500/8 border-red-200/60"
                    : "text-yellow-700 bg-yellow-500/8 border-yellow-200/60"
                )}>
                  {qrExpired ? <AlertCircle className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
                  {qrExpired ? "QR expirado" : "Aguardando scan"}
                </div>
              </div>
              <div className="flex items-center justify-center bg-background p-4" style={{ minHeight: 220 }}>
                {qrExpired ? (
                  <div className="flex flex-col items-center gap-3">
                    <AlertCircle className="w-12 h-12 text-red-500/40" />
                    <p className="text-xs font-mono text-muted-foreground text-center">
                      O QR expirou. Gere um novo para reconectar.
                    </p>
                    <Button
                      size="sm"
                      onClick={() => handleReconnect(qrData.instanceId)}
                      disabled={actionLoading === qrData.instanceId}
                      className="gap-1.5"
                    >
                      {actionLoading === qrData.instanceId ? <Loader2 className="w-3 h-3 animate-spin" /> : <QrCode className="w-3 h-3" />}
                      Gerar novo QR
                    </Button>
                  </div>
                ) : (
                  <img src={qrData.base64} alt="QR Code" className="w-48 h-48 object-contain" />
                )}
              </div>
              <div className="px-4 py-2 bg-muted/30 border-t border-border text-[10px] text-muted-foreground text-center">
                {qrExpired ? "Clique em 'Gerar novo QR' para tentar novamente" : "Escaneie com seu telefone (expira em ~2 min)"}
              </div>
            </div>
          )}
        </div>

        {/* Instances List */}
        <div className="space-y-2">
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
            Instâncias
          </div>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : instances.length === 0 ? (
            <div className="py-6 text-center border border-dashed border-border rounded-lg text-xs font-mono text-muted-foreground/60">
              Nenhuma instância ainda
            </div>
          ) : (
            <div className="space-y-2">
              {instances.map((inst) => {
                const badge = getStatusBadge(inst.status);
                const BadgeIcon = badge.icon;
                return (
                  <div key={inst.id} className="flex items-center justify-between px-4 py-3 border border-border rounded-lg gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={cn("flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded border shrink-0", badge.color)}>
                        <BadgeIcon className="w-3 h-3" />
                        {badge.label}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground truncate">{inst.display_name}</div>
                        {inst.phone && (
                          <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground mt-0.5">
                            <Phone className="w-3 h-3" />
                            {inst.phone}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {inst.status === "disconnected" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleReconnect(inst.id)}
                          disabled={actionLoading === inst.id}
                          className="h-7 text-xs gap-1"
                        >
                          {actionLoading === inst.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wifi className="w-3 h-3" />}
                          Reconectar
                        </Button>
                      )}
                      {inst.status === "connected" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleLogout(inst.id)}
                          disabled={actionLoading === inst.id}
                          className="h-7 text-xs gap-1 text-amber-600 hover:bg-amber-500/10"
                        >
                          {actionLoading === inst.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <WifiOff className="w-3 h-3" />}
                          Desconectar
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteConfirm(inst.id)}
                        disabled={actionLoading === inst.id}
                        className="h-7 text-xs text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirm !== null} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar instância?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá a instância e a cobrança mensal de R$ {monthlyPrice} será cancelada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConfirm) handleDelete(deleteConfirm);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function ChannelsPage() {
  return (
    <div className="p-6 lg:p-8 max-w-[1100px] mx-auto space-y-6">
      <div className="border-b border-border pb-5">
        <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-muted-foreground mb-1">
          AI Studio / Canais
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Canais</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie os canais de mensagens conectados ao agente de IA.
        </p>
      </div>

      <LiveChannelsSection />
      <SoloAPISection />
    </div>
  );
}
