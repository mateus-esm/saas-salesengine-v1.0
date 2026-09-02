import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, MessageCircle, Sparkles, Radio, Wrench, Package, Power } from "lucide-react";
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
  has_agent: boolean;
  agent_paused_at: string | null;
  agent_paused_reason: string | null;
  agent_power_error: string | null;
  agent_power_failures: number;
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
  team, open, onOpenChange, onChanged,
}: {
  team: TeamBillingRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** For callers that hold their rows in local state instead of react-query. */
  onChanged?: () => void;
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
    onChanged?.();
  };

  /**
   * Reconcile THIS team's attendance agent right now. The daily cron would get
   * there eventually, but a client you just unblocked should not stay dark until
   * tomorrow — and sweeping the whole base to fix one team means a provider call
   * per tenant and a result that says nothing about the one you care about.
   *
   * Returns what actually happened so the toast can say it. Reporting "o agente
   * é religado automaticamente" without checking is how you end up believing a
   * customer is answering when they are not.
   */
  const syncAgentPower = async (force = false): Promise<{ resumed: number; failed: number } | null> => {
    if (!team) return null;
    const { data, error } = await supabase.functions.invoke("agent-power-sync", {
      body: { equipe_id: team.equipe_id, force },
    });
    if (error) {
      console.error("[admin] agent power sync failed:", error.message);
      return null;
    }
    return data as { resumed: number; failed: number };
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

      const result = data as { balance?: number; agent_should_resume?: boolean };
      const balance = result?.balance ?? 0;

      // Only call the provider when the ledger says the agent is now eligible.
      let agentNote = "";
      if (pool === "whatsapp" && n > 0) {
        if (result?.agent_should_resume) {
          const sync = await syncAgentPower();
          agentNote = sync?.resumed
            ? " Agente religado no provedor."
            : " Não consegui religar o agente — use “Ativar agente agora”.";
        } else if (team.agent_paused_reason === "manual") {
          agentNote = " O agente segue pausado manualmente — religue à mão se quiser.";
        }
      }

      refresh();
      toast({
        title: n > 0 ? "Créditos concedidos" : "Ajuste aplicado",
        description:
          `Novo saldo de ${pool === "whatsapp" ? "Atendimento" : "Copiloto"}: ${formatCredits(balance)}.`
          + agentNote,
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

  /**
   * Force the agent on at the provider.
   *
   * The automatic path only resumes agents WE paused. One switched off inside
   * the provider's own console by hand — or one whose pause failed before we
   * recorded it — is
   * invisible to it, so no amount of credit brings it back. This is the manual
   * override for that. The credit and suspension checks still apply in SQL.
   */
  const forceResume = async () => {
    if (!team) return;
    setBusy("power");
    try {
      const sync = await syncAgentPower(true);
      refresh();
      if (sync?.resumed) {
        toast({ title: "Agente ativado", description: "O agente voltou a responder." });
      } else if (team.whatsapp_balance <= 0) {
        toast({
          title: "Sem crédito de Atendimento",
          description: "Conceda créditos na carteira Atendimento antes de ativar o agente.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Não foi possível ativar",
          description: "O provedor recusou a chamada. Confira o ID do agente da equipe.",
          variant: "destructive",
        });
      }
    } finally {
      setBusy(null);
    }
  };

  const setItem = async (code: string, quantity: number, label: string) => {
    if (!team) return;
    setBusy(code);
    try {
      const { data, error } = await supabase.rpc("admin_set_contract_item", {
        p_equipe_id: team.equipe_id,
        p_product_code: code,
        p_quantity: quantity,
        p_unit_price: null,
        // Entitlements ignore draft contracts, so staging one would grant the
        // team nothing — the same dead end the credits had.
        p_activate: true,
      });
      if (error) throw error;
      refresh();

      const res = data as { contract_status?: string; credits_whatsapp?: number };
      toast({
        title: `${label} atualizado`,
        description: quantity > 0
          ? `Contrato ${res?.contract_status ?? "atualizado"}. Entra na próxima fatura recorrente.`
            + (res?.credits_whatsapp
                ? ` O plano inclui ${formatCredits(res.credits_whatsapp)} créditos de Atendimento por período — conceda-os acima para liberar agora.`
                : "")
          : "Adicional removido do contrato.",
      });
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

        {/* ── Agente de atendimento ── */}
        <div className="rounded-lg border border-border p-4 space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <Power className="w-3.5 h-3.5" /> Agente de atendimento
            </p>
            <Button
              size="sm" variant="outline"
              disabled={busy !== null || !team.has_agent}
              onClick={forceResume}
            >
              {busy === "power" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Ativar agente agora"}
            </Button>
          </div>

          {!team.has_agent ? (
            <p className="text-[11px] text-muted-foreground">
              Esta equipe não tem <code>gpt_maker_agent_id</code> configurado — não há o que ligar.
            </p>
          ) : team.agent_paused_at ? (
            <p className="text-xs text-red-600 dark:text-red-400">
              <span className="font-medium">Pausado</span> desde {formatDate(team.agent_paused_at)} — motivo:{" "}
              {team.agent_paused_reason}. Volta sozinho quando houver crédito de Atendimento e o
              contrato não estiver suspenso.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Nossos registros dizem que está ativo. Se no provedor aparecer desligado, use
              “Ativar agente agora” — o religamento automático só alcança o que nós pausamos.
            </p>
          )}

          {team.agent_power_error && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Última falha no provedor ({team.agent_power_failures}x): {team.agent_power_error}
              {team.agent_power_failures >= 5 && " — novas tentativas automáticas estão suspensas até um crédito ou uma ativação manual."}
            </p>
          )}
        </div>

        {/* ── Grant credits ── */}
        <div className="rounded-lg border border-border p-4 space-y-3">
          {/* Sprint 8.3 (Fixes 2 item 9): subtracting always worked — a negative
              amount books an adjustment — but the heading said "Conceder" and
              nobody found it. The capability was there; the label hid it. */}
          <p className="text-sm font-semibold">Conceder ou retirar créditos</p>
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
              {busy === "grant"
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : Number(credits) < 0 ? "Retirar" : "Conceder"}
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
            Aplicar um plano <strong>ativa o contrato</strong>: é o que libera módulos, assentos e
            instâncias para o cliente. Os <strong>créditos</strong> do plano entram na virada do
            período (ou quando a fatura for paga) — para liberar agora, use “Conceder créditos”.
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
