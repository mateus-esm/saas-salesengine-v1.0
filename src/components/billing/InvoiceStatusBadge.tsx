import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { InvoiceStatus } from "@/hooks/useBilling";

/**
 * Sprint 8 T13 — one vocabulary for invoice state.
 *
 * Defined once so the overview, the invoice list and the admin panel can never
 * describe the same invoice with different words.
 */
const STATUS: Record<InvoiceStatus, { label: string; className: string }> = {
  draft:    { label: "Rascunho",  className: "bg-muted text-muted-foreground border-border" },
  open:     { label: "Em aberto", className: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20" },
  paid:     { label: "Paga",      className: "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20" },
  overdue:  { label: "Vencida",   className: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20" },
  void:     { label: "Cancelada", className: "bg-muted text-muted-foreground border-border line-through" },
  refunded: { label: "Estornada", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20" },
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const s = STATUS[status] ?? STATUS.draft;
  return (
    <Badge variant="outline" className={cn("text-[10px] font-medium px-2 py-0", s.className)}>
      {s.label}
    </Badge>
  );
}
