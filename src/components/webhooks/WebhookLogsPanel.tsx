import { Fragment, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronRight, Loader2, RotateCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAutomationRuns, useResendDelivery } from "@/hooks/useAutomations";
import { filterWebhookLogs, isFailedDelivery, logStatus, type LogFilters } from "@/lib/webhookCatalog";
import type { WebhookLog } from "@/types/webhook";

const STATUS_BADGE = {
  success: <Badge className="bg-green-600">Sucesso</Badge>,
  error: <Badge variant="destructive">Erro</Badge>,
  pending: <Badge variant="outline">Pendente</Badge>,
};
const RUN_BADGE = {
  ok: <Badge className="bg-green-600">Executada</Badge>,
  error: <Badge variant="destructive">Erro</Badge>,
  skipped: <Badge variant="secondary">Ignorada</Badge>,
  running: <Badge variant="outline">Em andamento</Badge>,
};
const fmt = (iso: string) => format(new Date(iso), "dd/MM/yyyy HH:mm:ss", { locale: ptBR });
const ALL = "all";

interface Props {
  logs: WebhookLog[];
  isLoading: boolean;
  eventLabel: (event: string) => string;
}

export const WebhookLogsPanel = ({ logs, isLoading, eventLabel }: Props) => {
  const [filters, setFilters] = useState<LogFilters>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const resend = useResendDelivery();
  const { runs } = useAutomationRuns();

  const events = useMemo(() => [...new Set(logs.map((l) => l.event_type))].sort(), [logs]);
  const visible = useMemo(() => filterWebhookLogs(logs, filters), [logs, filters]);
  const set = (patch: Partial<LogFilters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Webhooks</CardTitle>
          <CardDescription>Entregas e chamadas recebidas. Clique numa linha para ver o que foi enviado e a resposta.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Select value={filters.status || ALL} onValueChange={(v) => set({ status: v === ALL ? "" : (v as LogFilters["status"]) })}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os status</SelectItem>
                <SelectItem value="success">Sucesso</SelectItem>
                <SelectItem value="error">Erro</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.event || ALL} onValueChange={(v) => set({ event: v === ALL ? "" : v })}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Evento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os eventos</SelectItem>
                {events.map((e) => <SelectItem key={e} value={e}>{eventLabel(e)}</SelectItem>)}
              </SelectContent>
            </Select>
            <label className="text-sm text-muted-foreground">De <Input type="date" className="w-40" value={filters.from ?? ""} onChange={(e) => set({ from: e.target.value })} /></label>
            <label className="text-sm text-muted-foreground">Até <Input type="date" className="w-40" value={filters.to ?? ""} onChange={(e) => set({ to: e.target.value })} /></label>
            {(filters.status || filters.event || filters.from || filters.to) && <Button variant="ghost" size="sm" onClick={() => setFilters({})}>Limpar</Button>}
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : visible.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum log encontrado</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow><TableHead /><TableHead>Data</TableHead><TableHead>Direção</TableHead><TableHead>Evento</TableHead><TableHead>Status</TableHead><TableHead /></TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((log) => (
                  <Fragment key={log.id}>
                    <TableRow className="cursor-pointer" onClick={() => setOpenId(openId === log.id ? null : log.id)}>
                      <TableCell>{openId === log.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmt(log.created_at)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="flex items-center gap-1 w-fit">
                          {log.direction === "inbound" ? <><ArrowDownLeft className="h-3 w-3" />Entrada</> : <><ArrowUpRight className="h-3 w-3" />Saída</>}
                        </Badge>
                      </TableCell>
                      <TableCell>{log.event_type === "test" ? "Teste manual" : eventLabel(log.event_type)}</TableCell>
                      <TableCell>{STATUS_BADGE[logStatus(log)]}{log.response_status ? <span className="ml-2 text-xs text-muted-foreground">HTTP {log.response_status}</span> : null}</TableCell>
                      <TableCell>
                        {isFailedDelivery(log) && (
                          <Button variant="outline" size="sm" disabled={resend.isPending}
                            onClick={(e) => { e.stopPropagation(); resend.mutate(log.id); }}>
                            <RotateCw className="h-3 w-3 mr-1" />Reenviar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                    {openId === log.id && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/40 space-y-3">
                          <div>
                            <p className="text-xs font-medium mb-1">{log.direction === "inbound" ? "Payload recebido" : "Payload enviado"}</p>
                            <pre className="text-xs overflow-x-auto max-h-60 bg-background p-2 rounded">{JSON.stringify(log.payload, null, 2)}</pre>
                          </div>
                          <div>
                            <p className="text-xs font-medium mb-1">Resposta</p>
                            <pre className="text-xs overflow-x-auto max-h-40 bg-background p-2 rounded whitespace-pre-wrap">
                              {log.error_message ? `Erro: ${log.error_message}\n` : ""}{log.response_body ?? "(sem corpo)"}
                            </pre>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Execuções de automações</CardTitle>
          <CardDescription>O que cada automação fez, e por que falhou quando falhou.</CardDescription>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">Nenhuma execução registrada</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Ação</TableHead><TableHead>Status</TableHead><TableHead>Detalhe</TableHead></TableRow></TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{fmt(r.created_at)}</TableCell>
                    <TableCell>{String((r.input as { action?: { type?: string } })?.action?.type ?? "—")}</TableCell>
                    <TableCell>{RUN_BADGE[r.status]}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.error ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
