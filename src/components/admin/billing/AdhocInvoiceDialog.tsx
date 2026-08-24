import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * Sprint 8.3 (Fixes 2, item 6) — bill something that is not in the catalogue.
 *
 * `kind = 'adhoc'` has been in the schema since Sprint 8 and nothing ever
 * created one, so anything outside a plan or a credit pack simply could not be
 * charged through the product.
 *
 * When the tenant has no Asaas customer the invoice is still created — it just
 * cannot generate a boleto, and has to be settled with "marcar como paga". That
 * is a legitimate outcome, not a failure, which is why the dialog says so
 * instead of refusing.
 */
export function AdhocInvoiceDialog({
  teams,
  open,
  onOpenChange,
  defaultEquipeId,
}: {
  teams: Array<{ equipe_id: string; nome: string | null }>;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultEquipeId?: string;
}) {
  const [equipeId, setEquipeId] = useState(defaultEquipeId ?? "");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(() =>
    new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const submit = async () => {
    if (!equipeId || !description.trim() || !Number(amount)) {
      toast({ title: "Preencha equipe, descrição e valor", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-billing-ops", {
        body: {
          action: "create_adhoc",
          equipe_id: equipeId,
          description: description.trim(),
          amount: Number(amount),
          due_date: dueDate || null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message ?? data.error);

      toast({
        title: `Fatura ${data.number} criada`,
        description: data.charge
          ? "Cobrança gerada no Asaas — o cliente já recebe o link."
          : "Sem cobrança no Asaas: esta equipe não tem cadastro no gateway. Quando o cliente pagar, use “Marcar como paga”.",
      });
      setDescription("");
      setAmount("");
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
      qc.invalidateQueries({ queryKey: ["admin-team-billing"] });
    } catch (e) {
      toast({
        title: "Não foi possível criar",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova fatura avulsa</DialogTitle>
          <DialogDescription>
            Para cobrar algo que não está no contrato — uma hora extra, um serviço pontual. Não mexe
            no plano nem na mensalidade do cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Equipe</Label>
            <Select value={equipeId} onValueChange={setEquipeId}>
              <SelectTrigger><SelectValue placeholder="Escolha a equipe" /></SelectTrigger>
              <SelectContent>
                {teams.map((t) => (
                  <SelectItem key={t.equipe_id} value={t.equipe_id}>{t.nome ?? t.equipe_id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Descrição</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Hora extra de builder, integração sob medida…"
            />
            <p className="text-[11px] text-muted-foreground">
              É o que o cliente vai ler na fatura. Escreva o que ele está comprando, não um código interno.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor (R$)</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Vencimento</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Emitir fatura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
