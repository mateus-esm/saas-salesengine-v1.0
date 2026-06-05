import { useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOriginTaxonomy } from "@/hooks/useOriginTaxonomy";
import type { OriginTag, TaxonomyKind } from "@/types/taxonomy";

const DEFAULT_COLOR = "#64748b";

/**
 * Sprint 5.2 T8 — Origem/Canal taxonomy editor.
 * Lets the workspace add/edit/recolor/delete custom tags that become selectable
 * on contact cards. Backed by useOriginTaxonomy (T2).
 */
function TagRow({
  tag,
  onUpdate,
  onDelete,
}: {
  tag: OriginTag;
  onUpdate: (patch: { label?: string; color?: string }) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(tag.label);

  const commitLabel = () => {
    const trimmed = label.trim();
    if (trimmed && trimmed !== tag.label) onUpdate({ label: trimmed });
    else setLabel(tag.label);
  };

  return (
    <div className="flex items-center gap-2 group">
      <input
        type="color"
        value={tag.color}
        onChange={(e) => onUpdate({ color: e.target.value })}
        className="h-7 w-7 shrink-0 rounded border border-border cursor-pointer bg-transparent"
        aria-label="Cor da tag"
      />
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={commitLabel}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="h-8 flex-1 text-sm"
      />
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={onDelete}
        aria-label="Remover tag"
      >
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      </Button>
    </div>
  );
}

function TaxonomyColumn({ kind, title }: { kind: TaxonomyKind; title: string }) {
  const { tags, isLoading, createTag, updateTag, deleteTag } = useOriginTaxonomy(kind);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label) return;
    createTag.mutate(
      { kind, label, color: newColor },
      {
        onSuccess: () => {
          setNewLabel("");
          setNewColor(DEFAULT_COLOR);
        },
      },
    );
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>

      <div className="space-y-2">
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : tags.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma tag ainda.</p>
        ) : (
          tags.map((tag) => (
            <TagRow
              key={tag.id}
              tag={tag}
              onUpdate={(patch) => updateTag.mutate({ id: tag.id, ...patch })}
              onDelete={() => deleteTag.mutate(tag.id)}
            />
          ))
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="color"
          value={newColor}
          onChange={(e) => setNewColor(e.target.value)}
          className="h-9 w-9 shrink-0 rounded border border-border cursor-pointer bg-transparent"
          aria-label={`Cor da nova tag de ${title.toLowerCase()}`}
        />
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder={`Nova tag de ${title.toLowerCase()}`}
          className="h-9 flex-1"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button size="sm" onClick={handleAdd} disabled={!newLabel.trim() || createTag.isPending}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function OriginTaxonomyEditor() {
  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Taxonomia de Origem &amp; Canal</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Tags personalizadas (ex.: campanha de influencer no Instagram), selecionáveis nos cards de contato.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <TaxonomyColumn kind="origem" title="Origem" />
        <TaxonomyColumn kind="canal" title="Canal" />
      </div>
    </section>
  );
}

export default OriginTaxonomyEditor;
