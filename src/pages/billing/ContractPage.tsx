import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText } from "lucide-react";
import { useContract, formatBRL, formatDate } from "@/hooks/useBilling";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  draft:     { label: "Aguardando pagamento", className: "bg-muted text-muted-foreground" },
  active:    { label: "Ativo",                className: "bg-green-500/10 text-green-700 dark:text-green-300" },
  past_due:  { label: "Pagamento em atraso",  className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  suspended: { label: "Somente leitura",      className: "bg-red-500/10 text-red-700 dark:text-red-300" },
  cancelled: { label: "Cancelado",            className: "bg-muted text-muted-foreground" },
};

/** Sprint 8 T13 — what was contracted, at the price that was agreed. */
export default function ContractPage() {
  const { data, isLoading } = useContract();
  const contract = data?.contract;
  const items = data?.items ?? [];

  const monthly = items.filter((i) => i.period === "monthly");
  const oneTime = items.filter((i) => i.period === "one_time");

  // A negotiated discount is worth showing every time they open the page —
  // it is the value they won, and hiding it makes the price look arbitrary.
  const listTotal = monthly.reduce(
    (s, i) => s + (i.product?.list_price != null ? Number(i.product.list_price) : i.unit_price) * i.quantity, 0);
  const paidTotal = data?.monthlyTotal ?? 0;
  const discount = Math.max(0, listTotal - paidTotal);

  if (isLoading) {
    return <div className="p-6 max-w-4xl space-y-4"><Skeleton className="h-8 w-40" /><Skeleton className="h-48 w-full" /></div>;
  }

  if (!contract) {
    return (
      <div className="p-6 max-w-4xl">
        <h1 className="text-2xl font-bold tracking-tight">Contrato</h1>
        <Card className="mt-4">
          <CardContent className="py-16 text-center">
            <FileText className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum contrato ativo no momento.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const status = STATUS_LABEL[contract.status] ?? STATUS_LABEL.draft;

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight">Contrato</h1>
        <Badge variant="outline" className={`text-[11px] ${status.className}`}>{status.label}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Itens contratados</CardTitle>
          <CardDescription>Estes são os valores acordados para a sua conta.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {[...monthly, ...oneTime].map((item) => {
              const list = item.product?.list_price != null ? Number(item.product.list_price) : null;
              const hasDiscount = list != null && list > item.unit_price;
              return (
                <div key={item.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.product?.name ?? "Item do plano"}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.quantity > 1 && `${item.quantity} × `}
                      {item.period === "monthly" ? "mensal" : "pagamento único"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {hasDiscount && (
                      <p className="text-xs text-muted-foreground line-through">{formatBRL(list)}</p>
                    )}
                    <p className="text-sm font-semibold tabular-nums">
                      {formatBRL(item.unit_price * item.quantity)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-border px-4 py-3 flex items-center justify-between bg-muted/30">
            <div>
              <p className="text-sm font-semibold">Total mensal</p>
              {discount > 0 && (
                <p className="text-xs text-green-600 mt-0.5">
                  Você economiza {formatBRL(discount)} por mês
                </p>
              )}
            </div>
            <p className="text-lg font-bold tabular-nums">{formatBRL(paidTotal)}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Vigência</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3 text-sm">
          <Field label="Início" value={formatDate(contract.started_at)} />
          <Field label="Período atual até" value={formatDate(contract.current_period_end)} />
          <Field
            label="Prazo"
            value={contract.term_months ? `${contract.term_months} meses` : "Sem fidelidade"}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium mt-0.5">{value}</p>
    </div>
  );
}
