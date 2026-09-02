import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Bot, Check, Clock, Loader2, ShieldCheck, MessageCircle, Sparkles, Users, Wrench,
  Workflow, Target, Radio, AlertTriangle, Gift, ArrowRight, Database, GitBranch,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { BRAND } from "@/config/brand";
import { isValidBrDoc, maskCNPJ, maskCPF, onlyDigits } from "@/lib/br-doc";

interface Plan {
  code: string;
  name: string;
  list_price: number;
  credits_whatsapp: number;
  credits_copilot: number;
  metadata: Record<string, string | number> | null;
}

interface Deliverable {
  code: string;
  title: string;
  description: string | null;
  client_keeps: boolean;
}

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
  allow_plan_choice: boolean;
  recommended_plan_code: string | null;
  chosen_plan_code: string | null;
  setup_waived: boolean;
  setup_charge_timing: "on_accept" | "on_golive";
  trial_days: number;
  /** Sprint 8.2 — a proposta não trouxe e-mail, então o aceite precisa pedir um. */
  needs_email?: boolean;
  plans: Plan[];
  deliverables: Deliverable[];
}

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const num = (v: number) => new Intl.NumberFormat("pt-BR").format(v || 0);

/**
 * Sprint 9 — the proposal became a landing page.
 *
 * The old page presented one pre-agreed number and asked for a yes. That works
 * for someone who already understands the product; it does nothing for someone
 * still deciding whether this kind of system is for them. This page has to do
 * both jobs: explain what a revenue engine IS and what it takes to run one,
 * then let the client choose their own tier.
 *
 * The educational sections are not filler. Every deal stalls on the same two
 * questions — "what do I have to provide" and "why can't the agent just message
 * whoever it wants" — and answering them here is cheaper than answering them
 * again on every call.
 */
export default function PublicProposal() {
  const { codigo } = useParams<{ codigo: string }>();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [doc, setDoc] = useState("");
  const [email, setEmail] = useState("");
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
        const p = data as Proposal;
        setProposal(p);
        setAccepted(Boolean(p.accepted));
        setName(p.cliente_nome ?? "");
        setSelectedPlan(p.chosen_plan_code ?? p.recommended_plan_code ?? p.plans?.[1]?.code ?? null);
      } catch {
        if (!cancelled) setError("load_failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [codigo]);

  const plan = useMemo(
    () => proposal?.plans?.find((p) => p.code === selectedPlan) ?? null,
    [proposal, selectedPlan],
  );

  const monthly = plan ? Number(plan.list_price) : Number(proposal?.monthly_price ?? 0);
  const setup = proposal?.setup_waived ? 0 : Number(proposal?.setup_price ?? 0);
  // O documento é exigido sempre que o negócio tem valor — que é a mesma regra
  // conferida no servidor, em public-proposal. Esta é a conveniência; a de lá é
  // a defesa, porque a função é pública e chamável direto.
  const cobravel =
    (proposal?.setup_price ?? 0) > 0 ||
    (proposal?.monthly_price ?? 0) > 0 ||
    proposal?.allow_plan_choice === true ||
    !!proposal?.chosen_plan_code;
  const docOk = isValidBrDoc(doc);
  const emailOk = !proposal?.needs_email || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const podeAceitar =
    agreed &&
    !!name.trim() &&
    (!cobravel || docOk) &&
    emailOk &&
    !(proposal?.allow_plan_choice && !selectedPlan);

  const extras = (proposal?.items ?? []).filter((i) => i.period === "monthly");
  const extrasTotal = extras.reduce((s, i) => s + i.unit_price * i.quantity, 0);

  const accept = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("public-proposal", {
        body: {
          action: "accept",
          codigo,
          accepted_name: name,
          accepted_doc: doc,
          accepted_email: email,
          chosen_plan_code: selectedPlan,
        },
      });
      if (error) throw error;
      if (data?.error && data.error !== "already_accepted") { setError(data.error); return; }
      setAccepted(true);
    } catch {
      setError("accept_failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
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
          Recebemos seu aceite. Vamos começar o discovery e preparar seu ambiente —
          você recebe um e-mail com os próximos passos.
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

  const kept = proposal.deliverables.filter((d) => d.client_keeps);

  return (
    <div className="min-h-screen bg-background">
      {/* ─────────────────────────── HERO ─────────────────────────── */}
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-5 py-5 flex items-center justify-between">
          <Logo className="h-7" />
          <Badge variant="outline" className="font-mono text-[10px]">{proposal.codigo}</Badge>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-5 pt-14 pb-10 text-center">
        <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">
          Proposta para {proposal.cliente_nome}
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mt-3 max-w-2xl mx-auto leading-tight">
          Um ambiente de vendas completo, trabalhando enquanto seu time dorme
        </h1>
        <p className="text-base text-muted-foreground mt-4 max-w-2xl mx-auto leading-relaxed">
          O {BRAND.product} junta o que hoje está espalhado: o anúncio que gera o lead, o agente que
          atende na hora, o CRM que organiza e a automação que faz tudo conversar.
          Um lugar só, funcionando sozinho.
        </p>
        <Button size="lg" className="mt-7" asChild>
          <a href="#planos">Ver planos <ArrowRight className="w-4 h-4 ml-1.5" /></a>
        </Button>
      </section>

      {/* ─────────────────────── THE PROBLEM ─────────────────────── */}
      <section className="max-w-5xl mx-auto px-5 py-10">
        <div className="rounded-xl border border-border bg-muted/30 p-6 sm:p-8">
          <h2 className="text-lg font-bold">O problema que isso resolve</h2>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed max-w-3xl">
            Na maioria das operações o lead chega pelo anúncio, cai num WhatsApp que ninguém
            responde no fim de semana, e some. Quem responde primeiro fecha — e responder primeiro,
            todo dia, o dia inteiro, não é um problema de esforço. É um problema de sistema.
          </p>
          <div className="grid gap-3 sm:grid-cols-3 mt-6">
            {[
              { icon: Clock, t: "Lead esfria em minutos", d: "A chance de conversão despenca depois da primeira hora sem resposta." },
              { icon: GitBranch, t: "Ferramentas desconectadas", d: "Anúncio num lugar, conversa noutro, planilha num terceiro. Nada se fala." },
              { icon: Target, t: "Sem visibilidade", d: "Você não sabe quanto custa um lead, nem onde ele trava no funil." },
            ].map(({ icon: Icon, t, d }) => (
              <div key={t} className="rounded-lg bg-background border border-border p-4">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-semibold mt-2">{t}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ────────────────────── WHAT YOU GET ─────────────────────── */}
      <section className="max-w-5xl mx-auto px-5 py-10">
        <h2 className="text-2xl font-bold tracking-tight text-center">O que compõe o ambiente</h2>
        <p className="text-sm text-muted-foreground mt-2 text-center max-w-2xl mx-auto">
          Quatro peças que só funcionam de verdade quando estão ligadas entre si.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 mt-8">
          <Feature
            icon={Bot}
            title="Agente de Atendimento (SDR digital)"
            body="Responde no WhatsApp em segundos, 24/7. Qualifica com as perguntas que importam para o seu negócio, agenda, e passa para um humano no momento certo — com o resumo da conversa pronto."
          />
          <Feature
            icon={Workflow}
            title="CRM no fluxo do atendimento"
            body="Cada conversa vira um card no funil, com etapas e campos desenhados para a sua operação. Ninguém precisa lançar nada à mão."
          />
          <Feature
            icon={Sparkles}
            title="Copiloto"
            body="Enquanto o time trabalha, o copiloto move etapas, preenche campos, cria tarefas e avisa quando um negócio está esfriando."
          />
          <Feature
            icon={Radio}
            title="Integração com anúncios"
            body="O lead do Meta Ads entra direto no CRM e o agente já inicia a conversa. É a peça que costuma faltar — e sem ela o resto não roda sozinho."
          />
        </div>
      </section>

      {/* ─────────────────── WHAT WE IMPLEMENT ───────────────────── */}
      <section className="max-w-5xl mx-auto px-5 py-10">
        <div className="rounded-xl border border-border p-6 sm:p-8">
          <h2 className="text-2xl font-bold tracking-tight">A implantação</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-3xl leading-relaxed">
            O software sozinho é uma casca. O que faz ele funcionar é a configuração em cima da
            sua operação — e é isso que fazemos junto com você.
          </p>

          <div className="grid gap-3 sm:grid-cols-2 mt-6">
            {proposal.deliverables.map((d) => (
              <div key={d.code} className="flex gap-3">
                <Check className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium flex items-center gap-2 flex-wrap">
                    {d.title}
                    {d.client_keeps && (
                      <Badge variant="outline" className="text-[9px] bg-green-500/10 text-green-700 dark:text-green-300">
                        é seu
                      </Badge>
                    )}
                  </p>
                  {d.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{d.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {kept.length > 0 && (
            <div className="mt-6 rounded-lg border border-green-500/30 bg-green-500/[0.06] p-4">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Gift className="w-4 h-4 text-green-600" />
                O que você leva, mesmo se não continuar com a gente
              </p>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                A implantação é sua. Se um dia decidir seguir sozinho, você fica com{" "}
                {kept.map((d, i) => (
                  <span key={d.code}>
                    <strong className="text-foreground">{d.title.toLowerCase()}</strong>
                    {i < kept.length - 2 ? ", " : i === kept.length - 2 ? " e " : ""}
                  </span>
                ))}
                . Você não está alugando o trabalho — está comprando um ativo que continua funcionando.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ───────────────── WHAT YOU NEED TO PROVIDE ──────────────── */}
      <section className="max-w-5xl mx-auto px-5 py-10">
        <h2 className="text-2xl font-bold tracking-tight">O que você precisa ter</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-3xl">
          Poucas coisas, mas é melhor saber antes de começar.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 mt-6">
          <div className="rounded-lg border border-border p-5">
            <p className="text-sm font-semibold flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-green-600" /> Um número de WhatsApp dedicado
            </p>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              Precisa ser um número só para o atendimento — não o celular pessoal de alguém do time.
              Se você ainda não tem, orientamos a aquisição durante a implantação.
            </p>
          </div>

          <div className="rounded-lg border border-border p-5">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Database className="w-4 h-4 text-violet-600" /> Conhecimento do seu processo
            </p>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              As perguntas que qualificam um bom cliente, as objeções mais comuns, o que o agente
              nunca deve prometer. Isso vem de você — nós transformamos em treinamento do agente.
            </p>
          </div>
        </div>

        {/* The two questions every deal stalls on */}
        <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/[0.05] p-5">
          <p className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Como funciona o WhatsApp, sem letra miúda
          </p>

          <div className="grid gap-4 sm:grid-cols-2 mt-3">
            <div>
              <p className="text-xs font-semibold">API Oficial (Meta)</p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                Homologada pela Meta, com selo de empresa verificada e baixo risco de bloqueio.
                Tem custo por conversa cobrado pela própria Meta e exige aprovação de modelos de
                mensagem para iniciar conversas.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold">Conexão direta (não oficial)</p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                Conecta lendo o QR Code, como o WhatsApp Web. Sobe rápido e sem custo por conversa,
                mas é uma conexão não homologada — existe risco de bloqueio se houver uso abusivo.
              </p>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-amber-500/20">
            <p className="text-xs font-semibold">A janela de 24 horas</p>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              Depois que um cliente te manda uma mensagem, você tem 24 horas para responder
              livremente. Passou disso, só é possível reabrir a conversa com um modelo aprovado
              pela Meta. Não é limitação nossa — é regra da plataforma, e vale para qualquer
              ferramenta. Por isso responder rápido não é só melhor: é mais barato.
            </p>
          </div>
        </div>
      </section>

      {/* ────────────────────────── PLANS ────────────────────────── */}
      <section id="planos" className="max-w-5xl mx-auto px-5 py-12 scroll-mt-6">
        <h2 className="text-2xl font-bold tracking-tight text-center">
          {proposal.allow_plan_choice ? "Escolha o plano" : "Seu plano"}
        </h2>
        <p className="text-sm text-muted-foreground mt-2 text-center max-w-2xl mx-auto">
          Todos incluem as duas carteiras de crédito: atendimento (o agente falando com seus
          clientes) e copiloto (as ações automáticas no CRM).
        </p>

        <div className="grid gap-4 md:grid-cols-3 mt-8">
          {proposal.plans.map((p) => {
            const meta = p.metadata ?? {};
            const isSelected = selectedPlan === p.code;
            const isRecommended = proposal.recommended_plan_code === p.code;
            const selectable = proposal.allow_plan_choice;

            return (
              <button
                key={p.code}
                type="button"
                disabled={!selectable}
                onClick={() => setSelectedPlan(p.code)}
                className={cn(
                  "text-left rounded-xl border p-5 transition-all relative",
                  isSelected ? "border-primary ring-2 ring-primary/25 bg-primary/[0.03]" : "border-border",
                  selectable ? "hover:border-primary/50 cursor-pointer" : "cursor-default",
                )}
              >
                {isRecommended && (
                  <Badge className="absolute -top-2.5 left-5 text-[10px]">Recomendado para você</Badge>
                )}

                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold">{p.name}</p>
                  {isSelected && selectable && (
                    <span className="w-4 h-4 rounded-full bg-primary flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5 text-primary-foreground" />
                    </span>
                  )}
                </div>

                <p className="text-3xl font-bold tracking-tight mt-2">{brl(p.list_price)}</p>
                <p className="text-[11px] text-muted-foreground">por mês</p>

                <ul className="mt-4 space-y-1.5">
                  <PlanLine icon={MessageCircle}>
                    <strong>{num(p.credits_whatsapp)}</strong> créditos de atendimento
                  </PlanLine>
                  <PlanLine icon={Sparkles}>
                    <strong>{num(p.credits_copilot)}</strong> créditos de copiloto
                  </PlanLine>
                  <PlanLine icon={Users}>
                    até <strong>{String(meta.seat_limit ?? "—")}</strong> usuários
                  </PlanLine>
                  <PlanLine icon={Wrench}>
                    <strong>{String(meta.builder_hours ?? 0)}h</strong> de automações
                    {meta.builder_recurrence === "monthly" ? " por mês" : " na implantação"}
                  </PlanLine>
                </ul>
              </button>
            );
          })}
        </div>

        <p className="text-[11px] text-muted-foreground mt-4 text-center max-w-2xl mx-auto">
          Créditos do plano renovam todo mês. Créditos avulsos que você comprar não expiram e só
          são usados depois que os do plano acabam. Dá para trocar de plano quando quiser.
        </p>
      </section>

      {/* ───────────────────── HOW IT WORKS ──────────────────────── */}
      <section className="max-w-5xl mx-auto px-5 py-10">
        <h2 className="text-2xl font-bold tracking-tight text-center">Como começa</h2>
        <div className="grid gap-3 sm:grid-cols-4 mt-8">
          {[
            { n: "1", t: "Aceite", d: "Você escolhe o plano e aceita por aqui mesmo." },
            { n: "2", t: "Discovery", d: "Entendemos sua operação, canais e processo de vendas." },
            { n: "3", t: "Implantação", d: "Agente treinado, canais conectados, CRM e anúncios integrados." },
            {
              n: "4",
              t: proposal.trial_days > 0 ? `${proposal.trial_days} dias grátis` : "Go-live",
              d: proposal.trial_days > 0
                ? `A partir do go-live, ${proposal.trial_days} dias sem pagar mensalidade — testando o ambiente já pronto, com seus leads reais.`
                : "Colocamos no ar junto com você.",
            },
          ].map((s) => (
            <div key={s.n} className="rounded-lg border border-border p-4">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                {s.n}
              </span>
              <p className="text-sm font-semibold mt-2.5">{s.t}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>

        {proposal.trial_days > 0 && (
          <p className="text-xs text-muted-foreground mt-4 text-center max-w-2xl mx-auto leading-relaxed">
            O teste começa <strong className="text-foreground">depois</strong> que tudo está no ar —
            nunca durante a montagem. Não faz sentido testar um ambiente pela metade.
            Terminado o período, a primeira fatura cobre só os dias restantes do mês; a partir daí,
            todo dia 1.
          </p>
        )}
      </section>

      {/* ────────────────────── THE NUMBERS ──────────────────────── */}
      <section className="max-w-3xl mx-auto px-5 py-10">
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {setup > 0 && (
              <Row
                label="Implantação"
                sub={proposal.setup_charge_timing === "on_golive"
                  ? "Pagamento na entrega do ambiente"
                  : "Pagamento único, no aceite"}
                value={brl(setup)}
              />
            )}
            {proposal.setup_waived && Number(proposal.setup_price) > 0 && (
              <Row
                label="Implantação"
                sub="Cortesia nesta proposta"
                value={<span className="text-green-600">Incluída</span>}
                strike={brl(Number(proposal.setup_price))}
              />
            )}

            {extras.map((i, idx) => (
              <Row
                key={idx}
                label={i.label}
                sub={i.description ?? undefined}
                value={`${brl(i.unit_price * i.quantity)}/mês`}
              />
            ))}

            <div className="px-5 py-5 bg-muted/40">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">Mensalidade</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {plan?.name ?? "Plano"}
                    {extrasTotal > 0 && " + adicionais"}
                    {proposal.term_months ? ` · ${proposal.term_months} meses` : " · sem fidelidade"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold tracking-tight">{brl(monthly + extrasTotal)}</p>
                  {proposal.trial_days > 0 && (
                    <p className="text-[11px] text-green-600 font-medium">
                      só depois dos {proposal.trial_days} dias grátis
                    </p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ───────────────────────── ACCEPT ────────────────────────── */}
      <section className="max-w-3xl mx-auto px-5 pb-16">
        <Card>
          <CardContent className="p-6 space-y-4">
            <div>
              <h2 className="font-bold">Aceitar e começar</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Ao aceitar, registramos data, hora e exatamente os valores mostrados aqui.
              </p>
            </div>

            {proposal.allow_plan_choice && (
              <div className="rounded-lg bg-muted/50 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                <span className="text-sm">
                  Plano escolhido: <strong>{plan?.name ?? "—"}</strong>
                </span>
                <span className="text-sm font-bold">{brl(monthly)}/mês</span>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="nome" className="text-xs">Seu nome completo</Label>
                <Input id="nome" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doc" className="text-xs">CPF ou CNPJ</Label>
                {/*
                  Sprint 8.2. Este campo dizia "Opcional" e o servidor gravava o
                  que viesse — as quatro aceitações que existem em produção têm
                  documento vazio. Sem ele a cobrança não pode ser aberta, então
                  a fatura fica em aberto e o dinheiro nunca é pedido. Pedir aqui
                  é pedir uma vez; descobrir depois custa uma cobrança perdida.
                */}
                <Input
                  id="doc"
                  inputMode="numeric"
                  value={onlyDigits(doc).length > 11 ? maskCNPJ(doc) : maskCPF(doc)}
                  onChange={(e) => setDoc(onlyDigits(e.target.value).slice(0, 14))}
                  placeholder="000.000.000-00"
                  aria-invalid={doc.length > 0 && !docOk}
                />
                {doc.length > 0 && !docOk && (
                  <p className="text-[11px] text-destructive">
                    Confira o número — não bate com um CPF ou CNPJ válido.
                  </p>
                )}
              </div>
            </div>

            {/* Só quando a proposta não trouxe um: sem e-mail o convite de
                acesso não sai, e o cliente fica sem login depois de assinar. */}
            {proposal.needs_email && (
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs">Seu melhor e-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@suaempresa.com.br"
                />
                <p className="text-[11px] text-muted-foreground">
                  É para onde enviamos o acesso ao seu ambiente.
                </p>
              </div>
            )}

            <div className="flex items-start gap-2.5">
              <Checkbox id="agree" checked={agreed} onCheckedChange={(v) => setAgreed(Boolean(v))} className="mt-0.5" />
              <Label htmlFor="agree" className="text-xs leading-relaxed cursor-pointer text-muted-foreground">
                Li e concordo com os valores e condições desta proposta.
              </Label>
            </div>

            {error && (
              <p className="text-xs text-destructive">
                {error === "plan_required"
                  ? "Escolha um plano antes de aceitar."
                  : error === "doc_invalid"
                  ? "Informe um CPF ou CNPJ válido — é ele que emite a cobrança."
                  : error === "email_required"
                  ? "Informe um e-mail válido — é para onde enviamos o seu acesso."
                  : "Não foi possível registrar o aceite. Tente novamente ou fale com a gente."}
              </p>
            )}

            <Button
              className="w-full"
              size="lg"
              disabled={!podeAceitar || submitting}
              onClick={accept}
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Aceitar proposta
            </Button>

            <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3 h-3" />
              Registro seguro de aceite com data, hora e origem.
            </p>
          </CardContent>
        </Card>

        {proposal.valid_until && (
          <p className="text-center text-xs text-muted-foreground mt-4">
            Válida até {new Date(`${proposal.valid_until}T12:00:00`).toLocaleDateString("pt-BR")}
          </p>
        )}
      </section>
    </div>
  );
}

function Feature({ icon: Icon, title, body }: { icon: React.ElementType; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border p-5">
      <Icon className="w-5 h-5 text-primary" />
      <p className="font-semibold mt-3">{title}</p>
      <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{body}</p>
    </div>
  );
}

function PlanLine({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-xs text-muted-foreground">
      <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <span>{children}</span>
    </li>
  );
}

function Row({ label, sub, value, strike }: {
  label: string; sub?: string; value: React.ReactNode; strike?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      <div className="text-right shrink-0">
        {strike && <p className="text-xs text-muted-foreground line-through">{strike}</p>}
        <p className="text-sm font-semibold">{value}</p>
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
