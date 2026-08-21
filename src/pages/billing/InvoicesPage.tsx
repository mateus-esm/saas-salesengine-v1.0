import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, ExternalLink, QrCode, Receipt } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useInvoices, formatBRL, formatDate, type Invoice, type InvoiceStatus } from "@/hooks/useBilling";
import { InvoiceStatusBadge } from "@/components/billing/InvoiceStatusBadge";
import { PixPaymentDialog } from "@/components/billing/PixPaymentDialog";

const KIND_LABEL: Record<string, string> = {
  setup: "Implantação",
  recurring: "Assinatura",
  credit_pack: "Recarga de créditos",
  adhoc: "Avulsa",
};

/** Sprint 8 T13 — invoice history, with payment where the customer already is. */
export default function InvoicesPage() {
  const [filter, setFilter] = useState<"all" | InvoiceStatus>("all");
  const { data: invoices, isLoading } = useInvoices();
  const [pixInvoice, setPixInvoice] = useState<Invoice | null>(null);
  const { toast } = useToast();

  const rows = (invoices ?? []).filter((i) => filter === "all" || i.status === filter);

  const copyPix = async (payload: string) => {
    try {
      await navigator.clipboard.writeText(payload);
      toast({ title: "Código PIX copiado" });
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Faturas</h1>
          <p className="text-sm text-muted-foreground mt-1">Histórico completo e pagamento.</p>
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="open">Em aberto</SelectItem>
            <SelectItem value="overdue">Vencidas</SelectItem>
            <SelectItem value="paid">Pagas</SelectItem>
            <SelectItem value="void">Canceladas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : !rows.length ? (
            <div className="py-16 text-center">
              <Receipt className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                {filter === "all" ? "Nenhuma fatura ainda." : "Nenhuma fatura com esse status."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {rows.map((inv) => {
                const payable = inv.status === "open" || inv.status === "overdue";
                return (
                  <div key={inv.id} className="flex items-center gap-4 px-4 py-3 flex-wrap sm:flex-nowrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{inv.number}</span>
                        <InvoiceStatusBadge status={inv.status} />
                      </div>

                      {/* What was actually bought. "Assinatura" or "Recarga" on
                          its own does not tell the customer which plan or which
                          wallet, which is the first thing they ask. */}
                      {inv.items?.length ? (
                        <ul className="mt-1 space-y-0.5">
                          {inv.items.map((it, idx) => (
                            <li key={idx} className="text-xs text-foreground/90">
                              {it.quantity > 1 && (
                                <span className="text-muted-foreground">{it.quantity}× </span>
                              )}
                              {it.description}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-foreground/90 mt-1">{KIND_LABEL[inv.kind] ?? inv.kind}</p>
                      )}

                      <p className="text-[11px] text-muted-foreground mt-1">
                        Emitida {formatDate(inv.issued_at ?? inv.created_at)}
                        {inv.due_date && ` · vence ${formatDate(inv.due_date)}`}
                        {inv.paid_at && ` · paga ${formatDate(inv.paid_at)}`}
                      </p>
                    </div>

                    <span className="text-sm font-bold tabular-nums">{formatBRL(inv.total)}</span>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {payable && inv.pix_payload && (
                        <>
                          <Button size="sm" onClick={() => setPixInvoice(inv)}>
                            <QrCode className="w-3.5 h-3.5 mr-1.5" /> Pagar
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => copyPix(inv.pix_payload!)}>
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                      {payable && !inv.pix_payload && inv.asaas_invoice_url && (
                        <Button asChild size="sm">
                          <a href={inv.asaas_invoice_url} target="_blank" rel="noopener noreferrer">
                            Pagar <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
                          </a>
                        </Button>
                      )}
                      {inv.status === "paid" && inv.asaas_invoice_url && (
                        <Button asChild size="sm" variant="ghost">
                          <a href={inv.asaas_invoice_url} target="_blank" rel="noopener noreferrer">
                            Recibo <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <PixPaymentDialog
        open={!!pixInvoice}
        onOpenChange={(o) => !o && setPixInvoice(null)}
        invoiceId={pixInvoice?.id ?? null}
        amount={pixInvoice?.total ?? 0}
        copyPaste={pixInvoice?.pix_payload ?? undefined}
      />
    </div>
  );
}
