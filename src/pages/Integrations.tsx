import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, ExternalLink, KeyRound, Loader2, Plug, RefreshCw, Search, Unplug, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIntegrations, type Integration } from "@/hooks/useGrowth";
import { useRole } from "@/hooks/useRole";
import { cn } from "@/lib/utils";

const ago = (iso: string | null) => {
  if (!iso) return "nunca";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
  } catch {
    return "—";
  }
};

type Category = "Anúncios" | "Captação" | "Conversões" | "Automação";

interface CatalogItem {
  id: string;
  name: string;
  category: Category;
  description: string;
  logo: React.ReactNode;
  available: boolean;
  /** Where it already lives in Rev, when it is not configured here. */
  href?: string;
}

const Tile = ({ bg, children, className }: { bg: string; children: React.ReactNode; className?: string }) => (
  <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white shadow-sm", className)} style={{ background: bg }}>
    {children}
  </div>
);

const CATALOG: CatalogItem[] = [
  {
    id: "windsor",
    name: "Windsor.ai",
    category: "Anúncios",
    description: "Meta Ads e Google Ads: gasto, alcance, vídeo, leads e conversas por anúncio, todo dia.",
    logo: <img src="/integrations/windsor.png" alt="" className="h-11 w-11 rounded-xl shadow-sm" />,
    available: true,
  },
  {
    id: "webhooks",
    name: "Webhooks de entrada",
    category: "Captação",
    description: "Formulários, landing pages e ferramentas (n8n, Zapier) mandando leads com a fonte carimbada.",
    logo: <Tile bg="#0f172a">{"{ }"}</Tile>,
    available: true,
    href: "/webhooks",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    category: "Captação",
    description: "Cada número é uma entrada. Clique em anúncio e mensagem padrão ligam o lead ao criativo.",
    logo: <Tile bg="#25D366">W</Tile>,
    available: true,
    href: "/crm?tab=campanhas&section=entradas",
  },
  {
    id: "meta_leads",
    name: "Meta Lead Ads",
    category: "Captação",
    description: "Formulários instantâneos direto no Rev, com o leadgen_id e os IDs do anúncio.",
    logo: <Tile bg="#0866FF">f</Tile>,
    available: false,
  },
  {
    id: "meta_capi",
    name: "Meta · API de Conversões",
    category: "Conversões",
    description: "Devolve MQL, SQL e venda para o algoritmo buscar quem compra, não lead barato.",
    logo: <Tile bg="#0866FF">∞</Tile>,
    available: false,
  },
  {
    id: "google_offline",
    name: "Google Ads · conversões offline",
    category: "Conversões",
    description: "Venda fechada volta para o Google pelo gclid que o Rev já guarda.",
    logo: <Tile bg="linear-gradient(135deg,#4285F4 0%,#34A853 40%,#FBBC05 70%,#EA4335 100%)">G</Tile>,
    available: false,
  },
];

const CATEGORIES: ("Todas" | Category)[] = ["Todas", "Anúncios", "Captação", "Conversões"];

/**
 * Sprint 16 — Integrações, como uma galeria. Windsor.ai: cada equipe conecta a
 * própria chave (no Vault; aqui só os 4 últimos caracteres).
 */
export default function Integrations() {
  const { windsor } = useIntegrations();
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("Todas");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const items = CATALOG.filter((i) => (cat === "Todas" || i.category === cat) && (!q || `${i.name} ${i.description}`.toLowerCase().includes(q.toLowerCase())));
  const windsorOn = !!windsor && windsor.status !== "disconnected";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Plug className="h-6 w-6" /> Integrações</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            As fontes de dados de Growth. O que chega daqui aparece em{" "}
            <Link to="/crm?tab=campanhas&section=ads" className="underline underline-offset-2">Growth › Ads</Link>.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar integração" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            className={cn("rounded-full border px-3 py-1 text-xs", cat === c ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground")}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => {
          const connected = i.id === "windsor" && windsorOn;
          return (
            <div key={i.id} className={cn("flex flex-col rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md", !i.available && "opacity-70")}>
              <div className="flex items-start gap-3">
                {i.logo}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight">{i.name}</p>
                  <p className="text-xs text-muted-foreground">{i.category}</p>
                </div>
                {connected ? (
                  windsor?.status === "error" ? (
                    <Badge variant="destructive" className="gap-1 text-[10px]"><XCircle className="h-3 w-3" />Erro</Badge>
                  ) : (
                    <Badge className="gap-1 bg-emerald-600 text-[10px] hover:bg-emerald-600"><CheckCircle2 className="h-3 w-3" />Conectado</Badge>
                  )
                ) : !i.available ? (
                  <Badge variant="secondary" className="text-[10px]">Em breve</Badge>
                ) : null}
              </div>
              <p className="mt-3 flex-1 text-sm text-muted-foreground">{i.description}</p>
              <div className="mt-4">
                {i.id === "windsor" ? (
                  <Button size="sm" variant={connected ? "outline" : "default"} onClick={() => setOpen("windsor")}>
                    {connected ? "Gerenciar" : "Conectar"}
                  </Button>
                ) : i.href ? (
                  <Button size="sm" variant="outline" asChild><Link to={i.href}>Abrir</Link></Button>
                ) : (
                  <Button size="sm" variant="ghost" disabled>Próxima sprint</Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={open === "windsor"} onOpenChange={(o) => setOpen(o ? "windsor" : null)}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <img src="/integrations/windsor.png" alt="" className="h-8 w-8 rounded-lg" /> Windsor.ai
            </DialogTitle>
            <DialogDescription>
              Lê Meta Ads e Google Ads da sua conta Windsor: gasto, impressões, alcance, cliques, vídeo (3s e ThruPlays),
              leads e conversas por anúncio, todo dia às 6h. Anúncios novos entram em Growth › Ads como “a completar”.
            </DialogDescription>
          </DialogHeader>
          <WindsorPanel />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WindsorPanel() {
  const { windsor, isLoading, connect, sync, saveSettings, disconnect } = useIntegrations();
  const { isAdmin } = useRole();
  const [key, setKey] = useState("");
  const [accounts, setAccounts] = useState("");
  const [replacing, setReplacing] = useState(false);
  const connected = !!windsor && windsor.status !== "disconnected";

  useEffect(() => setAccounts(windsor?.settings?.select_accounts ?? ""), [windsor?.settings?.select_accounts]);

  const doConnect = async () => {
    try {
      await connect.mutateAsync({ api_key: key.trim(), select_accounts: accounts.trim() || undefined });
      setKey("");
      setReplacing(false);
    } catch {
      /* toast already shown */
    }
  };

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  if (!isAdmin()) return <p className="text-sm text-muted-foreground">Só administradores conectam integrações.</p>;

  if (connected && !replacing) {
    const w = windsor as Integration;
    return (
      <div className="space-y-4">
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <Info label="Chave" value={<span className="font-mono">••••{w.key_last4}</span>} />
          <Info label="Última sincronização" value={ago(w.last_sync_at)} />
          <Info
            label="Resultado"
            value={
              w.last_sync_status === "ok" ? `${w.last_sync_rows ?? 0} linha(s)`
              : w.last_sync_status === "partial" ? `Parcial · ${w.last_sync_rows ?? 0}`
              : w.last_sync_status === "error" ? "Erro"
              : "—"
            }
          />
        </div>
        {w.last_sync_error && <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{w.last_sync_error}</p>}
        {w.accounts?.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Contas vistas na última sincronização</p>
            <div className="flex flex-wrap gap-1.5">
              {w.accounts.map((a) => (
                <Badge key={`${a.source}-${a.id}`} variant="outline" className="font-normal">
                  {a.source === "facebook" ? "Meta" : a.source === "google_ads" ? "Google" : a.source} · {a.name ?? a.id}
                  <span className="ml-1 font-mono text-[10px] opacity-60">{a.id}</span>
                </Badge>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-xs">Só estas contas (opcional)</Label>
          <div className="flex gap-2">
            <Input value={accounts} onChange={(e) => setAccounts(e.target.value)} placeholder="IDs separados por vírgula — vazio = todas" />
            <Button variant="outline" onClick={() => saveSettings.mutate(accounts)} disabled={saveSettings.isPending}>Salvar</Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => sync.mutate(7)} disabled={sync.isPending}>
            {sync.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}Sincronizar agora
          </Button>
          <Button variant="outline" onClick={() => sync.mutate(90)} disabled={sync.isPending}>Puxar 90 dias</Button>
          <Button variant="outline" onClick={() => setReplacing(true)}><KeyRound className="mr-1.5 h-4 w-4" />Trocar chave</Button>
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={disconnect.isPending}
            onClick={() => {
              if (window.confirm("Desconectar o Windsor? A chave é apagada; os dados já puxados ficam.")) disconnect.mutate();
            }}
          >
            <Unplug className="mr-1.5 h-4 w-4" />Desconectar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="windsor-key" className="text-xs">API key do Windsor</Label>
        <Input id="windsor-key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Cole aqui a chave da sua conta Windsor" />
        <p className="text-[11px] text-muted-foreground">
          No Windsor: conecte Facebook Ads e/ou Google Ads e copie a API key{" "}
          <a href="https://onboard.windsor.ai/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">
            aqui <ExternalLink className="h-3 w-3" />
          </a>
          . Ela é testada, guardada criptografada e nunca volta para a tela.
        </p>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Só estas contas (opcional)</Label>
        <Input value={accounts} onChange={(e) => setAccounts(e.target.value)} placeholder="IDs separados por vírgula — vazio = todas" />
      </div>
      <div className="flex gap-2">
        <Button onClick={doConnect} disabled={connect.isPending || key.trim().length < 8}>
          {connect.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plug className="mr-1.5 h-4 w-4" />}
          {connect.isPending ? "Testando e puxando 30 dias…" : "Conectar"}
        </Button>
        {replacing && <Button variant="outline" onClick={() => setReplacing(false)}>Cancelar</Button>}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
