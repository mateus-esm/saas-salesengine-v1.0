import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { PipelineStage, TeamMember } from "@/types/crm";
import { Filter, X, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface TableFiltersProps {
  stages: PipelineStage[];
  members: TeamMember[];
  filters: {
    stage: string;
    responsible: string;
    source: string;
    dateFrom: Date | null;
    dateTo: Date | null;
    minValue: string;
    maxValue: string;
  };
  onFiltersChange: (filters: TableFiltersProps["filters"]) => void;
  onClear: () => void;
}

export const TableFilters = ({
  stages,
  members,
  filters,
  onFiltersChange,
  onClear,
}: TableFiltersProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const hasActiveFilters =
    filters.stage ||
    filters.responsible ||
    filters.source ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.minValue ||
    filters.maxValue;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <Filter className="h-4 w-4 mr-2" />
          Filtros Avançados
          {hasActiveFilters && (
            <span className="absolute -top-1 -right-1 h-3 w-3 bg-primary rounded-full" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="start">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Filtros Avançados</h4>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onClear();
                  setIsOpen(false);
                }}
              >
                <X className="h-4 w-4 mr-1" />
                Limpar
              </Button>
            )}
          </div>

          {/* Stage Filter */}
          <div className="space-y-2">
            <Label>Etapa</Label>
            <Select
              value={filters.stage}
              onValueChange={(value) =>
                onFiltersChange({ ...filters, stage: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Todas as etapas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todas as etapas</SelectItem>
                {stages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Responsible Filter */}
          <div className="space-y-2">
            <Label>Responsável</Label>
            <Select
              value={filters.responsible}
              onValueChange={(value) =>
                onFiltersChange({ ...filters, responsible: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos</SelectItem>
                {members.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.nome_completo || member.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Source Filter */}
          <div className="space-y-2">
            <Label>Origem</Label>
            <Select
              value={filters.source}
              onValueChange={(value) =>
                onFiltersChange({ ...filters, source: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Todas as origens" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todas as origens</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="agente_sdr">Agente SDR</SelectItem>
                <SelectItem value="csv_import">Importação CSV</SelectItem>
                <SelectItem value="webhook">Webhook</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date Range */}
          <div className="space-y-2">
            <Label>Período</Label>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "flex-1 justify-start text-left font-normal",
                      !filters.dateFrom && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filters.dateFrom
                      ? format(filters.dateFrom, "dd/MM/yy", { locale: ptBR })
                      : "De"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filters.dateFrom || undefined}
                    onSelect={(date) =>
                      onFiltersChange({ ...filters, dateFrom: date || null })
                    }
                    locale={ptBR}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "flex-1 justify-start text-left font-normal",
                      !filters.dateTo && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filters.dateTo
                      ? format(filters.dateTo, "dd/MM/yy", { locale: ptBR })
                      : "Até"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filters.dateTo || undefined}
                    onSelect={(date) =>
                      onFiltersChange({ ...filters, dateTo: date || null })
                    }
                    locale={ptBR}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Value Range */}
          <div className="space-y-2">
            <Label>Valor da Oportunidade</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Min"
                value={filters.minValue}
                onChange={(e) =>
                  onFiltersChange({ ...filters, minValue: e.target.value })
                }
              />
              <Input
                type="number"
                placeholder="Max"
                value={filters.maxValue}
                onChange={(e) =>
                  onFiltersChange({ ...filters, maxValue: e.target.value })
                }
              />
            </div>
          </div>

          <Button
            className="w-full"
            onClick={() => setIsOpen(false)}
          >
            Aplicar Filtros
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
