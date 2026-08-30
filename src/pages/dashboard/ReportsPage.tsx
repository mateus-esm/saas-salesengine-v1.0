/**
 * Sprint 9 — "Relatórios": the client configures what arrives on their phone.
 *
 * The founder's words: "they can setup this daily, weekly, monthly report,
 * define the hours that they want to receive and the number". That is exactly
 * four decisions, and this page is four decisions and nothing else:
 *
 *   quando · o que vem · para quem · ligado ou não
 *
 * The section list reuses the dashboard's widget catalogue, so a client learns
 * one vocabulary. "Propostas enviadas" means the same thing on the screen and
 * in the message because it is literally the same id feeding the same core.
 */
import { useState } from "react";
import {
  Clock,
  Loader2,
  Plus,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WIDGET_CATALOG } from "@/config/widgetCatalog";
import {
  useReportSchedules,
  type ReportFrequency,
  type ReportSchedule,
} from "@/hooks/useReportSchedules";
import { useRole } from "@/hooks/useRole";

const FREQ_LABEL: Record<ReportFrequency, string> = {
  daily: "Diário",
  weekly: "Semanal",
  monthly: "Mensal",
};

const WEEKDAYS = [
  { v: 1, l: "Segunda" }, { v: 2, l: "Terça" }, { v: 3, l: "Quarta" },
  { v: 4, l: "Quinta" }, { v: 5, l: "Sexta" }, { v: 6, l: "Sábado" }, { v: 7, l: "Domingo" },
];

/** Only widgets that survive being read as text on a phone. */
const REPORTABLE = WIDGET_CATALOG.filter(
  (w) =>
    w.kind === "kpi" ||
    w.id === "panel_loss_reasons" ||
    w.id === "panel_top_opportunities",
);

export default function ReportsPage() {
  const { schedules, recipients, isLoading, createSchedule, updateSchedule, deleteSchedule, addRecipient, removeRecipient } =
    useReportSchedules();
  const { isAdmin } = useRole();

  if (isLoading) {
    return (
      <div className="flex min-h-[260px] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin()) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-xs text-muted-foreground">
            Só administradores configuram relatórios — eles enviam mensagens para telefones da
            equipe.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Relatórios automáticos</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            O resumo do seu processo comercial chega no WhatsApp, no horário que você escolher.
          </p>
        </div>
        <Button
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() =>
            createSchedule.mutate({
              name: "Relatório diário",
              frequency: "daily",
              send_hour: 8,
              timezone: "America/Sao_Paulo",
            })
          }
          disabled={createSchedule.isPending}
        >
          <Plus className="h-3.5 w-3.5" />
          Novo relatório
        </Button>
      </div>

      {schedules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Send className="mx-auto mb-3 h-7 w-7 text-muted-foreground/60" />
            <p className="text-xs text-muted-foreground">
              Nenhum relatório agendado ainda. Crie um e escolha o horário, os números e o que
              entra nele.
            </p>
          </CardContent>
        </Card>
      ) : (
        schedules.map((s) => (
          <ScheduleCard
            key={s.id}
            schedule={s}
            recipients={recipients.filter((r) => r.schedule_id === s.id)}
            onUpdate={(patch) => updateSchedule.mutate({ id: s.id, ...patch })}
            onDelete={() => deleteSchedule.mutate(s.id)}
            onAddRecipient={(name, phone) =>
              addRecipient.mutate({ scheduleId: s.id, name, phone })
            }
            onRemoveRecipient={(id) => removeRecipient.mutate(id)}
          />
        ))
      )}
    </div>
  );
}

function ScheduleCard({
  schedule: s,
  recipients,
  onUpdate,
  onDelete,
  onAddRecipient,
  onRemoveRecipient,
}: {
  schedule: ReportSchedule;
  recipients: { id: string; name: string | null; phone: string }[];
  onUpdate: (patch: Partial<ReportSchedule>) => void;
  onDelete: () => void;
  onAddRecipient: (name: string, phone: string) => void;
  onRemoveRecipient: (id: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const toggleSection = (id: string) => {
    const next = s.sections.includes(id)
      ? s.sections.filter((x) => x !== id)
      : [...s.sections, id];
    onUpdate({ sections: next });
  };

  return (
    <Card className={s.active ? "" : "opacity-70"}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="min-w-0 flex-1">
          <Input
            value={s.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            className="h-8 max-w-[280px] border-transparent bg-transparent px-0 text-sm font-semibold focus-visible:border-input focus-visible:px-2"
          />
          <CardDescription className="mt-0.5 text-xs">
            {s.next_run_at && s.active ? (
              <>
                Próximo envio{" "}
                {format(parseISO(s.next_run_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
              </>
            ) : (
              "Desativado — nenhum envio agendado"
            )}
            {s.last_run_at && (
              <> · último em {format(parseISO(s.last_run_at), "dd/MM", { locale: ptBR })}</>
            )}
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Switch
            checked={s.active}
            onCheckedChange={(v) => onUpdate({ active: v })}
            aria-label="Ativo"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            aria-label="Remover relatório"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* ---- quando ---- */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Frequência
            </Label>
            <Select
              value={s.frequency}
              onValueChange={(v) => {
                const f = v as ReportFrequency;
                // Weekly needs a weekday and monthly a monthday, or the row's
                // CHECK rejects it. Defaults are filled in rather than leaving
                // the client to discover the constraint through an error.
                onUpdate({
                  frequency: f,
                  weekday: f === "weekly" ? (s.weekday ?? 1) : null,
                  monthday: f === "monthly" ? (s.monthday ?? 1) : null,
                });
              }}
            >
              <SelectTrigger className="mt-1 h-8 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(FREQ_LABEL) as ReportFrequency[]).map((f) => (
                  <SelectItem key={f} value={f} className="text-xs">
                    {FREQ_LABEL[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {s.frequency === "weekly" && (
            <div>
              <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Dia
              </Label>
              <Select
                value={String(s.weekday ?? 1)}
                onValueChange={(v) => onUpdate({ weekday: Number(v) })}
              >
                <SelectTrigger className="mt-1 h-8 w-[120px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((d) => (
                    <SelectItem key={d.v} value={String(d.v)} className="text-xs">
                      {d.l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {s.frequency === "monthly" && (
            <div>
              <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Dia do mês
              </Label>
              <Select
                value={String(s.monthday ?? 1)}
                onValueChange={(v) => onUpdate({ monthday: Number(v) })}
              >
                <SelectTrigger className="mt-1 h-8 w-[110px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* Capped at 28 so February never silently skips a month. */}
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <SelectItem key={d} value={String(d)} className="text-xs">
                      Dia {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Horário
            </Label>
            <Select
              value={String(s.send_hour)}
              onValueChange={(v) => onUpdate({ send_hour: Number(v) })}
            >
              <SelectTrigger className="mt-1 h-8 w-[100px] text-xs">
                <Clock className="mr-1 h-3 w-3 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, h) => h).map((h) => (
                  <SelectItem key={h} value={String(h)} className="text-xs">
                    {String(h).padStart(2, "0")}:00
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="pb-1.5 text-[11px] text-muted-foreground">
            Horário de {s.timezone.replace("America/", "").replace("_", " ")}
          </p>
        </div>

        <Separator />

        {/* ---- o que vem ---- */}
        <div>
          <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            O que entra no relatório
          </Label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {REPORTABLE.map((w) => {
              const on = s.sections.includes(w.id);
              return (
                <button
                  key={w.id}
                  type="button"
                  title={w.description}
                  onClick={() => toggleSection(w.id)}
                  className={
                    "rounded-full border px-3 py-1.5 text-xs transition-colors " +
                    (on
                      ? "border-primary bg-primary/10 font-medium text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/40")
                  }
                >
                  {w.label}
                </button>
              );
            })}
          </div>
          {s.sections.length === 0 && (
            <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
              Nenhum bloco selecionado — o relatório sairia praticamente vazio.
            </p>
          )}
        </div>

        <Separator />

        {/* ---- para quem ---- */}
        <div>
          <Label className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <Users className="h-3 w-3" />
            Quem recebe
          </Label>

          <div className="mt-2 space-y-1.5">
            {recipients.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                  {r.name || "Sem nome"}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  +{r.phone}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemoveRecipient(r.id)}
                  aria-label={`Remover ${r.name ?? r.phone}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            {recipients.length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                Ninguém recebe este relatório ainda.
              </p>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome"
              className="h-8 w-[150px] text-xs"
            />
            <Input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="(11) 99999-8888"
              className="h-8 w-[160px] text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newPhone.trim()) {
                  onAddRecipient(newName, newPhone);
                  setNewName("");
                  setNewPhone("");
                }
              }}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1 text-xs"
              disabled={!newPhone.trim()}
              onClick={() => {
                onAddRecipient(newName, newPhone);
                setNewName("");
                setNewPhone("");
              }}
            >
              <Plus className="h-3 w-3" />
              Adicionar
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Pode digitar com DDD; o número é normalizado com o 55 automaticamente.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
