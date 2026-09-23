import { useState } from "react";
import { useCustomTables } from "@/hooks/useCustomTables";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table2, Settings2 } from "lucide-react";

export function FeatureActivationGrid() {
  const { tables, isLoading } = useCustomTables();
  const [activated, setActivated] = useState<Set<string>>(new Set());

  const toggle = (slug: string) => {
    const next = new Set(activated);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setActivated(next);
    // Auto-save to sessionStorage on each toggle
    sessionStorage.setItem("activated_custom_tables", JSON.stringify([...next]));
  };

  // Load from sessionStorage when the panel opens.
  const handleOpenChange = (next: boolean) => {
    if (!next) return;
    const stored = sessionStorage.getItem("activated_custom_tables");
    if (stored) setActivated(new Set(JSON.parse(stored)));
  };

  return (
    // SE-CRM-001 — o painel virou um Popover porque a topbar do CRM agora é um
    // scroller horizontal: `overflow-x-auto` faz `overflow-y` computar para
    // `auto`, e um painel `absolute` dentro dela ficaria recortado. O Radix
    // porta o conteúdo para o `body`, então ele escapa do recorte e ainda ganha
    // posicionamento com detecção de colisão. `align="end"` = o antigo `right-0`.
    <Popover onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <Settings2 className="h-4 w-4" />
          Ativar tabelas
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 p-3">
        <h3 className="text-sm font-medium mb-2">Tabelas Personalizadas</h3>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Carregando...</p>
        ) : tables.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma tabela disponível.</p>
        ) : (
          <div className="space-y-2">
            {tables.map((t) => (
              <div key={t.id} className="flex items-center justify-between">
                <Label htmlFor={`act-${t.slug}`} className="text-xs flex items-center gap-2 cursor-pointer">
                  <Table2 className="h-3 w-3 text-muted-foreground" />
                  {t.name}
                </Label>
                <Switch
                  id={`act-${t.slug}`}
                  checked={activated.has(t.slug)}
                  onCheckedChange={() => toggle(t.slug)}
                />
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
