// src/components/crm/copilot/CopilotTrainingPanel.tsx
//
// Sprint 6.6 — Training section of the Copilot Cockpit.
// Shows 3 information cards explaining how the agent learns.
// No backend data dependency — purely informational.

import { BookOpen, Database, GitBranch } from "lucide-react";

const cards = [
  {
    icon: BookOpen,
    title: "Descrição das Etapas",
    description:
      "Cada etapa do pipeline possui uma descrição que ensina ao Copiloto quando um lead deve ser movido para ela. Edite as descrições nas configurações do pipeline para treinar o agente a sugerir movimentações mais precisas.",
  },
  {
    icon: Database,
    title: "Campos do Contato",
    description:
      "O dicionário de campos do contato define quais informações o Copiloto pode extrair e atualizar automaticamente. Quanto mais completo e descritivo, melhor o agente entende o que cada campo significa.",
  },
  {
    icon: GitBranch,
    title: "Regras do Pipeline",
    description:
      "As regras configuradas no pipeline (como SLA, gatilhos e condições) orientam o comportamento do Copiloto. Revise periodicamente as regras para manter o agente alinhado com seus processos de vendas.",
  },
];

const CopilotTrainingPanel = () => {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">
          Treinamento do Copiloto
        </h2>
        <p className="text-sm text-muted-foreground">
          O Copiloto aprende com a configuração do seu CRM. Aqui estão as
          principais fontes de conhecimento que ele utiliza:
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((card) => (
          <div
            key={card.title}
            className="rounded-lg border border-border bg-card p-4 space-y-3"
          >
            <div className="flex items-center gap-2">
              <card.icon className="h-5 w-5 text-primary shrink-0" />
              <h3 className="font-medium text-sm">{card.title}</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {card.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CopilotTrainingPanel;
