import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Check, Minus } from "lucide-react";
import { formatBRL, formatDate } from "@/hooks/useBilling";

export interface ProvisionResult {
  already_provisioned?: boolean;
  equipe_id?: string;
  contract_id?: string;
  setup_invoice_id?: string | null;
  trial_ends_at?: string | null;
  monthly_total?: number;
  setup_total?: number;
  invited?: boolean;
  warnings?: string[];
}

/**
 * Sprint 8.3 (Fixes 2, item 10) — what "Provisionar" actually did.
 *
 * The founder's complaint was "I don't understand what this button does — did it
 * only create a line in Faturamento?". It never only did that: it creates the
 * team, the owner's profile and invite, the contract (in trial when the proposal
 * grants one), the contract's items, and the setup invoice when the fee is
 * charged at go-live.
 *
 * The function already RETURNED every one of those ids. The panel threw them
 * away and showed a one-line toast, so the most consequential button in the
 * admin was also the most opaque. This shows the receipt instead.
 */
export function ProvisionResultDialog({
  result,
  open,
  onOpenChange,
}: {
  result: ProvisionResult | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  if (!result) return null;

  const warnings = result.warnings ?? [];
  const trial = result.trial_ends_at;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {result.already_provisioned ? "Este ambiente já existia" : "Ambiente criado"}
          </DialogTitle>
          <DialogDescription>
            {result.already_provisioned
              ? "Nada foi criado de novo — a proposta já tinha sido provisionada antes."
              : "Provisionar não emite só uma fatura. Isto é tudo o que acabou de acontecer:"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Line done label="Equipe criada" detail="O cliente tem um ambiente próprio, isolado dos demais." />
          <Line
            done
            label={trial ? "Contrato aberto em período de teste" : "Contrato aberto e ativo"}
            detail={
              trial
                ? `O teste vai até ${formatDate(trial)}. A primeira fatura recorrente só é emitida no fim dele.`
                : "Sem período de teste: a cobrança recorrente começa no período atual."
            }
          />
          <Line
            done={Number(result.monthly_total ?? 0) > 0}
            label={
              Number(result.monthly_total ?? 0) > 0
                ? `Mensalidade de ${formatBRL(Number(result.monthly_total))} registrada no contrato`
                : "Nenhuma mensalidade registrada"
            }
            detail={
              Number(result.monthly_total ?? 0) > 0
                ? "É o que será cobrado a cada período — ainda não é uma fatura."
                : "A proposta não trazia plano nem itens mensais, então o contrato nasceu sem valor recorrente."
            }
          />
          <Line
            done={!!result.setup_invoice_id}
            label={
              result.setup_invoice_id
                ? `Fatura de setup emitida — ${formatBRL(Number(result.setup_total ?? 0))}`
                : "Nenhuma fatura de setup emitida"
            }
            detail={
              result.setup_invoice_id
                ? "Esta sim é uma cobrança de verdade, já disponível para o cliente."
                : "Ou o setup foi dispensado, ou já tinha sido cobrado no aceite."
            }
          />
          <Line
            done={!!result.invited}
            label={result.invited ? "Convite enviado ao cliente" : "Convite não enviado"}
            detail={
              result.invited
                ? "Ele recebeu por e-mail o acesso para definir a senha."
                : "Ninguém consegue entrar no ambiente até o convite sair. Veja os avisos abaixo."
            }
          />
        </div>

        {warnings.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1.5">
            <p className="text-xs font-semibold flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5" /> Precisa de atenção
            </p>
            {warnings.map((w) => (
              <p key={w} className="text-xs text-muted-foreground">{w}</p>
            ))}
            <p className="text-[11px] text-muted-foreground pt-1">
              O ambiente foi criado mesmo assim — estes passos podem ser refeitos sem provisionar de novo.
            </p>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Créditos <strong>não</strong> são concedidos aqui. Um cliente em teste começa com saldo zero e o
          agente dele fica pausado até você conceder crédito na aba Faturamento.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function Line({ done, label, detail }: { done: boolean; label: string; detail: string }) {
  return (
    <div className="flex gap-2.5">
      <Badge
        variant="outline"
        className={`mt-0.5 h-5 w-5 shrink-0 justify-center p-0 ${
          done
            ? "bg-green-500/10 text-green-700 dark:text-green-300"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {done ? <Check className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
      </Badge>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-tight">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
      </div>
    </div>
  );
}
