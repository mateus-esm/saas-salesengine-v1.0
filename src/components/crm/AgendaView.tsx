import { useState } from "react";
import { format, startOfWeek, addWeeks, subWeeks, isSameDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Calendar, Clock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAgendaEvents } from "@/hooks/useAgendaEvents";
import { cn } from "@/lib/utils";

export function AgendaView() {
  const { events, isLoading, createEvent, deleteEvent } = useAgendaEvents();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const typeIcon: Record<string, string> = { meeting: "\u{1F4C5}", compromisso: "\u{1F4CC}", block: "\u{1F512}" };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <Button variant="ghost" size="sm" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">
          {format(weekStart, "dd 'de' MMM", { locale: ptBR })} — {format(days[6], "dd 'de' MMM", { locale: ptBR })}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <p className="text-xs text-muted-foreground p-4">Carregando...</p>
        ) : events.length === 0 ? (
          <p className="text-xs text-muted-foreground p-4">Nenhum evento nesta semana.</p>
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
                    {dayEvents.map((ev) => (
                      <div key={ev.id} className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-accent/30">
                        <span className="text-xs">{typeIcon[ev.type] ?? "\u{1F4CC}"}</span>
                        <span className="flex-1">{ev.title}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {format(parseISO(ev.starts_at), "HH:mm")}-{format(parseISO(ev.ends_at), "HH:mm")}
                        </span>
                      </div>
                    ))}
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
