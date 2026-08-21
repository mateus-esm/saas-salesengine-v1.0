import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, MessageCircle, Sparkles, Radio, Wrench, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatBRL, formatCredits, formatDate } from "@/hooks/useBilling";

export interface TeamBillingRow {
  equipe_id: string;
  nome: string;
  contract_status: string;
  plan_code: string | null;
  plan_name: string | null;
  mrr: number;
  whatsapp_balance: number;
  copilot_balance: number;
  seats_used: number;
  seat_limit: number | null;
  instances_contracted: number;
  instances_connected: number;
  builder_hours_extra: number;
  open_amount: number;
  current_period_end: string | null;
  agent_paused_at: string | null;
  agent_paused_reason: string | null;
}

/**
 * Sprint 8.2 — grant credits and attach add-ons to a team by hand.
 *
 * This is the regularisation path: every existing tenant starts at zero under
 * the new model, and each needs a plan or a manual grant until it is put on a
 * real contract. Both actions write through the same RPCs the paid flows use, so
 * a manual grant lands in the ledger next to a purchased one and stays auditable.
 */
export function TeamBillingDialog({
  team, open, onOpenChange,
}: {
  team: TeamBillingRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const [pool, setPool] = useState<"whatsapp" | "copilot">("whatsapp");
  const [credits, setCredits] = useState("1000");
  const [reason, setReason] = useState("");
  const [planCode, setPlanCode] = useState<string>("");
  const [instances, setInstances] = useState("0");
  const [builderHours, setBuilderHours] = useState("0");

  const { data: products } = useQuery({
    queryKey: ["admin-catalog"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("billing_products")
        .select("id, code, name, kind, list_price")
        .eq("active", true)
        .order("kind")
        .order("list_price");
      return data ?? [];
    },
  });

  const plans = (products ?? []).filter((p) => p.kind === "plan");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-team-billing"] });
    qc.invalidateQueries({ queryKey: ["admin-contracts"] });
  };

  /**
   * Reconcile the attendance agent immediately after a grant. The daily cron
   * would do this eventually, but a client you just unblocked should not stay
   * dark until tomorrow. Failure is non-fatal: the credits landed either way and
   * the cron will catch up.
   */
  const syncAgentPower = async () => {
    const { error } = await supabase.functions.invoke("agent-power-sync", { body: {} });
    if (error) console.error("[admin] agent power sync failed:", error.message);
  };

  const grant = async () => {
    if (!team) return;
    const n = Number(credits);
    if (!n) {
      toast({ title: "Informe uma quantidade diferente de zero", variant: "destructive" });
      return;
    }
    setBusy("grant");
    try {
      const { data, error } = await supabase.rpc("admin_grant_credits", {
        p_equipe_id: team.equipe_id,
        p_pool: pool,
        p_credits: n,
        p_reason: reason || null,
        p_expires_at: null,
      });
      if (error) throw error;
      if (pool === "whatsapp" && n > 0) await syncAgentPower();
      refresh();
      const balance = (data as { balance?: number })?.balance ?? 0;
      toast({
        title: n > 0 ? "Créditos concedidos" : "Ajuste aplicado",
        description:
          `Novo saldo de ${pool === "whatsapp" ? "Atendimento" : "Copiloto"}: ${formatCredits(balance)}.`
          + (pool === "whatsapp" && n > 0 ? " O agente é religado automaticamente." : ""),
      });
      setReason("");
    } catch (e) {
      toast({
        title: "Não foi possível conceder",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const setItem = async (code: string, quantity: number, label: string) => {
    if (!team) return;
    setBusy(code);
    try {
      const { error } = await supabase.rpc("admin_set_contract_item", {
        p_equipe_id: team.equipe_id,
        p_product_code: code,
        p_quantity: quantity,
        p_unit_price: null,
      });
      if (error) throw error;
      refresh();
      toast({ title: `${label} atualizado`, description: "Entra na próxima fatura recorrente." });
    } catch (e) {
      toast({
        title: "Não foi possível atualizar",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  if (!team) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{team.nome}</DialogTitle>
          <DialogDescription>
            Conceder créditos e ajustar o que a equipe tem contratado.
          </DialogDescription>
        </DialogHeader>

        {/* ── Snapshot ── */}
        <div className="grid gap-2 sm:grid-cols-4">
          <Stat icon={MessageCircle} label="Atendimento" value={formatCredits(team.whatsapp_balance)} />
          <Stat icon={Sparkles} label="Copiloto" value={formatCredits(team.copilot_balance)} />
          <Stat icon={Package} label="MRR" value={formatBRL(team.mrr)} />
          <Stat
            icon={Radio}
            label="Instâncias"
            value={`${team.instances_connected}/${team.instances_contracted}`}
            warn={team.instances_connected > team.instances_contracted}
          />
        </div>

        {team.agent_paused_at && (
          <div className="rounded-md border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-xs">
            <span className="font-medium">Agente de atendimento pausado</span> desde{" "}
            {formatDate(team.agent_paused_at)} — motivo: {team.agent_paused_reason}.
            Ele volta sozinho quando houver crédito de Atendimento e o contrato não estiver suspenso.
          </div>
        )}

        {/* ── Grant credits ── */}
        <div className="rounded-lg border border-border p-4 space-y-3">
          <p className="text-sm font-semibold">Conceder créditos</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Carteira</Label>
              <Select value={pool} onValueChange={(v) => setPool(v as typeof pool)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">Atendimento</SelectItem>
                  <SelectItem value="copilot">Copiloto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Quantidade</Label>
              <Input type="number" value={credits} onChange={(e) => setCredits(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Motivo</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="cortesia, ajuste…" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">
              Positivo credita e não expira. Negativo lança um ajuste — ambos ficam no extrato do cliente.
            </p>
            <Button size="sm" onClick={grant} disabled={busy !== null}>
              {busy === "grant" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Conceder"}
            </Button>
          </div>
        </div>

        {/* ── Plan ── */}
        <div className="rounded-lg border border-border p-4 space-y-3">
          <p className="text-sm font-semibold">Plano</p>
          <p className="text-[11px] text-muted-foreground -mt-2">
            Atual: {team.plan_name ?? "nenhum"} · {team.contract_status}
          </p>
          <div className="flex gap-2 flex-wrap">
            <Select value={planCode} onValueChange={setPlanCode}>
              <SelectTrigger className="flex-1 min-w-[180px]">
                <SelectValue placeholder="Escolher plano" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.code} value={p.code}>
                    {p.name} — {formatBRL(p.list_price)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={!planCode || busy !== null}
              onClick={() => setItem(planCode, 1, "Plano")}
            >
              {busy === planCode ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Aplicar plano"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Trocar de plano substitui o anterior — nunca acumula, senão a equipe pagaria os dois.
            Os créditos do plano entram quando a fatura recorrente for paga.
          </p>
        </div>

        {/* ── Add-ons ── */}
        <div className="rounded-lg border border-border p-4 space-y-3">
          <p className="text-sm font-semibold">Adicionais</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5" /> Instâncias WhatsApp
              </Label>
              <div className="flex gap-2">
                <Input
                  type="number" min={0}
                  value={instances}
                  onChange={(e) => setInstances(e.target.value)}
                />
                <Button
                  size="sm" variant="outline" disabled={busy !== null}
                  onClick={() => setItem("instance_whatsapp", Number(instances) || 0, "Instâncias")}
                >
                  {busy === "instance_whatsapp" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Definir"}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Conectadas hoje: {team.instances_connected}. Contratadas: {team.instances_contracted}.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5" /> Horas de Builder Mode
              </Label>
              <div className="flex gap-2">
                <Input
                  type="number" min={0}
                  value={builderHours}
                  onChange={(e) => setBuilderHours(e.target.value)}
                />
                <Button
                  size="sm" variant="outline" disabled={busy !== null}
                  onClick={() => setItem("builder_hour", Number(builderHours) || 0, "Builder Mode")}
                >
                  {busy === "builder_hour" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Definir"}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">Extras já contratadas: {team.builder_hours_extra}.</p>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Definir <strong>0</strong> remove o adicional do contrato.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ icon: Icon, label, value, warn }: {
  icon: React.ElementType; label: string; value: string; warn?: boolean;
}) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
        <Icon className="w-3 h-3" /> {label}
      </p>
      <p className={`text-sm font-bold mt-0.5 ${warn ? "text-amber-600" : ""}`}>{value}</p>
    </div>
  );
}
