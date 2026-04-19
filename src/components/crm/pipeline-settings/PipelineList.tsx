import { Archive, ArchiveRestore, ChevronRight, Database, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Pipeline } from "@/types/pipelines";

interface PipelineListProps {
  pipelines: Pipeline[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onArchive: (id: string, archived: boolean) => void;
  onDelete: (id: string) => void;
}

export const PipelineList = ({
  pipelines,
  selectedId,
  onSelect,
  onArchive,
  onDelete,
}: PipelineListProps) => {
  if (pipelines.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-8 text-center">
        <Database className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Nenhuma pipeline aqui ainda.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {pipelines.map((p) => {
        const fieldCount = p.custom_fields_schema.filter((f) => !f.is_deleted).length;
        const isSelected = p.id === selectedId;
        return (
          <Card
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={`cursor-pointer transition-colors p-4 ${
              isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/40"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium truncate">{p.name}</h3>
                  {p.is_archived && (
                    <Badge variant="outline" className="text-xs">Arquivada</Badge>
                  )}
                </div>
                {p.description && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {p.description}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {fieldCount} {fieldCount === 1 ? "campo personalizado" : "campos personalizados"}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    onArchive(p.id, !p.is_archived);
                  }}
                  title={p.is_archived ? "Restaurar" : "Arquivar"}
                >
                  {p.is_archived ? (
                    <ArchiveRestore className="h-4 w-4" />
                  ) : (
                    <Archive className="h-4 w-4" />
                  )}
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={(e) => e.stopPropagation()}
                      title="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir pipeline “{p.name}”?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Oportunidades associadas continuarão existindo, mas a pipeline
                        ficará indisponível. Considere arquivar antes de excluir.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onDelete(p.id)}>
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
};
