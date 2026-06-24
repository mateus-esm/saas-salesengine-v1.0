import { Search } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FilterItem {
  key: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

export interface GridToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters: FilterItem[];
  onClearFilters: () => void;
  activeFilterCount: number;
  children?: ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GridToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Buscar...",
  filters,
  onClearFilters,
  activeFilterCount,
  children,
}: GridToolbarProps) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8 max-w-xs h-9"
        />
      </div>

      {/* Filter dropdowns */}
      {filters.map((f) => (
        <Select key={f.key} value={f.value} onValueChange={f.onChange}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder={f.label} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {f.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {/* Clear filters */}
      {activeFilterCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          className="h-9 text-xs"
        >
          Limpar filtros ({activeFilterCount})
        </Button>
      )}

      {/* Extra actions */}
      {children}
    </div>
  );
}
