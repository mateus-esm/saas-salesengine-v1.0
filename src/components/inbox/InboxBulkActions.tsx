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
import { useConversations } from "@/hooks/useConversations";
import { Archive, Trash2, MailCheck, X } from "lucide-react";
import { toast } from "sonner";

interface InboxBulkActionsProps {
  selectedIds: string[];
  onClearSelection: () => void;
}

export function InboxBulkActions({
  selectedIds,
  onClearSelection,
}: InboxBulkActionsProps) {
  const { updateStatus, markRead } = useConversations();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const count = selectedIds.length;

  const handleArchive = async () => {
    setIsProcessing(true);
    try {
      for (const id of selectedIds) {
        await updateStatus.mutateAsync({ id, status: "archived" });
      }
      toast.success(`${count} conversa${count > 1 ? "s" : ""} arquivada${count > 1 ? "s" : ""}`);
      onClearSelection();
    } catch {
      toast.error("Erro ao arquivar conversas");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMarkRead = async () => {
    setIsProcessing(true);
    try {
      for (const id of selectedIds) {
        await markRead.mutateAsync({ id });
      }
      toast.success(`${count} conversa${count > 1 ? "s" : ""} marcada${count > 1 ? "s" : ""} como lida${count > 1 ? "s" : ""}`);
      onClearSelection();
    } catch {
      toast.error("Erro ao marcar como lida");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    setIsProcessing(true);
    try {
      for (const id of selectedIds) {
        await updateStatus.mutateAsync({ id, status: "deleted" });
      }
      toast.success(`${count} conversa${count > 1 ? "s" : ""} removida${count > 1 ? "s" : ""}`);
      onClearSelection();
    } catch {
      toast.error("Erro ao remover conversas");
    } finally {
      setIsProcessing(false);
      setShowDeleteDialog(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border-y border-primary/20">
        <span className="text-xs font-medium text-primary whitespace-nowrap">
          {count} selecionada{count > 1 ? "s" : ""}
        </span>
        <div className="h-3 w-px bg-border" />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={handleMarkRead}
          disabled={isProcessing}
          title="Marcar como lida"
        >
          <MailCheck className="h-3.5 w-3.5 mr-1" />
          Ler
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={handleArchive}
          disabled={isProcessing}
          title="Arquivar"
        >
          <Archive className="h-3.5 w-3.5 mr-1" />
          Arquivar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
          onClick={() => setShowDeleteDialog(true)}
          disabled={isProcessing}
          title="Remover"
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          Remover
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onClearSelection}
          disabled={isProcessing}
          title="Limpar seleção"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover conversas?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover {count} conversa
              {count > 1 ? "s" : ""}? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isProcessing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isProcessing ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
