import { useState, useEffect, useCallback } from "react";
import { Plus, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TrainingBlockCard } from "./TrainingBlockCard";
import { TrainingEmptyState } from "./TrainingEmptyState";
import { AddTrainingModal } from "./AddTrainingModal";
import { AgentTraining as AgentTrainingType } from "@/types/agent";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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

export function AgentTraining() {
  const [trainings, setTrainings] = useState<AgentTrainingType[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const fetchTrainings = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('manage-agent-training', {
        method: 'GET',
      });

      if (error) throw error;

      // API returns array of { id, type, text, image }
      const mapped: AgentTrainingType[] = (Array.isArray(data) ? data : []).map((item: any) => ({
        id: item.id,
        type: item.type || 'TEXT',
        text: item.text || '',
        image: item.image || undefined,
        createdAt: item.createdAt || undefined,
      }));

      setTrainings(mapped);
    } catch (err) {
      console.error('Error fetching trainings:', err);
      toast.error("Erro ao carregar treinamentos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrainings();
  }, [fetchTrainings]);

  const filteredTrainings = trainings.filter(t => 
    t.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAdd = async (newTraining: Omit<AgentTrainingType, 'id' | 'createdAt'>) => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-agent-training?action=create', {
        body: {
          type: newTraining.type,
          text: newTraining.text,
          image: newTraining.image,
        },
      });

      if (error) throw error;

      toast.success("Treinamento adicionado com sucesso!");
      // Refresh list from API
      await fetchTrainings();
    } catch (err) {
      console.error('Error adding training:', err);
      toast.error("Erro ao adicionar treinamento");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      setDeleting(true);
      const { data, error } = await supabase.functions.invoke('manage-agent-training?action=delete', {
        body: { trainingId: deleteId },
      });

      if (error) throw error;

      toast.success("Treinamento removido com sucesso!");
      setTrainings(prev => prev.filter(t => t.id !== deleteId));
      setDeleteId(null);
    } catch (err) {
      console.error('Error deleting training:', err);
      toast.error("Erro ao remover treinamento");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
            {trainings.length} {trainings.length === 1 ? 'bloco' : 'blocos'} de treinamento
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar treinamentos..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button onClick={() => setIsModalOpen(true)} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Adicionar</span>
          </Button>
        </div>
      </div>

      {/* Content */}
      {trainings.length === 0 ? (
        <TrainingEmptyState onAddClick={() => setIsModalOpen(true)} />
      ) : filteredTrainings.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Nenhum treinamento encontrado para "{searchQuery}"</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTrainings.map((training) => (
            <TrainingBlockCard
              key={training.id}
              training={training}
              onDelete={(id) => setDeleteId(id)}
            />
          ))}
        </div>
      )}

      {/* Add Modal */}
      <AddTrainingModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onAdd={handleAdd}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover treinamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O bloco de treinamento será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              className="bg-destructive hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
