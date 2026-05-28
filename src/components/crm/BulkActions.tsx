import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { Lead } from "@/types/crm";
import { useLeads } from "@/hooks/useLeads";
import { X, Trash2, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { AssignToPipelineDialog } from "./AssignToPipelineDialog";

interface BulkActionsProps {
  selectedLeads: Lead[];
  onClearSelection: () => void;
}

export const BulkActions = ({
  selectedLeads,
  onClearSelection,
}: BulkActionsProps) => {
  const { deleteLead } = useLeads();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleBulkDelete = async () => {
    setIsProcessing(true);
    try {
      for (const lead of selectedLeads) {
        await deleteLead.mutateAsync(lead.id);
      }
      toast.success(`${selectedLeads.length} leads removidos com sucesso!`);
      onClearSelection();
    } catch (error) {
      toast.error("Erro ao remover leads");
    } finally {
      setIsProcessing(false);
      setShowDeleteDialog(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-lg border border-primary/20">
        <span className="text-sm font-medium text-primary">
          {selectedLeads.length} selecionado{selectedLeads.length > 1 ? "s" : ""}
        </span>

        <div className="h-4 w-px bg-border" />

        {/* Add to Pipeline */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAssignDialog(true)}
          disabled={isProcessing}
        >
          <Briefcase className="h-4 w-4 mr-2" />
          Adicionar a Pipeline
        </Button>

        {/* Delete */}
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setShowDeleteDialog(true)}
          disabled={isProcessing}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Excluir
        </Button>

        <div className="flex-1" />

        {/* Clear Selection */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          disabled={isProcessing}
        >
          <X className="h-4 w-4 mr-2" />
          Limpar seleção
        </Button>
      </div>

      {/* Assign to Pipeline Dialog (Sprint 4 EPIC 4) */}
      <AssignToPipelineDialog
        open={showAssignDialog}
        onClose={() => {
          setShowAssignDialog(false);
          onClearSelection();
        }}
        contactIds={selectedLeads.map((l) => l.id)}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {selectedLeads.length} lead
              {selectedLeads.length > 1 ? "s" : ""}? Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isProcessing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isProcessing ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};