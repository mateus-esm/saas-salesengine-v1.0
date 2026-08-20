import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Copy, Loader2, QrCode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatBRL, useRefreshBilling } from "@/hooks/useBilling";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string | null;
  amount: number;
  qrCodeBase64?: string;
  copyPaste?: string;
}

/**
 * Sprint 8 T13 — PIX payment.
 *
 * Polls invoices.status while open. The webhook flips that column when Asaas
 * confirms, so the customer sees "Pagamento confirmado" the moment it lands
 * instead of being told to reload and hope. That visible confirmation is the
 * whole promise of the sprint made legible in one screen.
 */
export function PixPaymentDialog({ open, onOpenChange, invoiceId, amount, qrCodeBase64, copyPaste }: Props) {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const { toast } = useToast();
  const refreshBilling = useRefreshBilling();

  useEffect(() => {
    if (!open) { setConfirmed(false); setCopied(false); }
  }, [open]);

  useEffect(() => {
    if (!open || !invoiceId || confirmed) return;

    let cancelled = false;
    const timer = setInterval(async () => {
      const { data } = await supabase
        .from("invoices").select("status").eq("id", invoiceId).maybeSingle();
      if (cancelled) return;
      if (data?.status === "paid") {
        setConfirmed(true);
        refreshBilling();
      }
    }, 5000);

    return () => { cancelled = true; clearInterval(timer); };
  }, [open, invoiceId, confirmed, refreshBilling]);

  const copy = async () => {
    if (!copyPaste) return;
    try {
      await navigator.clipboard.writeText(copyPaste);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast({ title: "Não foi possível copiar", description: "Copie o código manualmente.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {confirmed ? (
          <div className="py-8 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
              <Check className="w-7 h-7 text-green-600" />
            </div>
            <h3 className="text-lg font-bold">Pagamento confirmado!</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Tudo certo. Seus créditos e seu acesso já estão liberados.
            </p>
            <Button className="mt-6 w-full" onClick={() => onOpenChange(false)}>Fechar</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <QrCode className="w-5 h-5" /> Pague com PIX
              </DialogTitle>
              <DialogDescription>
                {formatBRL(amount)} — o pagamento é confirmado automaticamente.
              </DialogDescription>
            </DialogHeader>

            {qrCodeBase64 ? (
              <div className="flex justify-center py-2">
                <img
                  src={`data:image/png;base64,${qrCodeBase64}`}
                  alt="QR Code PIX"
                  className="w-52 h-52 rounded-lg border border-border bg-white p-2"
                />
              </div>
            ) : (
              <div className="w-52 h-52 mx-auto rounded-lg border border-border flex items-center justify-center bg-muted/40">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {copyPaste && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">PIX copia e cola</p>
                <div className="flex gap-2">
                  <code className="flex-1 text-[11px] bg-muted rounded-md px-3 py-2 truncate font-mono">
                    {copyPaste}
                  </code>
                  <Button size="sm" variant="outline" onClick={copy} className="shrink-0">
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground flex items-center gap-2 justify-center pt-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Aguardando confirmação…
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
