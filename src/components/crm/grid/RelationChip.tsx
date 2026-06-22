interface RelationChipProps {
  label: string;
  onRemove?: () => void;
}

export function RelationChip({ label, onRemove }: RelationChipProps): JSX.Element {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground bg-background max-w-[160px]"
      title={label}
    >
      <span className="truncate">{label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="hover:text-foreground transition-colors focus:outline-none"
          title="Remover"
        >
          ×
        </button>
      )}
    </span>
  );
}
