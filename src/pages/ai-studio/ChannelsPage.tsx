import { useState, useEffect, useCallback } from "react";
import { MessageSquare, Plug, CheckCircle2, XCircle, Loader2, ExternalLink, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Channel {
  id: string;
  name: string;
  type: string;
  status: "active" | "inactive" | "connecting";
  phone?: string;
  connectedAt?: string;
}

// --- GPT Maker Channels ---
function GPTMakerChannels() {
  const { toast } = useToast();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchChannels = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("manage-agent-channels");
      if (error) throw error;
      const items = data?.data || data || [];
      setChannels(Array.isArray(items) ? items : []);
    } catch (err) {
      console.error("Error fetching channels:", err);
      toast({ title: "Erro", description: "Não foi possível carregar os canais.", variant: "destructive" });
      setChannels([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const statusConfig = {
    active: { icon: CheckCircle2, label: "Ativo", color: "text-emerald-600 bg-emerald-500/10 border-emerald-200" },
    inactive: { icon: XCircle, label: "Inativo", color: "text-muted-foreground bg-muted/60 border-border" },
    connecting: { icon: Loader2, label: "Conectando", color: "text-yellow-600 bg-yellow-500/10 border-yellow-200" },
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/8 text-primary rounded-md border border-primary/15">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">GPT Maker — Canais Ativos</h3>
            <p className="text-xs text-muted-foreground">
              Instâncias WhatsApp / Instagram conectadas ao agente.
            </p>
          </div>
        </div>
        <button
          onClick={fetchChannels}
          className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
        >
          Atualizar
        </button>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : channels.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-lg">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nenhum canal encontrado.</p>
            <p className="text-xs mt-1">Conecte um canal no painel do GPT Maker.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {channels.map((ch) => {
              const sc = statusConfig[ch.status] ?? statusConfig.inactive;
              const StatusIcon = sc.icon;
              return (
                <div key={ch.id} className="flex items-center justify-between py-3 px-1">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">{ch.name}</div>
                      {ch.phone && (
                        <div className="text-xs font-mono text-muted-foreground">{ch.phone}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {ch.connectedAt && (
                      <div className="hidden sm:flex items-center gap-1 text-xs font-mono text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {ch.connectedAt}
                      </div>
                    )}
                    <span
                      className={cn(
                        "flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded border",
                        sc.color
                      )}
                    >
                      <StatusIcon className={cn("w-3 h-3", ch.status === "connecting" && "animate-spin")} />
                      {sc.label}
                    </span>
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

// --- Solo API Placeholder ---
function SoloAPIPlaceholder() {
  return (
    <div className="border border-dashed border-border rounded-lg bg-muted/20 overflow-hidden">
      <div className="px-5 py-4 border-b border-dashed border-border flex items-center gap-3">
        <div className="p-2 bg-muted/60 text-muted-foreground rounded-md border border-border">
          <Plug className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Solo API — Whatsmeow</h3>
            <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 text-muted-foreground">
              EM BREVE
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Canal direto via instância Go/Whatsmeow sem dependência de terceiros.
          </p>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: "ENDPOINT", value: "wss://api.solo.app/ws/:instanceId", desc: "WebSocket de conexão" },
            { label: "AUTH", value: "Bearer JWT + Instance Key", desc: "Autenticação dupla" },
            { label: "PROTOCOLO", value: "Whatsmeow (Go)", desc: "Implementação nativa" },
            { label: "STATUS", value: "Planejado — Sprint v3", desc: "Não disponível ainda" },
          ].map(({ label, value, desc }) => (
            <div key={label} className="p-3 rounded-md border border-border/50 bg-background/60">
              <div className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-wider mb-1">
                {label}
              </div>
              <div className="text-xs font-mono text-foreground/70 truncate">{value}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{desc}</div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          Integração com Whatsmeow permitirá envio/recebimento direto sem plataformas intermediárias.
        </p>
      </div>
    </div>
  );
}

// --- Main Page ---
export default function ChannelsPage() {
  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      {/* Page Header */}
      <div className="border-b border-border pb-5">
        <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-muted-foreground mb-1">
          AI Studio / Canais
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Canais</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie os canais de mensagens conectados ao agente de IA.
        </p>
      </div>

      <GPTMakerChannels />
      <SoloAPIPlaceholder />
    </div>
  );
}
