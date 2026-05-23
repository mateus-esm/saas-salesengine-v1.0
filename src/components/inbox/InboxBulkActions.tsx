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
import { Archive, Trash2, MailCheck, X, CheckSquare } from "lucide-react";

interface InboxBulkActionsProps {
  selectedIds: string[];
  /** IDs currently visible after sidebar filters (status tab, channel, etc). */
  visibleIds: string[];
  onClearSelection: () => void;
  onSelectAllVisible: () => void;
}

export function InboxBulkActions({
  selectedIds,
  visibleIds,
  onClearSelection,
  onSelectAllVisible,
}: InboxBulkActionsProps) {
  // Sprint 5.5 1.2 — single-round-trip bulk mutations with optimistic cache
  // removal. Previously this looped per-id (N HTTP calls); now one PATCH
  // covers the whole selection and the rows vanish from the viewport
  // before the request even completes.
  const { bulkUpdateStatus, bulkMarkRead } = useConversations();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const count = selectedIds.length;
  const canSelectAll = visibleIds.length > count;

  const handleArchive = async () => {
    setIsProcessing(true);
    try {
      await bulkUpdateStatus.mutateAsync({ ids: selectedIds, status: "archived" });
      onClearSelection();
    } catch {
      // toast already raised by mutation onError
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMarkRead = async () => {
    setIsProcessing(true);
    try {
      await bulkMarkRead.mutateAsync({ ids: selectedIds });
      onClearSelection();
    } catch {
      // toast already raised by mutation onError
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    setIsProcessing(true);
    try {
      await bulkUpdateStatus.mutateAsync({ ids: selectedIds, status: "deleted" });
      onClearSelection();
    } catch {
      // toast already raised by mutation onError
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
        {canSelectAll && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onSelectAllVisible}
            disabled={isProcessing}
            title="Selecionar todas as conversas visíveis"
          >
            <CheckSquare className="h-3.5 w-3.5 mr-1" />
            Todas ({visibleIds.length})
          </Button>
        )}
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
