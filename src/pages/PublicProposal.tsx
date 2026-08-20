import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Check, Clock, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";

interface ProposalItem {
  label: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  period: "monthly" | "one_time";
}

interface Proposal {
  codigo: string;
  cliente_nome: string;
  setup_price: number;
  monthly_price: number;
  list_monthly_price: number | null;
  term_months: number | null;
  valid_until: string | null;
  expired: boolean;
  accepted: boolean;
  items: ProposalItem[];
}

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

/**
 * Sprint 8 T17 — the public proposal.
 *
 * Replaces the static index.html that built everything from query parameters,
 * which let a client edit their own price in the URL. Data now comes from the
 * database through an edge function; the querystring is ignored for pricing.
 */
export default function PublicProposal() {
  const { codigo } = useParams<{ codigo: string }>();
  const [params] = useSearchParams();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [doc, setDoc] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("public-proposal", {
          body: { action: "get", codigo },
        });
        if (cancelled) return;
        if (error) throw error;
        if (data?.error) { setError(data.error); return; }
        setProposal(data as Proposal);
        setAccepted(Boolean(data.accepted));
        setName((data as Proposal).cliente_nome ?? "");
      } catch {
        if (!cancelled) setError("load_failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [codigo]);

  const accept = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("public-proposal", {
        body: { action: "accept", codigo, accepted_name: name, accepted_doc: doc },
      });
      if (error) throw error;
      if (data?.error && data.error !== "already_accepted") {
        setError(data.error);
        return;
      }
      setAccepted(true);
    } catch {
      setError("accept_failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error === "not_found" || !proposal) {
    return (
      <Shell>
        <h1 className="text-xl font-bold">Proposta não encontrada</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Confira o link recebido ou fale com quem enviou a proposta.
        </p>
      </Shell>
    );
  }

  if (accepted) {
    return (
      <Shell>
        <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
          <Check className="w-7 h-7 text-green-600" />
        </div>
        <h1 className="text-xl font-bold">Proposta aceita!</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Recebemos seu aceite. Vamos preparar seu ambiente e você receberá um e-mail com o acesso
          e a primeira fatura em instantes.
        </p>
      </Shell>
    );
  }

  if (proposal.expired) {
    return (
      <Shell>
        <Clock className="w-10 h-10 mx-auto text-amber-500 mb-3" />
        <h1 className="text-xl font-bold">Esta proposta expirou</h1>
        <p className="text-sm text-muted-foreground mt-2">
          A validade era {new Date(`${proposal.valid_until}T12:00:00`).toLocaleDateString("pt-BR")}.
          Fale com a gente para receber uma proposta atualizada.
        </p>
      </Shell>
    );
  }

  const discount =
    proposal.list_monthly_price && proposal.list_monthly_price > proposal.monthly_price
      ? proposal.list_monthly_price - proposal.monthly_price
      : 0;

  // Legacy links carried the client name in the querystring. Harmless to honour
  // for display; pricing never comes from there any more.
  const displayName = proposal.cliente_nome || params.get("cliente") || "";

  return (
    <div className="min-h-screen bg-muted/30 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="text-center">
          <Logo className="h-8 mx-auto mb-6" />
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Proposta {proposal.codigo}
          </p>
          <h1 className="text-2xl font-bold mt-1">{displayName}</h1>
        </div>

        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {proposal.items.map((item, i) => (
              <div key={i} className="flex items-start justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-medium text-sm">{item.label}</p>
                  {item.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold">{brl(item.unit_price * item.quantity)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {item.period === "monthly" ? "por mês" : "único"}
                  </p>
                </div>
              </div>
            ))}

            {proposal.setup_price > 0 && (
              <div className="flex items-center justify-between px-5 py-4">
                <p className="font-medium text-sm">Implantação</p>
                <p className="text-sm font-semibold">{brl(proposal.setup_price)}</p>
              </div>
            )}

            <div className="px-5 py-4 bg-muted/40">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-sm font-semibold">Mensalidade</p>
                  {proposal.term_months && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Contrato de {proposal.term_months} meses
                    </p>
                  )}
                </div>
                <div className="text-right">
                  {discount > 0 && (
                    <p className="text-xs text-muted-foreground line-through">
                      {brl(proposal.list_monthly_price!)}
                    </p>
                  )}
                  <p className="text-2xl font-bold">{brl(proposal.monthly_price)}</p>
                  {discount > 0 && (
                    <p className="text-xs text-green-600 font-medium">
                      economia de {brl(discount)}/mês
                    </p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-sm">Aceitar proposta</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ao aceitar, registramos data, hora e os valores exibidos acima.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="nome" className="text-xs">Seu nome completo</Label>
                <Input id="nome" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doc" className="text-xs">CPF ou CNPJ</Label>
                <Input id="doc" value={doc} onChange={(e) => setDoc(e.target.value)} placeholder="Opcional" />
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Checkbox id="agree" checked={agreed} onCheckedChange={(v) => setAgreed(Boolean(v))} className="mt-0.5" />
              <Label htmlFor="agree" className="text-xs leading-relaxed cursor-pointer text-muted-foreground">
                Li e concordo com os valores e condições apresentados nesta proposta.
              </Label>
            </div>

            {error && (
              <p className="text-xs text-destructive">
                Não foi possível registrar o aceite. Tente novamente ou fale com a gente.
              </p>
            )}

            <Button className="w-full" size="lg" disabled={!agreed || !name.trim() || submitting} onClick={accept}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Aceitar proposta
            </Button>

            <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3 h-3" />
              Registro seguro de aceite com data, hora e origem.
            </p>
          </CardContent>
        </Card>

        {proposal.valid_until && (
          <p className="text-center text-xs text-muted-foreground">
            Válida até {new Date(`${proposal.valid_until}T12:00:00`).toLocaleDateString("pt-BR")}
          </p>
        )}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center px-4">
      <Card className="max-w-md w-full">
        <CardContent className="py-10 text-center">
          <Logo className="h-7 mx-auto mb-6" />
          {children}
        </CardContent>
      </Card>
    </div>
  );
}
