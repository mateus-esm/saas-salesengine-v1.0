import { useState, useEffect, useCallback } from "react";
import {
  MessageSquare, Instagram, Globe, Plug, CheckCircle2,
  XCircle, Loader2, RefreshCw, QrCode, Wifi, WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Solo API — Direct Connection ───────────────────────────────────────────────
interface SoloInstance {
  id: string;
  name: string;
  status: "connected" | "disconnected";
}

function SoloAPISection() {
  const [instanceName, setInstanceName] = useState("");
  const [showQR, setShowQR] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [instances] = useState<SoloInstance[]>([]); // backend pending

  const handleGenerateQR = () => {
    if (!instanceName.trim()) return;
    setConnecting(true);
    // Simulate loading — backend not implemented yet
    setTimeout(() => { setShowQR(true); setConnecting(false); }, 1200);
  };

  return (
    <div className="border border-dashed border-border rounded-lg overflow-hidden bg-card">
      <div className="px-5 py-4 border-b border-dashed border-border flex items-center gap-3">
        <div className="p-2 bg-muted border border-border text-muted-foreground rounded-md">
          <Plug className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Conexão Direta (Solo API)</h3>
            <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 text-muted-foreground">
              EM BREVE
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Instância Whatsmeow direta — sem intermediários de terceiros.
          </p>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* QR Code Input */}
        <div className="flex items-stretch gap-3">
          <input
            type="text"
            className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
            placeholder="Nome da instância (ex: solo-principal)"
            value={instanceName}
            onChange={(e) => setInstanceName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
          />
          <Button
            onClick={handleGenerateQR}
            disabled={!instanceName.trim() || connecting}
            className="gap-2 shrink-0"
            variant="outline"
          >
            {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
            Gerar QR Code
          </Button>
        </div>

        {/* QR Skeleton / Placeholder */}
        <div className={cn(
          "border border-border rounded-lg overflow-hidden transition-all",
          showQR ? "opacity-100" : "opacity-50"
        )}>
          <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
              <QrCode className="w-3.5 h-3.5" />
              QR Code — {instanceName || "aguardando nome"}
            </div>
            <div className={cn(
              "flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded border",
              showQR
                ? "text-yellow-600 bg-yellow-500/10 border-yellow-200/60"
                : "text-muted-foreground bg-muted border-border"
            )}>
              {showQR ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {showQR ? "Aguardando scan" : "Não iniciado"}
            </div>
          </div>

          {/* QR placeholder box */}
          <div className="flex items-center justify-center bg-background" style={{ height: 220 }}>
            {showQR ? (
              <div className="flex flex-col items-center gap-3">
                {/* Animated skeleton QR */}
                <div className="w-40 h-40 rounded-lg border-2 border-dashed border-primary/30 bg-muted/20 animate-pulse flex items-center justify-center">
                  <QrCode className="w-16 h-16 text-primary/20" />
                </div>
                <p className="text-xs font-mono text-muted-foreground">
                  Backend não implementado — placeholder de UI
                </p>
              </div>
            ) : (
              <div className="text-center text-xs font-mono text-muted-foreground/50">
                <QrCode className="w-12 h-12 mx-auto mb-2 opacity-20" />
                O QR Code aparecerá aqui
              </div>
            )}
          </div>
        </div>

        {/* Connected instances list */}
        <div className="space-y-2">
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
            Instâncias Conectadas
          </div>
          {instances.length === 0 ? (
            <div className="py-6 text-center border border-dashed border-border rounded-lg text-xs font-mono text-muted-foreground/60">
              Nenhuma instância ativa (backend pendente)
            </div>
          ) : (
            instances.map((inst) => (
              <div key={inst.id} className="flex items-center justify-between px-4 py-3 border border-border rounded-lg">
                <div className="flex items-center gap-2 text-sm font-mono text-foreground">
                  <Wifi className="w-4 h-4 text-emerald-500" />
                  {inst.name}
                </div>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:bg-destructive/10">
                  Desconectar
                </Button>
              </div>
            ))
          )}
        </div>

        {/* Tech spec */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { k: "PROTOCOLO", v: "Whatsmeow (Go)" },
            { k: "TRANSPORT", v: "WebSocket / gRPC" },
            { k: "AUTH", v: "JWT + Instance Key" },
            { k: "STATUS", v: "Sprint v3" },
          ].map(({ k, v }) => (
            <div key={k} className="p-2.5 rounded-md border border-border/50 bg-muted/20">
              <div className="text-[9px] font-mono font-bold text-muted-foreground uppercase tracking-widest mb-1">{k}</div>
              <div className="text-[11px] font-mono text-foreground/70">{v}</div>
            </div>
          ))}
        </div>
      </div>
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
