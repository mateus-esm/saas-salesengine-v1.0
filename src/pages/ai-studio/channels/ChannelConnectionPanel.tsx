import { useState, useEffect, useCallback, useRef } from "react";
import {
  Loader2, QrCode, CheckCircle2, RefreshCw, ExternalLink, AlertCircle, Info,
} from "lucide-react";
import QRCode from "react-qr-code";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { capabilityFor } from "@/lib/channel-capabilities";

interface Props {
  channelId: string;
  channelType: string;
  connected: boolean;
  onConnected: () => void;
}

const POLL_MS = 4000;
const POLL_TIMEOUT_MS = 2 * 60 * 1000;

export function ChannelConnectionPanel({ channelId, channelType, connected, onConnected }: Props) {
  const cap = capabilityFor(channelType);
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const startedAt = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, []);

  const fetchQr = useCallback(async (isPoll = false) => {
    if (!isPoll) { setLoading(true); setQrError(null); setExpired(false); startedAt.current = Date.now(); }
    try {
      const { data, error } = await supabase.functions.invoke("manage-agent-channels", {
        body: { action: "qr", channel_id: channelId },
      });
      if (error) throw error;
      if (data?.message) throw new Error(data.message);

      if (data?.connected) { setQr(null); stopPolling(); onConnected(); return; }
      setQr(data?.qr_value ?? null);

      // Keep polling until paired or the window closes.
      if (startedAt.current && Date.now() - startedAt.current > POLL_TIMEOUT_MS) {
        setExpired(true); stopPolling(); return;
      }
      timer.current = setTimeout(() => fetchQr(true), POLL_MS);
    } catch (err) {
      stopPolling();
      // The common real case: this row is typed WHATSAPP but is actually an
      // officially-connected channel, so no QR instance exists. Say that
      // instead of showing a bare upstream error.
      setQrError(String((err as any)?.message ?? err));
    } finally { if (!isPoll) setLoading(false); }
  }, [channelId, onConnected, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  if (connected) {
    return (
      <div className="flex items-center gap-2.5 p-4 rounded-lg border border-emerald-200/60 bg-emerald-500/5 text-sm">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
        <span className="text-foreground">Canal conectado e recebendo mensagens.</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Steps — brand-free by design (Sprint 7.2 T12 white-label sweep). */}
      <ol className="space-y-2">
        {cap.connectionSteps.map((step, i) => (
          <li key={i} className="flex gap-2.5 text-sm text-muted-foreground leading-snug">
            <span className="shrink-0 w-5 h-5 rounded-full bg-muted text-[10px] font-mono font-bold
                             text-foreground flex items-center justify-center mt-px">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      {cap.connection === "qr" && (
        <div className="border border-border rounded-lg p-5 bg-card flex flex-col items-center gap-3">
          {qr ? (
            <>
              <div className="bg-white p-3 rounded-lg border border-border">
                <QRCode value={qr} size={188} />
              </div>
              <p className="text-[11px] font-mono text-muted-foreground">
                Aguardando leitura…
              </p>
            </>
          ) : qrError ? (
            <div className="text-center space-y-2">
              <AlertCircle className="w-7 h-7 mx-auto text-muted-foreground/60" />
              <p className="text-sm font-medium text-foreground">QR code indisponível</p>
              <p className="text-[11px] text-muted-foreground max-w-sm mx-auto break-words">
                Este canal provavelmente usa conexão oficial, que não tem QR code.
                Nesse caso a conexão é feita no console do provedor.
              </p>
              <p className="text-[10px] font-mono text-muted-foreground/70 break-all">{qrError}</p>
            </div>
          ) : expired ? (
            <div className="text-center space-y-2">
              <AlertCircle className="w-7 h-7 mx-auto text-muted-foreground/60" />
              <p className="text-sm text-foreground">O QR code expirou.</p>
            </div>
          ) : (
            <div className="text-center space-y-2 py-2">
              <QrCode className="w-8 h-8 mx-auto text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">
                Gere o QR code para parear este canal.
              </p>
            </div>
          )}

          <Button size="sm" variant={qr ? "ghost" : "default"} className="gap-1.5 text-xs"
                  onClick={() => fetchQr(false)} disabled={loading}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {qr || expired || qrError ? "Gerar novo QR code" : "Gerar QR code"}
          </Button>
        </div>
      )}

      {(cap.connection === "credentials" || cap.connection === "oauth") && (
        <div className="flex items-start gap-2.5 p-4 rounded-lg border border-border bg-muted/20 text-xs text-muted-foreground">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground/70" />
          <span>
            {cap.connection === "oauth"
              ? "Este canal exige um login externo (OAuth). Não existe rota de autorização na API, então a conexão precisa ser concluída fora daqui."
              : "Este canal exige credenciais que a API não aceita receber. A conexão precisa ser concluída fora daqui."}{" "}
            Depois de conectar, use <strong className="font-semibold text-foreground/80">Atualizar</strong> na
            lista de canais para ver o status novo.
          </span>
        </div>
      )}

      {cap.connection === "instant" && (
        <div className="flex items-center gap-2.5 p-4 rounded-lg border border-border bg-muted/20 text-xs text-muted-foreground">
          <ExternalLink className="w-4 h-4 shrink-0 text-muted-foreground/70" />
          <span>Nada a conectar — vá para a aba <strong className="font-semibold text-foreground/80">Instalação</strong>.</span>
        </div>
      )}
    </div>
  );
}
