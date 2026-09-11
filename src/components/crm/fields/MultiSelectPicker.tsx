// Sprint 11 · Onda 2 — pick several options; always stores a list.
//
// The old grid edited a multi-select as a text box and saved the typed string
// over the list — the card, the filter and the dashboard (which count per item)
// then saw one strange item. This writes an array, and keeps values that are no
// longer among the options instead of silently dropping them.

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface MultiSelectPickerProps {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  className?: string;
}

export function MultiSelectPicker({ options, value, onChange, className }: MultiSelectPickerProps) {
  const selected = new Set(value);
  const legacy = value.filter((v) => !options.includes(v));
  const all = [...options, ...legacy];

  const toggle = (option: string) => {
    const next = selected.has(option) ? value.filter((v) => v !== option) : [...value, option];
    onChange(next);
  };

  if (all.length === 0) {
    return <p className={cn("px-2 py-3 text-xs text-muted-foreground", className)}>Este campo não tem opções.</p>;
  }

  return (
    <div className={cn("max-h-64 space-y-0.5 overflow-y-auto p-1", className)} role="group">
      {all.map((option) => {
        const id = `ms-${option}`;
        return (
          <label
            key={option}
            htmlFor={id}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
          >
            <Checkbox id={id} checked={selected.has(option)} onCheckedChange={() => toggle(option)} />
            <span className={cn("truncate", legacy.includes(option) && "italic text-muted-foreground")}>{option}</span>
          </label>
        );
      })}
    </div>
  );
}
