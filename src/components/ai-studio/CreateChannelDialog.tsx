import { useState, useEffect, useCallback, useRef } from "react";
import {
  MessageSquare, Phone, Instagram, Send, Globe, Store,
  Loader2, QrCode, CheckCircle2, AlertCircle, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import QRCode from "react-qr-code";

// ── Channel type config ────────────────────────────────────────────────────
const CHANNEL_TYPES = [
  {
    value: "WHATSAPP",
    label: "WhatsApp",
    description: "WhatsApp não-oficial (QR code)",
    icon: MessageSquare
  },
  {
    value: "CLOUD_API",
    label: "WhatsApp Cloud API",
    description: "WhatsApp oficial (Cloud API)",
    icon: MessageSquare
  },
  {
    value: "INSTAGRAM",
    label: "Instagram",
    description: "Instagram Direct",
    icon: Instagram
  },
  {
    value: "TELEGRAM",
    label: "Telegram",
    description: "Telegram bot",
    icon: Send
  },
  {
    value: "WIDGET",
    label: "Widget",
    description: "Chat no seu site",
    icon: Globe
  },
  {
    value: "MESSENGER",
    label: "Messenger",
    description: "Facebook Messenger",
    icon: Phone
  },
  {
    value: "MERCADO_LIVRE",
    label: "Mercado Livre",
    description: "Mercado Livre",
    icon: Store
  },
];

interface CreateChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateChannelDialog({ open, onOpenChange, onSuccess }: CreateChannelDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<"create" | "qr">("create");
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [qrConnected, setQrConnected] = useState(false);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [refreshingQr, setRefreshingQr] = useState(false);
  const qrConnectedNotifiedRef = useRef(false);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setStep("create");
      setName("");
      setType("");
      setQrValue(null);
      setQrConnected(false);
      setChannelId(null);
      setRefreshingQr(false);
      qrConnectedNotifiedRef.current = false;
    }
  }, [open]);

  const handleCreate = async () => {
    if (!name.trim() || !type) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos.",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-agent-channels", {
        body: { action: "create", name: name.trim(), type },
      });

      if (error) throw new Error(error.message);
      if (data?.message) throw new Error(data.message);

      const createdId = data?.id;
      if (!createdId) throw new Error("Nenhum ID retornado");

      // If WhatsApp, show QR; otherwise, close and success
      if (type === "WHATSAPP") {
        setChannelId(createdId);
        await fetchQr(createdId);
        setStep("qr");
      } else {
        toast({
          title: "Sucesso",
          description: "Canal criado — finalize a configuração no painel do canal",
        });
        onOpenChange(false);
        onSuccess();
      }
    } catch (err: any) {
      console.error("create channel:", err);
      toast({
        title: "Erro",
        description: err.message || "Erro ao criar canal.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchQr = useCallback(async (id: string, silent = false) => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-agent-channels", {
        body: { action: "qr", channel_id: id },
      });

      if (error) throw new Error(error.message);
      if (data?.message) throw new Error(data.message);

      const connected = data?.connected === true;
      setQrConnected(connected);
      if (data?.qr_value) {
        setQrValue(data.qr_value);
      } else if (connected) {
        setQrValue(null);
      }
      if (connected && !qrConnectedNotifiedRef.current) {
        qrConnectedNotifiedRef.current = true;
        toast({
          title: "Sucesso",
          description: "Canal conectado!",
        });
        onSuccess();
      }
    } catch (err: any) {
      console.error("fetch qr:", err);
      if (!silent) {
        toast({
          title: "Erro",
          description: err.message || "Erro ao buscar QR.",
          variant: "destructive",
        });
      }
    }
  }, [onSuccess, toast]);

  useEffect(() => {
    if (!open || step !== "qr" || !channelId || qrConnected) return;

    const interval = window.setInterval(() => {
      void fetchQr(channelId, true);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [channelId, fetchQr, open, qrConnected, step]);

  const handleRefreshQr = async () => {
    if (!channelId) return;
    setRefreshingQr(true);
    await fetchQr(channelId);
    setRefreshingQr(false);
  };

  const handleQrSuccess = () => {
    if (!qrConnectedNotifiedRef.current) {
      toast({
        title: "Sucesso",
        description: "Canal conectado!",
      });
      onSuccess();
    }
    onOpenChange(false);
  };

  const selectedTypeConfig = CHANNEL_TYPES.find(t => t.value === type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {step === "create" ? (
          <>
            <DialogHeader>
              <DialogTitle>Criar novo canal</DialogTitle>
              <DialogDescription>
                Configure um novo canal para o AI Engine
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Name Input */}
              <div className="space-y-2">
                <Label htmlFor="channel-name" className="text-sm font-medium">
                  Nome do canal
                </Label>
                <Input
                  id="channel-name"
                  placeholder="Ex: WhatsApp Vendas"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                  autoFocus
                />
              </div>

              {/* Type Select */}
              <div className="space-y-2">
                <Label htmlFor="channel-type" className="text-sm font-medium">
                  Tipo de canal
                </Label>
                <Select value={type} onValueChange={setType} disabled={loading}>
                  <SelectTrigger id="channel-type">
                    <SelectValue placeholder="Selecione um tipo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNEL_TYPES.map((ct) => {
                      const Icon = ct.icon;
                      return (
                        <SelectItem key={ct.value} value={ct.value}>
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4" />
                            {ct.label}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {selectedTypeConfig && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedTypeConfig.description}
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCreate}
                disabled={loading || !name.trim() || !type}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Criando...
                  </>
                ) : (
                  "Criar canal"
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>QR Code — {name}</DialogTitle>
              <DialogDescription>
                Escaneie o código QR com seu telefone
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* QR Status */}
              <div className={cn(
                "flex items-center gap-2 text-sm px-3 py-2 rounded border",
                qrConnected
                  ? "text-emerald-700 bg-emerald-500/8 border-emerald-200/60"
                  : "text-amber-700 bg-amber-500/8 border-amber-200/60"
              )}>
                {qrConnected ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Conectado com sucesso
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4" />
                    Aguardando scan
                  </>
                )}
              </div>

              {/* QR Display */}
              {qrConnected ? (
                <div className="flex flex-col items-center justify-center gap-2 p-8 bg-muted/30 rounded-lg border border-border">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                  <p className="text-sm font-medium text-foreground">Canal conectado</p>
                </div>
              ) : qrValue ? (
                <div className="flex justify-center p-4 bg-muted/30 rounded-lg border border-border">
                  <QRCode
                    value={qrValue}
                    size={200}
                    level="H"
                  />
                </div>
              ) : (
                <div className="flex justify-center p-8 bg-muted/30 rounded-lg border border-border">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              )}

              <p className="text-xs text-muted-foreground text-center">
                {qrConnected
                  ? "Seu canal foi conectado com sucesso!"
                  : "Clique em 'Atualizar QR' se o código não funcionar (expira em ~2 min)"}
              </p>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleRefreshQr}
                disabled={refreshingQr || qrConnected}
                className="gap-2"
              >
                {refreshingQr ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Atualizar QR
              </Button>
              <Button
                onClick={handleQrSuccess}
                disabled={!qrConnected}
              >
                {qrConnected ? "Pronto" : "Aguardando..."}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
