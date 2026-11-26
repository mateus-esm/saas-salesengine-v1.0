// Sprint 17 · Fase 4 — API de Conversões (CAPI para CRM): Pixel/Dataset,
// interruptor geral, etapa do funil → evento (tudo desligado por padrão),
// evento de teste e os últimos envios. Ligar eventos reais (MQL/SQL) é decisão
// de cada equipe; o Rev só deixa a estrada pronta.

import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Loader2, Save } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useMetaCapi } from "@/hooks/useMeta";
import { capiSkipLabel, isValidEventName, suggestEventName, type CapiMapping, type MetaAsset } from "@/lib/meta";

const STATUS_LABEL: Record<string, string> = {
  queued: "na fila",
  processing: "enviando",
  sent: "enviado",
  error: "erro",
  skipped: "pulado",
  dead: "falhou",
};

export function MetaCapiSection({ datasets }: { datasets: MetaAsset[] }) {
  const { config, save, test } = useMetaCapi(true);
  const cfg = config.data;
  const [rows, setRows] = useState<Record<string, CapiMapping>>({});
  const [pipelineId, setPipelineId] = useState<string>("");
  const [code, setCode] = useState("");

  useEffect(() => {
    if (!cfg) return;
    setRows(Object.fromEntries(cfg.mappings.map((m) => [m.stage_id, m])));
    setPipelineId((p) => p || cfg.pipelines[0]?.id || "");
  }, [cfg]);

  const stages = useMemo(() => (cfg?.stages ?? []).filter((s) => s.pipeline_id === pipelineId), [cfg, pipelineId]);
  const invalid = Object.values(rows).some((r) => !isValidEventName(r.event_name));

  if (config.isLoading || !cfg) {
    return <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando a API de Conversões…</div>;
  }

  const rowOf = (stageId: string, name: string): CapiMapping => rows[stageId] ?? { stage_id: stageId, event_name: suggestEventName(name), active: false };
  const setRow = (stageId: string, name: string, patch: Partial<CapiMapping>) =>
    setRows((r) => ({ ...r, [stageId]: { ...rowOf(stageId, name), ...patch } }));

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">API de Conversões</p>
          <p className="text-xs text-muted-foreground">
            Devolve ao Meta quais leads avançaram no funil, para o algoritmo buscar quem compra. Tudo começa desligado.
          </p>
        </div>
        <Switch
          checked={cfg.capi_enabled}
          disabled={save.isPending || (!cfg.dataset_id && !cfg.capi_enabled)}
          onCheckedChange={(v) => save.mutate({ capi_enabled: v })}
          aria-label="Ligar a API de Conversões"
        />
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Pixel / Dataset</p>
        {datasets.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum pixel compartilhado. Reconecte e marque o pixel no diálogo do Meta.</p>
        ) : (
          <Select value={cfg.dataset_id ?? ""} onValueChange={(v) => save.mutate({ dataset_id: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Escolha o pixel" /></SelectTrigger>
            <SelectContent>
              {datasets.map((d) => <SelectItem key={d.external_id} value={d.external_id}>{d.name ?? d.external_id}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">Etapa do funil → evento</p>
          {cfg.pipelines.length > 1 ? (
            <Select value={pipelineId} onValueChange={setPipelineId}>
              <SelectTrigger className="h-7 w-[180px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{cfg.pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          ) : null}
        </div>
        <ul className="divide-y rounded-lg border">
          {stages.map((s) => {
            const r = rowOf(s.id, s.name);
            return (
              <li key={s.id} className="grid grid-cols-[1fr,minmax(0,1.2fr),auto] items-center gap-2 px-3 py-1.5">
                <span className="truncate text-xs">{s.name}</span>
                <Input
                  value={r.event_name}
                  onChange={(e) => setRow(s.id, s.name, { event_name: e.target.value })}
                  className={`h-7 text-xs ${isValidEventName(r.event_name) ? "" : "border-destructive"}`}
                  aria-label={`Evento da etapa ${s.name}`}
                />
                <Switch checked={r.active} onCheckedChange={(v) => setRow(s.id, s.name, { active: v })} aria-label={`Enviar ${s.name}`} />
              </li>
            );
          })}
        </ul>
        <Button size="sm" variant="outline" disabled={save.isPending || invalid || Object.keys(rows).length === 0}
          onClick={() => save.mutate({ mappings: Object.values(rows) })}>
          {save.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
          Salvar mapeamento
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Só vai ao Meta o que estiver ligado aqui <strong>e</strong> com a chave geral ligada. Lead de formulário casa pelo ID do lead;
          lead do site pelo clique (fbclid) e e-mail/telefone com hash. Lead de WhatsApp exige a API oficial do WhatsApp Business e fica de fora por enquanto.
        </p>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Evento de teste</p>
        <div className="flex gap-2">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código de teste (ex.: TEST12345)" className="h-8 text-xs" />
          <Button size="sm" variant="outline" disabled={!code.trim() || !cfg.dataset_id || test.isPending} onClick={() => test.mutate(code.trim())}>
            {test.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="mr-2 h-3.5 w-3.5" />}
            Enviar evento de teste
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">O código fica em Gerenciador de Eventos › seu pixel › Testar eventos. Não usa nenhum lead real.</p>
      </div>

      {cfg.recent.length ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Últimos envios ({cfg.recent.length})</summary>
          <ul className="mt-2 space-y-1">
            {cfg.recent.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2">
                <Badge variant={e.status === "sent" ? "default" : e.status === "error" || e.status === "dead" ? "destructive" : "secondary"} className="text-[10px]">
                  {STATUS_LABEL[e.status] ?? e.status}
                </Badge>
                <span>{e.event_name}{e.test_event_code ? " (teste)" : ""}</span>
                <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                {e.skip_reason ? <span className="text-muted-foreground">· {capiSkipLabel(e.skip_reason)}</span> : null}
                {e.last_error ? <span className="text-destructive">· {e.last_error}</span> : null}
                {e.response?.fbtrace_id ? <span className="text-muted-foreground">· trace {e.response.fbtrace_id}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
