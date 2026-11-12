interface RelationChipProps {
  label: string;
  onRemove?: () => void;
  /** Hover text; the label by default. */
  title?: string;
}

export function RelationChip({ label, onRemove, title }: RelationChipProps): JSX.Element {
  return (
    <span
      className="inline-flex h-6 min-w-0 max-w-[160px] shrink items-center gap-1 rounded-full border border-border bg-muted px-2 text-xs font-medium text-foreground"
      title={title ?? label}
    >
      <span className="truncate">{label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground focus:outline-none"
          title="Remover"
          aria-label={`Remover ${label}`}
        >
          ×
        </button>
      )}
    </span>
  );
}

/**
 * Sprint 15 · T7 — a cell shows the first relation and "+N" for the rest; the
 * names of all of them are in the title.
 */
export function RelationChips({ chips }: { chips: { toId: string; label: string }[] }): JSX.Element | null {
  if (chips.length === 0) return null;
  const [first, ...rest] = chips;
  const all = chips.map((c) => c.label).join(", ");
  return (
    <span className="flex min-w-0 items-center gap-1" title={all}>
      <RelationChip label={first.label} title={all} />
      {rest.length > 0 && (
        <span className="shrink-0 text-xs font-medium text-muted-foreground">+{rest.length}</span>
      )}
    </span>
  );
}
