import { useState, useEffect } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { ptBR } from "date-fns/locale";

interface NextContactBadgeProps {
  nextContactLabel: string | null;
  nextContactState: 'overdue' | 'today' | 'future' | null;
  onChange: (date: Date | null) => void;
  currentDate?: string | null;
}

export function NextContactBadge({
  nextContactLabel,
  nextContactState,
  onChange,
  currentDate,
}: NextContactBadgeProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    currentDate ? new Date(currentDate) : undefined
  );
  const [open, setOpen] = useState(false);

  // Sync with prop if it changes
  useEffect(() => {
    setSelectedDate(currentDate ? new Date(currentDate) : undefined);
  }, [currentDate]);

  const handleSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    onChange(date || null);
    setOpen(false);
  };

  if (!nextContactState) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] font-medium bg-muted/50 hover:bg-muted text-muted-foreground transition-colors cursor-pointer"
            title="Agendar Próximo Contato"
          >
            <CalendarIcon className="h-3 w-3 shrink-0" />
            <span>Agendar contato</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleSelect}
            locale={ptBR}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    );
  }

  // Define colors based on nextContactState
  const badgeClasses = cn(
    "inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer",
    nextContactState === "overdue" && "bg-destructive/15 text-destructive-foreground hover:bg-destructive/25",
    nextContactState === "today" && "bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20",
    nextContactState === "future" && "bg-muted/50 text-muted-foreground hover:bg-muted"
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={badgeClasses} title="Alterar data de próximo contato">
          <CalendarIcon className="h-3 w-3 shrink-0" />
          <span className="truncate">{nextContactLabel}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-2 border-b border-border flex justify-between items-center bg-muted/20">
          <span className="text-[11px] font-medium text-muted-foreground">Próximo Contato</span>
          {selectedDate && (
            <button
              type="button"
              onClick={() => handleSelect(undefined)}
              className="text-[10px] text-destructive hover:underline"
            >
              Limpar
            </button>
          )}
        </div>
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          locale={ptBR}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
