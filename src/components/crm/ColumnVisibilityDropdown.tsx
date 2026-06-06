import { Columns } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface ColumnVisibilityItem {
  /** Stable column key. */
  id: string;
  /** Human label shown in the dropdown. */
  label: string;
  /** Whether the column is currently visible. */
  visible: boolean;
}

interface ColumnVisibilityDropdownProps {
  columns: ColumnVisibilityItem[];
  onToggle: (id: string, visible: boolean) => void;
  /** Optional trigger label (defaults to "Colunas"). */
  label?: string;
  align?: "start" | "end";
}

/**
 * Sprint 5.3 T10 — shared "Colunas" visibility dropdown.
 *
 * Source-agnostic: callers pass a flat {id,label,visible}[] derived either from
 * a TanStack `table.getAllColumns()` or a hand-rolled visibility map. One UI,
 * every table. Extracted from the original DatabaseView implementation.
 */
export const ColumnVisibilityDropdown = ({
  columns,
  onToggle,
  label = "Colunas",
  align = "end",
}: ColumnVisibilityDropdownProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="sm">
        <Columns className="h-4 w-4 mr-2" />
        {label}
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align={align} className="max-h-[400px] overflow-y-auto">
      <DropdownMenuLabel>Colunas visíveis</DropdownMenuLabel>
      {columns.map((col) => (
        <DropdownMenuCheckboxItem
          key={col.id}
          checked={col.visible}
          onCheckedChange={(value) => onToggle(col.id, !!value)}
        >
          {col.label}
        </DropdownMenuCheckboxItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);
