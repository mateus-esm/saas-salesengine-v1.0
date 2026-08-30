/**
 * Sprint 9 — "personalize, put more or less data to show".
 *
 * A list with switches and up/down buttons, not drag-and-drop. Drag ordering is
 * the nicer demo and the worse control: it is fiddly on a phone, invisible to
 * a keyboard, and needs a library. Buttons move one row per press, work
 * everywhere, and are obvious without a hint.
 *
 * Changes are staged locally and applied on "Salvar", so a client can try
 * turning six things off and change their mind without the page reflowing under
 * them on every click.
 */
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, RotateCcw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { WIDGET_BY_ID, type WidgetSetting } from "@/config/widgetCatalog";
import { useDashboardLayout } from "@/hooks/useDashboardLayout";
import { useRole } from "@/hooks/useRole";
import { cn } from "@/lib/utils";

export function CustomizeDashboardSheet() {
  const { layout, isPersonal, save, isSaving, reset, isResetting } = useDashboardLayout();
  const { isAdmin } = useRole();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<WidgetSetting[]>(layout);

  // Re-seed the draft whenever the sheet opens, so an abandoned edit from last
  // time does not reappear as if it had been saved.
  useEffect(() => {
    if (open) setDraft(layout);
  }, [open, layout]);

  const move = (index: number, delta: number) => {
    const next = [...draft];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setDraft(next);
  };

  const toggle = (id: string) =>
    setDraft((d) => d.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)));

  const visibleCount = draft.filter((w) => w.visible).length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <Settings2 className="h-3.5 w-3.5" />
          Personalizar
        </Button>
      </SheetTrigger>

      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-base">Personalizar dashboard</SheetTitle>
          <SheetDescription className="text-xs">
            Escolha o que aparece e em que ordem. {visibleCount} de {draft.length} cartões
            ativos.
          </SheetDescription>
        </SheetHeader>

        <div className="-mx-6 flex-1 overflow-y-auto px-6 py-3">
          <ul className="space-y-1">
            {draft.map((w, i) => {
              const def = WIDGET_BY_ID.get(w.id);
              if (!def) return null;
              return (
                <li
                  key={w.id}
                  className={cn(
                    "flex items-center gap-3 rounded-md border border-transparent px-2 py-2 transition-colors",
                    w.visible ? "bg-muted/40" : "opacity-55",
                  )}
                >
                  <div className="flex flex-col gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                      aria-label={`Mover ${def.label} para cima`}
                    >
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      disabled={i === draft.length - 1}
                      onClick={() => move(i, 1)}
                      aria-label={`Mover ${def.label} para baixo`}
                    >
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-medium text-foreground">
                        {def.label}
                      </span>
                      <span className="shrink-0 rounded bg-muted px-1 text-[9px] font-mono uppercase tracking-wide text-muted-foreground">
                        {def.group}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {def.description}
                    </p>
                  </div>

                  <Switch
                    checked={w.visible}
                    onCheckedChange={() => toggle(w.id)}
                    aria-label={`Mostrar ${def.label}`}
                  />
                </li>
              );
            })}
          </ul>
        </div>

        <Separator />

        <SheetFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button
            className="w-full text-xs"
            disabled={isSaving}
            onClick={() => {
              save({ layout: draft, asTeam: false });
              setOpen(false);
            }}
          >
            Salvar para mim
          </Button>

          {/* Only an admin can rewrite what the whole team sees on login — the
              RPC refuses it anyway, so hiding the button just avoids offering
              an action that would fail. */}
          {isAdmin() && (
            <Button
              variant="outline"
              className="w-full text-xs"
              disabled={isSaving}
              onClick={() => {
                save({ layout: draft, asTeam: true });
                setOpen(false);
              }}
            >
              Definir como padrão da equipe
            </Button>
          )}

          {isPersonal && (
            <Button
              variant="ghost"
              className="w-full gap-1.5 text-xs text-muted-foreground"
              disabled={isResetting}
              onClick={() => {
                reset();
                setOpen(false);
              }}
            >
              <RotateCcw className="h-3 w-3" />
              Voltar ao padrão da equipe
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
