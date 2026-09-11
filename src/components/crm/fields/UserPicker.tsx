// Sprint 11 · Onda 2 — choose a team member (deal owner, "Usuário" fields).
//
// A searchable list with avatars. "Sem responsável" is an explicit choice, not
// the absence of one. The members come from useMemberDirectory (one cached
// request for the whole app).

import { useState, type ReactNode } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMemberDirectory } from "@/hooks/useMemberDirectory";
import { cn } from "@/lib/utils";

import { UserAvatar } from "./UserAvatar";

interface UserPickerProps {
  /** Lets a form <Label htmlFor> point at the trigger. */
  id?: string;
  /** Accessible name of the trigger when there is no visible label. */
  ariaLabel?: string;
  value: string | null;
  onChange: (userId: string | null) => void;
  allowNone?: boolean;
  noneLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Controlled open state (the grid opens it as soon as the cell is edited). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Replaces the default trigger button. */
  trigger?: ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
}

export function UserPicker({
  id,
  ariaLabel,
  value,
  onChange,
  allowNone = true,
  noneLabel = "Sem responsável",
  placeholder = "Escolher…",
  disabled,
  open: openProp,
  onOpenChange,
  trigger,
  className,
  align = "start",
}: UserPickerProps) {
  const { members, nameOf } = useMemberDirectory();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenState(next);
    onOpenChange?.(next);
  };

  const currentName = value ? nameOf(value) ?? "Usuário removido" : null;

  // The choice goes out before the popover closes: a caller that treats "closed"
  // as "cancelled" (the grid's inline editor) must see the choice first.
  const pick = (id: string | null) => {
    if (id !== value) onChange(id);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        {trigger ?? (
          <Button
            id={id}
            type="button"
            variant="outline"
            size="sm"
            aria-label={ariaLabel ? `${ariaLabel}: ${currentName ?? (allowNone ? noneLabel : placeholder)}` : undefined}
            className={cn("h-9 w-full justify-between gap-2 font-normal", className)}
            disabled={disabled}
          >
            <span className="flex min-w-0 items-center gap-2">
              <UserAvatar userId={value} name={currentName} size="xs" />
              <span className={cn("truncate", !value && "text-muted-foreground")}>
                {currentName ?? (allowNone ? noneLabel : placeholder)}
              </span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align={align}>
        <Command>
          <CommandInput placeholder="Buscar membro…" />
          <CommandList>
            <CommandEmpty>Ninguém com esse nome.</CommandEmpty>
            <CommandGroup>
              {allowNone && (
                <CommandItem value={`__none__ ${noneLabel}`} onSelect={() => pick(null)}>
                  <UserAvatar userId={null} name={null} size="xs" />
                  <span className="ml-2 flex-1 text-muted-foreground">{noneLabel}</span>
                  {!value && <Check className="h-4 w-4" />}
                </CommandItem>
              )}
              {members.map((m) => (
                <CommandItem key={m.id} value={`${m.name} ${m.email} ${m.id}`} onSelect={() => pick(m.id)}>
                  <UserAvatar userId={m.id} name={m.name} size="xs" />
                  <span className="ml-2 flex-1 truncate">{m.name}</span>
                  {value === m.id && <Check className="h-4 w-4" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
