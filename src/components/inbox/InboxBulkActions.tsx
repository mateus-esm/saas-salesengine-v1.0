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
      {/* Sprint 5.5 polish #2 — two-row compact layout. The inbox sidebar
          is only 280–360px wide, so a single row of labeled buttons
          overflowed the column. Top row: status + "Todas" + close.
          Bottom row: icon-only action buttons sharing the width evenly. */}
      <div className="px-3 py-2 bg-primary/10 border-y border-primary/20 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-primary whitespace-nowrap">
            {count} selecionada{count > 1 ? "s" : ""}
          </span>
          {canSelectAll && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[11px]"
              onClick={onSelectAllVisible}
              disabled={isProcessing}
              title={`Selecionar todas as ${visibleIds.length} conversas visíveis`}
            >
              <CheckSquare className="h-3 w-3 mr-1" />
              Todas {visibleIds.length}
            </Button>
          )}
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onClearSelection}
            disabled={isProcessing}
            title="Limpar seleção"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-1 text-[11px] justify-center"
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
            className="h-7 px-1 text-[11px] justify-center"
            onClick={handleArchive}
            disabled={isProcessing}
            title="Arquivar conversas"
          >
            <Archive className="h-3.5 w-3.5 mr-1" />
            Arquivar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-1 text-[11px] justify-center text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setShowDeleteDialog(true)}
            disabled={isProcessing}
            title="Remover conversas"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Excluir
          </Button>
        </div>
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
