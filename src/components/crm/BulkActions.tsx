import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Lead, PipelineStage, TeamMember } from "@/types/crm";
import { useLeads } from "@/hooks/useLeads";
import { X, Trash2, MoveRight, UserPlus } from "lucide-react";
import { toast } from "sonner";

interface BulkActionsProps {
  selectedLeads: Lead[];
  stages: PipelineStage[];
  members: TeamMember[];
  onClearSelection: () => void;
}

export const BulkActions = ({
  selectedLeads,
  stages,
  members,
  onClearSelection,
}: BulkActionsProps) => {
  const { updateLead, deleteLead } = useLeads();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleBulkMoveStage = async (stageId: string) => {
    if (!stageId) return;
    
    setIsProcessing(true);
    try {
      for (const lead of selectedLeads) {
        await updateLead.mutateAsync({ id: lead.id, stage_id: stageId });
      }
      toast.success(`${selectedLeads.length} leads movidos com sucesso!`);
      onClearSelection();
    } catch (error) {
      toast.error("Erro ao mover leads");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkAssign = async (responsibleId: string) => {
    if (!responsibleId) return;
    
    setIsProcessing(true);
    try {
      for (const lead of selectedLeads) {
        await updateLead.mutateAsync({ id: lead.id, responsible_id: responsibleId });
      }
      toast.success(`${selectedLeads.length} leads atribuídos com sucesso!`);
      onClearSelection();
    } catch (error) {
      toast.error("Erro ao atribuir leads");
    } finally {
      setIsProcessing(false);
    }
  };

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

        {/* Move to Stage */}
        <Select onValueChange={handleBulkMoveStage} disabled={isProcessing}>
          <SelectTrigger className="w-[160px] h-8">
            <MoveRight className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Mover para..." />
          </SelectTrigger>
          <SelectContent>
            {stages.map((stage) => (
              <SelectItem key={stage.id} value={stage.id}>
                {stage.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Assign Responsible */}
        <Select onValueChange={handleBulkAssign} disabled={isProcessing}>
          <SelectTrigger className="w-[160px] h-8">
            <UserPlus className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Atribuir..." />
          </SelectTrigger>
          <SelectContent>
            {members.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.nome_completo || member.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
