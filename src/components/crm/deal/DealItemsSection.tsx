import { useEffect, useMemo, useState } from "react";
import { Loader2, Package, Plus, Repeat, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCatalog } from "@/hooks/useCatalog";
import { useOpportunityItems } from "@/hooks/useOpportunityItems";
import { priceLabel, recurrenceLabel } from "@/lib/catalog";
import { freeLine, itemsPayload, itemsTotal, lineFromCatalog, lineTotal, type DealLine } from "@/lib/dealItems";
import { parseBrNumber } from "@/lib/fields/registry";
import type { OpportunityItem } from "@/types/revenue";

const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v).replace(/\u00a0/g, " ");

const toLine = (i: OpportunityItem): DealLine => ({
  key: i.id,
  id: i.id,
  catalog_item_id: i.catalog_item_id,
  name: i.name,
  quantity: i.quantity,
  unit_price: i.unit_price,
  price_locked: i.price_locked,
});

const numText = (n: number) => String(n).replace(".", ",");

interface DealItemsSectionProps {
  opportunityId: string;
  open: boolean;
  /** The deal value after each save (the sum of the lines). */
  onValueChange?: (value: number | null) => void;
  /** Tells the modal whether the value is the sum (read-only) or free. */
  onHasItemsChange?: (hasItems: boolean) => void;
}

/**
 * Sprint 11 · Onda 3 · T30 — what the deal is selling. Lines from the catalog
 * (fixed price stays fixed) or free lines; each change saves the whole list at
 * once and the deal value becomes the sum. With no lines the value stays free.
 */
export function DealItemsSection({ opportunityId, open, onValueChange, onHasItemsChange }: DealItemsSectionProps) {
  const { items, isLoading, save } = useOpportunityItems(opportunityId, open);
  const { items: catalog } = useCatalog();
  const [lines, setLines] = useState<DealLine[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const recurrenceById = useMemo(
    () => new Map(items.map((i) => [i.id, recurrenceLabel(i.recurrence_every, i.recurrence_unit)])),
    [items],
  );
  const offerable = catalog.filter((c) => c.active);

  useEffect(() => {
    setLines(items.map(toLine));
    onHasItemsChange?.(items.length > 0);
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = (next: DealLine[]) => {
    setLines(next);
    // A free line waits for its name before it goes to the database.
    if (next.some((l) => !l.id && !l.catalog_item_id && !l.name.trim())) return;
    save.mutate(itemsPayload(next), { onSuccess: ({ value }) => onValueChange?.(value) });
  };

  const update = (key: string, patch: Partial<DealLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const commit = () => persist(lines);

  const total = itemsTotal(lines);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <Package className="h-3.5 w-3.5" />
          Itens
          {save.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
        </h4>
        {lines.length > 0 && <span className="text-sm font-semibold tabular-nums">{money(total)}</span>}
      </div>

      {isLoading ? (
        <p className="py-2 text-xs text-muted-foreground">Carregando…</p>
      ) : lines.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum item — o valor do negócio é livre. Com itens, o valor vira a soma deles.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {lines.map((l) => {
            const recurrence = l.id ? recurrenceById.get(l.id) : null;
            return (
              <li key={l.key} className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 px-2 py-1.5">
                <div className="min-w-[8rem] flex-1">
                  {l.catalog_item_id ? (
                    <span className="block truncate text-sm">{l.name}</span>
                  ) : (
                    <Input
                      value={l.name}
                      onChange={(e) => update(l.key, { name: e.target.value })}
                      onBlur={commit}
                      placeholder="Descrição da linha"
                      className="h-7 text-sm"
                      aria-label="Descrição da linha"
                    />
                  )}
                  {recurrence && (
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Repeat className="h-2.5 w-2.5" />
                      {recurrence}
                    </span>
                  )}
                </div>
                <Input
                  defaultValue={numText(l.quantity)}
                  key={`q-${l.key}-${l.quantity}`}
                  inputMode="decimal"
                  className="h-7 w-14 text-right text-sm tabular-nums"
                  aria-label="Quantidade"
                  onBlur={(e) => {
                    const q = parseBrNumber(e.target.value);
                    if (q && q > 0 && q !== l.quantity) persist(lines.map((x) => (x.key === l.key ? { ...x, quantity: q } : x)));
                  }}
                />
                <span className="text-xs text-muted-foreground">×</span>
                {l.price_locked ? (
                  <span className="w-24 text-right text-sm tabular-nums" title="Preço fixo do catálogo">
                    {money(l.unit_price)}
                  </span>
                ) : (
                  <Input
                    defaultValue={numText(l.unit_price)}
                    key={`p-${l.key}-${l.unit_price}`}
                    inputMode="decimal"
                    className="h-7 w-24 text-right text-sm tabular-nums"
                    aria-label="Preço unitário"
                    onBlur={(e) => {
                      const p = parseBrNumber(e.target.value);
                      if (p !== null && p >= 0 && p !== l.unit_price) persist(lines.map((x) => (x.key === l.key ? { ...x, unit_price: p } : x)));
                    }}
                  />
                )}
                <span className="w-24 text-right text-sm font-medium tabular-nums">{money(lineTotal(l.quantity, l.unit_price))}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => persist(lines.filter((x) => x.key !== l.key))}
                  aria-label={`Remover ${l.name || "linha"}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={save.isPending}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Do catálogo
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar no catálogo…" />
              <CommandList>
                <CommandEmpty>
                  {catalog.length === 0 ? "O catálogo está vazio — cadastre na aba Catálogo." : "Nada com esse nome."}
                </CommandEmpty>
                <CommandGroup>
                  {offerable.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`${c.name} ${c.id}`}
                      onSelect={() => {
                        setPickerOpen(false);
                        persist([...lines, lineFromCatalog(c)]);
                      }}
                    >
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground">{priceLabel(c)}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setLines((ls) => [...ls, freeLine()])}
          disabled={save.isPending}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Linha avulsa
        </Button>
      </div>
    </section>
  );
}
