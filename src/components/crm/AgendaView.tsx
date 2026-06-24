import { useState } from "react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Calendar, Clock, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAgendaEvents } from "@/hooks/useAgendaEvents";
import { cn } from "@/lib/utils";

function roundHour(d: Date, offset: number) {
  const r = new Date(d);
  r.setMinutes(0, 0, 0);
  r.setHours(r.getHours() + offset);
  return r;
}

type ViewMode = "day" | "week" | "month";

export function AgendaView() {
  const { events, isLoading, createEvent, deleteEvent } = useAgendaEvents();
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [focusedDay, setFocusedDay] = useState(() => new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("meeting");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [notes, setNotes] = useState("");

  function resetForm() {
    const start = roundHour(new Date(), 1);
    const end = roundHour(new Date(), 2);
    setTitle("");
    setType("meeting");
    setStartsAt(start.toISOString().slice(0, 16));
    setEndsAt(end.toISOString().slice(0, 16));
    setNotes("");
  }

  function openDialog() {
    resetForm();
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await createEvent.mutateAsync({
      title: title.trim(),
      type,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(endsAt).toISOString(),
      notes: notes.trim() || undefined,
    });
    setDialogOpen(false);
  }

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const typeIcon: Record<string, string> = { meeting: "\u{1F4C5}", compromisso: "\u{1F4CC}", block: "\u{1F512}" };

  function goPrev() {
    if (viewMode === "day") {
      const prev = new Date(focusedDay);
      prev.setDate(prev.getDate() - 1);
      setFocusedDay(prev);
    } else if (viewMode === "month") {
      setFocusedDay(subMonths(focusedDay, 1));
    } else {
      setWeekStart(subWeeks(weekStart, 1));
    }
  }

  function goNext() {
    if (viewMode === "day") {
      const next = new Date(focusedDay);
      next.setDate(next.getDate() + 1);
      setFocusedDay(next);
    } else if (viewMode === "month") {
      setFocusedDay(addMonths(focusedDay, 1));
    } else {
      setWeekStart(addWeeks(weekStart, 1));
    }
  }

  // Calendar grid for the focused month (full weeks, Sun–Sat).
  const monthGrid = eachDayOfInterval({
    start: startOfWeek(startOfMonth(focusedDay), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(focusedDay), { weekStartsOn: 0 }),
  });

  function goToday() {
    const today = new Date();
    setFocusedDay(today);
    setWeekStart(startOfWeek(today, { weekStartsOn: 0 }));
  }

  function renderEventRow(ev: { id: string; type: string; title: string; starts_at: string; ends_at: string }) {
    return (
      <div key={ev.id} className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-accent/30 group">
        <span className="text-xs">{typeIcon[ev.type] ?? "\u{1F4CC}"}</span>
        <span className="flex-1">{ev.title}</span>
        <span className="text-[10px] text-muted-foreground font-mono">
          {format(parseISO(ev.starts_at), "HH:mm")}-{format(parseISO(ev.ends_at), "HH:mm")}
        </span>
        <button
          type="button"
          onClick={() => deleteEvent.mutate(ev.id)}
          className="text-muted-foreground/40 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
          title="Remover evento"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  const headerLabel = viewMode === "day"
    ? format(focusedDay, "EEEE, dd 'de' MMM", { locale: ptBR })
    : viewMode === "month"
    ? format(focusedDay, "MMMM 'de' yyyy", { locale: ptBR })
    : `${format(weekStart, "dd 'de' MMM", { locale: ptBR })} — ${format(days[6], "dd 'de' MMM", { locale: ptBR })}`;

  const emptyLabel = viewMode === "day"
    ? "Nenhum evento neste dia."
    : viewMode === "month"
    ? "Nenhum evento neste mês."
    : "Nenhum evento nesta semana.";

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={goPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={goToday} className="text-xs">
            Hoje
          </Button>
          <Button variant="ghost" size="sm" onClick={goNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <span className="text-sm font-medium">{headerLabel}</span>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode("day")}
              className={cn(
                "px-3 py-1 text-xs font-medium transition-colors",
                viewMode === "day" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              Dia
            </button>
            <button
              type="button"
              onClick={() => setViewMode("week")}
              className={cn(
                "px-3 py-1 text-xs font-medium transition-colors",
                viewMode === "week" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              Semana
            </button>
            <button
              type="button"
              onClick={() => setViewMode("month")}
              className={cn(
                "px-3 py-1 text-xs font-medium transition-colors",
                viewMode === "month" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              Mês
            </button>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" onClick={openDialog}>
                <Plus className="h-4 w-4 mr-1" />
                Novo Bloco
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo Evento na Agenda</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Titulo</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Titulo do evento"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Tipo</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger id="type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="meeting">Reuniao</SelectItem>
                      <SelectItem value="compromisso">Compromisso</SelectItem>
                      <SelectItem value="block">Bloqueio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="starts_at">Inicio</Label>
                    <Input
                      id="starts_at"
                      type="datetime-local"
                      value={startsAt}
                      onChange={(e) => setStartsAt(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ends_at">Fim</Label>
                    <Input
                      id="ends_at"
                      type="datetime-local"
                      value={endsAt}
                      onChange={(e) => setEndsAt(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Observacoes</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Observacoes (opcional)"
                    rows={3}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={!title.trim() || createEvent.isPending}>
                    {createEvent.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <p className="text-xs text-muted-foreground p-4">Carregando...</p>
        ) : events.length === 0 && viewMode !== "month" ? (
          <p className="text-xs text-muted-foreground p-4">{emptyLabel}</p>
        ) : viewMode === "month" ? (
          <div className="p-3">
            <div className="grid grid-cols-7 gap-px text-center text-[10px] font-medium text-muted-foreground mb-1">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
                <div key={d} className="py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px bg-border/30 rounded-md overflow-hidden">
              {monthGrid.map((day) => {
                const dayEvents = events.filter((e) => isSameDay(parseISO(e.starts_at), day));
                const inMonth = isSameMonth(day, focusedDay);
                const today = isSameDay(day, new Date());
                return (
                  <button
                    type="button"
                    key={day.toISOString()}
                    onClick={() => { setFocusedDay(day); setViewMode("day"); }}
                    className={cn(
                      "min-h-[64px] bg-background p-1 text-left hover:bg-accent/40 transition-colors flex flex-col gap-0.5",
                      !inMonth && "opacity-40",
                    )}
                  >
                    <span
                      className={cn(
                        "text-[10px] font-medium inline-flex h-4 w-4 items-center justify-center rounded-full",
                        today && "bg-primary text-primary-foreground",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    {dayEvents.slice(0, 3).map((ev) => (
                      <span key={ev.id} className="truncate text-[9px] leading-tight text-foreground/70">
                        {typeIcon[ev.type] ?? "\u{1F4CC}"} {ev.title}
                      </span>
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-[9px] text-muted-foreground">+{dayEvents.length - 3}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : viewMode === "day" ? (
          <div className="px-4 py-3">
            <h3 className="text-xs font-semibold text-muted-foreground mb-2">
              {format(focusedDay, "EEEE, dd/MM", { locale: ptBR })}
            </h3>
            <div className="space-y-1">
              {events
                .filter((e) => isSameDay(parseISO(e.starts_at), focusedDay))
                .map((ev) => renderEventRow(ev))}
            </div>
            {events.filter((e) => isSameDay(parseISO(e.starts_at), focusedDay)).length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum evento neste dia.</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {days.map((day) => {
              const dayEvents = events.filter((e) => isSameDay(parseISO(e.starts_at), day));
              if (dayEvents.length === 0) return null;
              return (
                <div key={day.toISOString()} className="px-4 py-3">
                  <h3 className="text-xs font-semibold text-muted-foreground mb-2">
                    {format(day, "EEEE, dd/MM", { locale: ptBR })}
                  </h3>
                  <div className="space-y-1">
                    {dayEvents.map((ev) => renderEventRow(ev))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

