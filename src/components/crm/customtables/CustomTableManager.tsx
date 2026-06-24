import { useState } from "react";
import { Plus, Table2, Trash2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCustomTables, type CustomTable } from "@/hooks/useCustomTables";

interface CustomTableManagerProps {
  onSelectTable: (table: CustomTable) => void;
}

export function CustomTableManager({ onSelectTable }: CustomTableManagerProps) {
  const { tables, isLoading, createTable, deleteTable } = useCustomTables();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  // Slug is derived from the name automatically — the founder never types it
  // (point 16: "the slug is the name adapted for it").
  const derivedSlug = newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createTable.mutateAsync({
      name: newName.trim(),
      slug: derivedSlug,
    });
    setShowCreate(false);
    setNewName("");
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tabelas Personalizadas</h2>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="mr-1 h-4 w-4" /> Nova tabela
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <Input
              placeholder="Nome da tabela"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            {derivedSlug && (
              <p className="text-[10px] text-muted-foreground -mt-1">
                Identificador: <span className="font-mono">{derivedSlug}</span>
              </p>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={!newName}
              >
                Criar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowCreate(false)}
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      ) : tables.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nenhuma tabela personalizada ainda.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tables.map((table) => (
            <Card
              key={table.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => onSelectTable(table)}
            >
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Table2 className="h-4 w-4 text-muted-foreground" />
                  {table.name}
                </CardTitle>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Remover tabela "${table.name}"?`)) {
                        deleteTable.mutate(table.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {table.description || `slug: ${table.slug}`} ·{" "}
                {table.table_schema.length} colunas
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
