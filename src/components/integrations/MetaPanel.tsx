// Sprint 17 — painel "Meta" em Integrações: conectar, estado, ativos, erros,
// páginas que recebem leads (Fase 2), formulários e importação (Fase 3) e a
// API de Conversões (Fase 4).

import { AlertTriangle, CheckCircle2, Loader2, Plug, RefreshCw, RotateCcw, Stethoscope, Unplug } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useMetaIntegration } from "@/hooks/useMeta";
import { metaAssetSummary, metaConnectionState, metaQueueHealth, type MetaAsset } from "@/lib/meta";

import { MetaCapiSection } from "./MetaCapiSection";
import { MetaFormsSection } from "./MetaFormsSection";

const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : null;

const TYPE_LABEL: Record<MetaAsset["asset_type"], string> = {
  page: "Páginas",
  ad_account: "Contas de anúncio",
  dataset: "Pixels / Datasets",
};

export function MetaPanel() {
  const { status, start, rediscover, probe, disconnect, pageToggle, retryFailed } = useMetaIntegration();
  const state = metaConnectionState(status.data);
  const integ = status.data?.integration;
  const assets = status.data?.assets ?? [];
  const sum = metaAssetSummary(assets);

  if (state === "loading") {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>;
  }
  if (state === "unconfigured") {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        O app do Meta ainda não foi configurado no Rev. Assim que estiver pronto, o botão "Conectar com Meta" aparece aqui.
      </p>
    );
  }

  const connectButton = (label: string) => (
    <Button onClick={() => start.mutate()} disabled={start.isPending} className="bg-[#0866FF] hover:bg-[#0866FF]/90">
      {start.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plug className="mr-2 h-4 w-4" />}
      {label}
    </Button>
  );

  if (state === "disconnected") {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Entre com o portfólio empresarial do Meta e escolha as páginas, contas de anúncio e o pixel que o Rev pode usar.
          Os leads dos formulários instantâneos passam a chegar direto no CRM, já ligados ao anúncio e à campanha.
        </p>
        {connectButton("Conectar com Meta")}
      </div>
    );
  }

  const warnings = integ?.settings?.discovery_warnings ?? [];
  const queue = status.data?.queue;
  const health = metaQueueHealth(queue);
  const byType = (t: MetaAsset["asset_type"]) => assets.filter((a) => a.asset_type === t);

  return (
    <div className="space-y-4 text-sm">
      {state === "reconnect" ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="space-y-2">
            <p>{integ?.last_sync_error ?? "A conexão com o Meta precisa ser refeita."}</p>
            {connectButton("Reconectar")}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> Conectado
          {integ?.settings?.business_name ? <span className="text-muted-foreground">· {integ.settings.business_name}</span> : null}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Páginas" value={sum.pages} />
        <Stat label="Contas de anúncio" value={sum.adAccounts} />
        <Stat label="Pixels" value={sum.datasets} />
      </div>

      {queue && (queue.done || queue.queued || queue.error || queue.dead) ? (
        <div className={`rounded-lg border p-3 text-xs ${health === "attention" ? "border-destructive/40 bg-destructive/5" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>{queue.done}</strong> lead(s) recebidos
              {queue.last_lead_at ? <> · último {when(queue.last_lead_at)}</> : null}
              {queue.queued ? <> · {queue.queued} na fila</> : null}
              {queue.error + queue.dead ? <span className="text-destructive"> · {queue.error + queue.dead} com erro</span> : null}
            </span>
            {queue.error + queue.dead ? (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => retryFailed.mutate()} disabled={retryFailed.isPending}>
                {retryFailed.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}
                Tentar de novo
              </Button>
            ) : null}
          </div>
          {queue.recent_errors.length ? (
            <ul className="mt-2 list-disc space-y-0.5 pl-4 text-muted-foreground">
              {queue.recent_errors.map((e) => (
                <li key={e.leadgen_id}>
                  Lead {e.leadgen_id} · {e.error ?? "erro"} {e.status === "dead" ? "(desistiu após várias tentativas)" : `(tentativa ${e.attempts})`}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {(["page", "ad_account", "dataset"] as const).map((t) =>
        byType(t).length ? (
          <div key={t} className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{TYPE_LABEL[t]}</p>
            <ul className="divide-y rounded-lg border">
              {byType(t).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate">{a.name ?? a.external_id}</p>
                    {t === "page" && (a.last_event_at || a.last_error) ? (
                      <p className={`text-[11px] ${a.last_error && a.status !== "active" ? "text-destructive" : "text-muted-foreground"}`}>
                        {a.last_event_at ? `Último lead ${when(a.last_event_at)}` : null}
                        {a.last_error ? `${a.last_event_at ? " · " : ""}${a.last_error}` : null}
                      </p>
                    ) : null}
                  </div>
                  {t === "page" ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">{a.status === "active" ? "recebendo leads" : "receber leads"}</span>
                      <Switch
                        checked={a.status === "active"}
                        disabled={pageToggle.isPending}
                        onCheckedChange={(on) => pageToggle.mutate({ assetId: a.id, on })}
                        aria-label={`Receber leads de ${a.name ?? a.external_id}`}
                      />
                    </div>
                  ) : (
                    <Badge variant={a.status === "error" ? "destructive" : "secondary"} className="text-[10px]">
                      {a.status === "error" ? "erro" : "disponível"}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}

      <MetaFormsSection hasActivePage={sum.activePages > 0} />

      <MetaCapiSection datasets={byType("dataset")} />

      {warnings.length ? (
        <details className="rounded-lg border p-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer">Avisos da última leitura ({warnings.length})</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </details>
      ) : null}

      <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
        Se o seu Business usa o <strong>Gerenciador de acesso a leads</strong>, libere o app do Rev lá
        (Configurações do negócio › Integrações › Acesso a leads). Sem isso o Meta não entrega os leads.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => rediscover.mutate()} disabled={rediscover.isPending}>
          {rediscover.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Atualizar ativos
        </Button>
        <Button variant="outline" size="sm" onClick={() => probe.mutate()} disabled={probe.isPending}>
          {probe.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Stethoscope className="mr-2 h-4 w-4" />}
          Diagnóstico
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
          <Unplug className="mr-2 h-4 w-4" /> Desconectar
        </Button>
      </div>

      {probe.data ? (
        <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 text-[11px]">{JSON.stringify(probe.data, null, 2)}</pre>
      ) : null}
    </div>
  );
}

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-lg border p-2">
    <div className="text-lg font-semibold">{value}</div>
    <div className="text-[11px] text-muted-foreground">{label}</div>
  </div>
);
