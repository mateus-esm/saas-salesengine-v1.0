import { Bot, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TrainingEmptyStateProps {
  onAddClick: () => void;
}

export function TrainingEmptyState({ onAddClick }: TrainingEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
          <Bot className="h-10 w-10 text-primary" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-muted border-4 border-background flex items-center justify-center">
          <span className="text-lg">💬</span>
        </div>
      </div>
      
      <h3 className="text-xl font-semibold text-foreground mb-2">
        Nenhum treinamento cadastrado
      </h3>
      <p className="text-muted-foreground text-center max-w-md mb-6">
        Adicione blocos de treinamento para personalizar as respostas do seu agente de vendas e melhorar a qualidade do atendimento.
      </p>
      
      <Button onClick={onAddClick} className="gap-2">
        <Plus className="h-4 w-4" />
        Adicionar Primeiro Treinamento
      </Button>
    </div>
  );
}
