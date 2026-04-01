import * as React from "react"
import { format, subDays, startOfMonth, endOfMonth } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react"
import { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export type PresetRange = 'today' | '7d' | '30d' | 'thisMonth' | 'custom'

interface UsageFilterProps {
  date: DateRange | undefined
  setDate: (date: DateRange | undefined) => void
  onPresetSelect: (preset: PresetRange) => void
  activePreset: PresetRange
  className?: string
}

export function UsageFilter({
  date,
  setDate,
  onPresetSelect,
  activePreset,
  className,
}: UsageFilterProps) {
  const [isOpen, setIsOpen] = React.useState(false)

  const presets = [
    { label: 'Hoje', value: 'today', onClick: () => {
      onPresetSelect('today')
      setDate({ from: new Date(), to: new Date() })
      setIsOpen(false)
    }},
    { label: 'Últimos 7 dias', value: '7d', onClick: () => {
      onPresetSelect('7d')
      setDate({ from: subDays(new Date(), 7), to: new Date() })
      setIsOpen(false)
    }},
    { label: 'Últimos 30 dias', value: '30d', onClick: () => {
      onPresetSelect('30d')
      setDate({ from: subDays(new Date(), 30), to: new Date() })
      setIsOpen(false)
    }},
    { label: 'Este Mês', value: 'thisMonth', onClick: () => {
      onPresetSelect('thisMonth')
      const today = new Date()
      setDate({ from: startOfMonth(today), to: endOfMonth(today) })
      setIsOpen(false)
    }},
  ]

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="hidden sm:flex items-center bg-muted p-1 rounded-lg">
        {presets.map((preset) => (
          <button
            key={preset.value}
            onClick={preset.onClick}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
              activePreset === preset.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-[260px] justify-start text-left font-normal bg-card",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "dd/MM/yyyy", { locale: ptBR })} -{" "}
                  {format(date.to, "dd/MM/yyyy", { locale: ptBR })}
                </>
              ) : (
                format(date.from, "dd/MM/yyyy", { locale: ptBR })
              )
            ) : (
              <span>Selecione um período</span>
            )}
            <ChevronDown className="ml-auto h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <div className="flex border-b sm:hidden p-2 gap-1 overflow-x-auto">
             {presets.map((preset) => (
              <button
                key={preset.value}
                onClick={preset.onClick}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap",
                  activePreset === preset.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={(d) => {
              setDate(d)
              if (d?.from && d?.to) {
                onPresetSelect('custom')
              }
            }}
            numberOfMonths={1}
            locale={ptBR}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
