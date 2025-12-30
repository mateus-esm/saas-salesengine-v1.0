import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TrainingBlockCard } from "./TrainingBlockCard";
import { TrainingEmptyState } from "./TrainingEmptyState";
import { AddTrainingModal } from "./AddTrainingModal";
import { AgentTraining as AgentTrainingType } from "@/types/agent";
import { toast } from "sonner";
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

// Mock data for demonstration
const initialTrainings: AgentTrainingType[] = [
  {
    id: "1",
    type: "TEXT",
    text: "Nossos horários de atendimento são de segunda a sexta, das 8h às 18h. Aos sábados, atendemos das 9h às 13h. Domingos e feriados não há expediente.",
    createdAt: "2024-12-15T10:30:00Z",
  },
  {
    id: "2",
    type: "WEBSITE",
    text: "https://soloventures.com.br/produtos",
    createdAt: "2024-12-14T15:45:00Z",
  },
  {
    id: "3",
    type: "TEXT",
    text: "Aceitamos as seguintes formas de pagamento: cartão de crédito em até 12x sem juros, boleto bancário com 5% de desconto, e PIX com 10% de desconto.",
    createdAt: "2024-12-10T09:00:00Z",
  },
  {
    id: "4",
    type: "VIDEO",
    text: "https://youtube.com/watch?v=exemplo123",
    createdAt: "2024-12-08T14:20:00Z",
  },
];

export function AgentTraining() {
  const [trainings, setTrainings] = useState<AgentTrainingType[]>(initialTrainings);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filteredTrainings = trainings.filter(t => 
    t.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAdd = (newTraining: Omit<AgentTrainingType, 'id' | 'createdAt'>) => {
    const training: AgentTrainingType = {
      ...newTraining,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    setTrainings(prev => [training, ...prev]);
    toast.success("Treinamento adicionado com sucesso!");
  };

  const handleDelete = () => {
    if (!deleteId) return;
    setTrainings(prev => prev.filter(t => t.id !== deleteId));
    toast.success("Treinamento removido com sucesso!");
    setDeleteId(null);
  };

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
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
