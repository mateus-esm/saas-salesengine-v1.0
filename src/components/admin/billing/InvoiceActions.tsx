import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, Loader2, MoreHorizontal, Pencil, Trash2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatBRL } from "@/hooks/useBilling";

export interface InvoiceRow {
  id: string;
  number: string;
  status: string;
  total: number;
  due_date: string | null;
  kind?: string;
}

type Op = "mark_paid" | "edit" | "void" | "delete";

/**
 * Sprint 8.3 (Fixes 2, item 6) — operate an invoice, not just look at it.
 *
 * Every action goes through the `admin-billing-ops` edge function rather than
 * straight to the database, because each one has a second half at Asaas: a
 * cancelled invoice whose boleto stays live keeps asking the customer for money
 * we already gave up on. The browser cannot hold the gateway key, so the pairing
 * happens server-side and this component only reports what came back.
 *
 * WHICH ACTIONS APPEAR IS NOT COSMETIC. A paid invoice offers nothing: undoing a
 * payment is a refund, with its own effect of reversing the credits it granted.
 * Delete appears only for a draft that never reached the gateway.
 */
export function InvoiceActions({ invoice }: { invoice: InvoiceRow }) {
  const [op, setOp] = useState<Op | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(invoice.due_date ?? "");
  const [amount, setAmount] = useState(String(invoice.total ?? ""));
  const [description, setDescription] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const settled = invoice.status === "paid" || invoice.status === "refunded";
  const canDelete = invoice.status === "draft";
  const canEdit = ["draft", "open", "overdue"].includes(invoice.status);
  const canVoid = !settled && invoice.status !== "void";

  const run = async (action: string, body: Record<string, unknown>, okTitle: string) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-billing-ops", {
        body: { action, invoice_id: invoice.id, ...body },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message ?? data.error);

      // The gateway half is reported separately: our books can be right while
      // Asaas refused, and hiding that would leave a live charge nobody knows about.
      const gatewayWarning =
        data?.gateway === "failed"
          ? " A cobrança no Asaas NÃO foi atualizada — verifique lá."
          : "";

      toast({
        title: okTitle,
        description: `${invoice.number}${gatewayWarning}`,
        variant: gatewayWarning ? "destructive" : undefined,
      });
      setOp(null);
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
      qc.invalidateQueries({ queryKey: ["admin-team-billing"] });
    } catch (e) {
      toast({
        title: "Não foi possível concluir",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  if (settled && invoice.status === "paid") {
    // Nothing to offer, but the row should not look broken next to the others.
    return <div className="w-8" aria-hidden />;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Ações da fatura">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {canVoid && (
            <DropdownMenuItem onClick={() => setOp("mark_paid")}>
              <CheckCircle2 className="w-3.5 h-3.5 mr-2" /> Marcar como paga
            </DropdownMenuItem>
          )}
          {canEdit && (
            <DropdownMenuItem onClick={() => setOp("edit")}>
              <Pencil className="w-3.5 h-3.5 mr-2" /> Editar valor ou vencimento
            </DropdownMenuItem>
          )}
          {(canVoid || canDelete) && <DropdownMenuSeparator />}
          {canVoid && (
            <DropdownMenuItem onClick={() => setOp("void")} className="text-destructive focus:text-destructive">
              <XCircle className="w-3.5 h-3.5 mr-2" /> Cancelar fatura
            </DropdownMenuItem>
          )}
          {canDelete && (
            <DropdownMenuItem onClick={() => setOp("delete")} className="text-destructive focus:text-destructive">
              <Trash2 className="w-3.5 h-3.5 mr-2" /> Apagar rascunho
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* ── Marcar como paga ── */}
      <Dialog open={op === "mark_paid"} onOpenChange={(o) => !o && setOp(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar {invoice.number} como paga</DialogTitle>
            <DialogDescription>
              Use quando o dinheiro entrou fora do Asaas — PIX ou transferência direta. Isto dispara
              exatamente o mesmo que um pagamento confirmado pelo gateway: libera os créditos do
              plano, renova o período do contrato e religa o agente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Data do pagamento</Label>
              <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Observação</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="PIX recebido na conta PJ, comprovante no Drive…"
                rows={2}
              />
              <p className="text-[11px] text-muted-foreground">
                Fica gravado na fatura. É o que vai permitir separar depois o que entrou pelo Asaas
                do que você recebeu na mão.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOp(null)} disabled={busy}>Cancelar</Button>
            <Button
              onClick={() => run("mark_paid",
                { note: note || null, paid_at: new Date(`${paidAt}T12:00:00`).toISOString() },
                "Pagamento registrado")}
              disabled={busy}
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirmar pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Editar ── */}
      <Dialog open={op === "edit"} onOpenChange={(o) => !o && setOp(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar {invoice.number}</DialogTitle>
            <DialogDescription>
              Vale para fatura ainda não paga. Se ela já tem cobrança no Asaas, a cobrança é
              atualizada junto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Novo vencimento</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              {invoice.status === "overdue" && (
                <p className="text-[11px] text-muted-foreground">
                  Uma data futura tira a fatura de "vencida" e ela volta a ficar em aberto.
                </p>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor</Label>
                <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Descrição</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="opcional" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Fatura com mais de uma linha não pode ser reprecificada por aqui — o servidor recusa em
              vez de jogar as outras linhas fora. Nesse caso, cancele e emita outra.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOp(null)} disabled={busy}>Cancelar</Button>
            <Button
              onClick={() => {
                const n = Number(amount);
                run("update_invoice", {
                  due_date: dueDate || null,
                  description: description || null,
                  // Unchanged amount is sent as null so a multi-line invoice can
                  // still have its due date moved without hitting the guard.
                  amount: n && n !== Number(invoice.total) ? n : null,
                }, "Fatura atualizada");
              }}
              disabled={busy}
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cancelar ── */}
      <Dialog open={op === "void"} onOpenChange={(o) => !o && setOp(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar {invoice.number}?</DialogTitle>
            <DialogDescription>
              {formatBRL(invoice.total)}. A fatura continua no histórico como cancelada — some das
              cobranças, não some dos registros. A cobrança no Asaas é cancelada junto, então o
              cliente para de receber o boleto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Motivo</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="cobrança indevida, duplicada…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOp(null)} disabled={busy}>Voltar</Button>
            <Button
              variant="destructive"
              onClick={() => run("void_invoice", { reason: reason || null }, "Fatura cancelada")}
              disabled={busy}
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Cancelar fatura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Apagar rascunho ── */}
      <Dialog open={op === "delete"} onOpenChange={(o) => !o && setOp(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar o rascunho {invoice.number}?</DialogTitle>
            <DialogDescription>
              Some de vez. Só é permitido porque este rascunho nunca virou cobrança — ninguém
              chegou a ver nem a dever este valor.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOp(null)} disabled={busy}>Voltar</Button>
            <Button
              variant="destructive"
              onClick={() => run("delete_invoice", {}, "Rascunho apagado")}
              disabled={busy}
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Apagar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
