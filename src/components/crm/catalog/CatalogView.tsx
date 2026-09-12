import { useMemo, useState } from "react";
import { Loader2, Package, Plus, Repeat, Search, Wrench } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useCatalog } from "@/hooks/useCatalog";
import { priceLabel, recurrenceLabel } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import type { CatalogItem } from "@/types/revenue";

import { CatalogItemDialog } from "./CatalogItemDialog";

/**
 * Sprint 11 · Onda 3 · T29 — the catalog: what the team sells. A deal can list
 * catalog items (T30), a win books revenue per item (T31), and a recurring item
 * opens the next cycle's deal on its own (T34).
 */
export function CatalogView() {
  const { items, isLoading, save, archive } = useCatalog();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState<CatalogItem | null>(null);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
  }, [items, search]);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Catálogo</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Produtos e serviços que suas linhas vendem — com preço e, quando volta, a recorrência.
            </p>
          </div>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Novo item
          </Button>
        </div>
        {items.length > 0 && (
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar no catálogo"
              className="h-9 pl-8"
              aria-label="Buscar no catálogo"
            />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex justify-center py-12 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="mx-auto max-w-md py-12 text-center">
            <Package className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-3 text-base font-semibold">Nenhum item ainda</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cadastre o que você vende: preço fixo ou negociável, e a recorrência quando o serviço volta
              (uma limpeza a cada 6 meses abre sozinha o negócio do retorno).
            </p>
            <Button className="mt-4" size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Cadastrar o primeiro
            </Button>
          </div>
        ) : shown.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Nada com esse nome.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
            {shown.map((item) => {
              const recurrence = recurrenceLabel(item.recurrence_every, item.recurrence_unit);
              return (
                <li key={item.id} className={cn("flex items-center gap-3 px-3 py-2.5", !item.active && "opacity-60")}>
                  <button
                    type="button"
                    onClick={() => setEditing(item)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    {item.kind === "service" ? (
                      <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <Package className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{item.name}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span>{priceLabel(item)}</span>
                        {recurrence && (
                          <span className="inline-flex items-center gap-1">
                            <Repeat className="h-3 w-3" />
                            {recurrence}
                          </span>
                        )}
                        {!item.active && <Badge variant="outline" className="h-4 px-1 text-[10px]">Pausado</Badge>}
                      </span>
                    </span>
                  </button>
                  <Switch
                    checked={item.active}
                    onCheckedChange={(on) => save.mutate({ id: item.id, active: on })}
                    aria-label={item.active ? `Pausar ${item.name}` : `Ativar ${item.name}`}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => setConfirmArchive(item)}
                  >
                    Arquivar
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <CatalogItemDialog
        open={creating || !!editing}
        item={editing}
        saving={save.isPending}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSave={(draft) => save.mutateAsync(draft)}
      />

      <AlertDialog open={!!confirmArchive} onOpenChange={(o) => !o && setConfirmArchive(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar "{confirmArchive?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Sai do catálogo e não aparece para novos negócios. Os negócios que já o venderam continuam com ele.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmArchive) archive.mutate([confirmArchive.id]);
                setConfirmArchive(null);
              }}
            >
              Arquivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
