import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CalendarClock, Check, ExternalLink, Receipt } from "lucide-react";
import { Link } from "react-router-dom";
import { formatBRL } from "@/hooks/useBilling";

export interface BuilderPurchaseResult {
  hours: number;
  total: number;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceUrl: string | null;
  schedulingUrl: string | null;
}

/**
 * Sprint 8.1 fix · item 3 — what happens AFTER buying Builder hours.
 *
 * Buying hours is only half the transaction: the customer then has to book them.
 * Ending on a toast left the purchase in a dead end, so the hours sat unused and
 * it read as "I paid and nothing happened".
 *
 * Two explicit next steps: pay the invoice, and book the time. The scheduling
 * button only appears once a calendar URL is configured on the product — a
 * button that goes nowhere is worse than no button, so until then it says
 * plainly that we will reach out.
 */
export function BuilderPurchaseDialog({
  result, open, onOpenChange,
}: {
  result: BuilderPurchaseResult | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  if (!result) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mb-2">
            <Check className="w-6 h-6 text-green-600" />
          </div>
          <DialogTitle className="text-center">
            {result.hours} {result.hours === 1 ? "hora" : "horas"} de Builder Mode
          </DialogTitle>
          <DialogDescription className="text-center">
            {formatBRL(result.total)} — fatura {result.invoiceNumber ?? "gerada"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5">
          {/* Step 1 — pay */}
          <div className="rounded-lg border border-border p-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <Receipt className="w-4 h-4 text-muted-foreground" />
              1. Pagamento
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              A fatura já está disponível. Pague por PIX, boleto ou cartão.
            </p>
            <div className="flex gap-2 mt-2">
              {result.invoiceUrl && (
                <Button asChild size="sm" className="flex-1">
                  <a href={result.invoiceUrl} target="_blank" rel="noopener noreferrer">
                    Pagar agora <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
                  </a>
                </Button>
              )}
              <Button asChild size="sm" variant="outline" className="flex-1">
                <Link to="/billing/faturas" onClick={() => onOpenChange(false)}>
                  Ver faturas
                </Link>
              </Button>
            </div>
          </div>

          {/* Step 2 — book */}
          <div className="rounded-lg border border-border p-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-muted-foreground" />
              2. Agendamento
            </p>
            {result.schedulingUrl ? (
              <>
                <p className="text-xs text-muted-foreground mt-1">
                  Escolha o melhor horário para executarmos as automações.
                </p>
                <Button asChild size="sm" className="w-full mt-2">
                  <a href={result.schedulingUrl} target="_blank" rel="noopener noreferrer">
                    Agendar horário <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
                  </a>
                </Button>
              </>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                Entraremos em contato para combinar o melhor horário assim que o pagamento for confirmado.
              </p>
            )}
          </div>
        </div>

        <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
      </DialogContent>
    </Dialog>
  );
}
