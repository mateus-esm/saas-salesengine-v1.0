import { useState } from "react";
import { useCustomTables } from "@/hooks/useCustomTables";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table2, Settings2 } from "lucide-react";

export function FeatureActivationGrid() {
  const { tables, isLoading } = useCustomTables();
  const [activated, setActivated] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);

  const toggle = (slug: string) => {
    const next = new Set(activated);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setActivated(next);
    // Auto-save to sessionStorage on each toggle
    sessionStorage.setItem("activated_custom_tables", JSON.stringify([...next]));
  };

  return (
    <div className="relative">
      <button
        onClick={() => {
          // Load from sessionStorage
          const stored = sessionStorage.getItem("activated_custom_tables");
          if (stored) setActivated(new Set(JSON.parse(stored)));
          setOpen(!open);
        }}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <Settings2 className="h-4 w-4" />
        Ativar tabelas
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 rounded-md border bg-popover p-3 shadow-md z-50">
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
        </div>
      )}
    </div>
  );
}
