import { usePipelines } from "@/hooks/usePipelines";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { RevenueGoalsForm } from "@/components/crm/revenue/RevenueGoalsForm";

const PIPELINE_BOXES = [
  {
    id: "revenue",
    label: "Receita & Metas",
    render: (pid: string) => <RevenueGoalsForm pipelineId={pid} />,
  },
  {
    id: "prompt",
    label: "Prompt & Base de Conhecimento",
    render: () => (
      <p className="text-xs text-muted-foreground p-2">
        Configuração do agente vendas (em breve)
      </p>
    ),
  },
  {
    id: "automations",
    label: "Automações Locais",
    render: () => (
      <p className="text-xs text-muted-foreground p-2">
        Regras de automação (em breve)
      </p>
    ),
  },
  {
    id: "logs",
    label: "Logs Locais",
    render: () => (
      <p className="text-xs text-muted-foreground p-2">
        Histórico de eventos (em breve)
      </p>
    ),
  },
];

export function PipelineCockpitAccordion() {
  const { pipelines, isLoading } = usePipelines();

  if (isLoading)
    return (
      <p className="text-xs text-muted-foreground p-4">Carregando...</p>
    );
  if (!pipelines?.length)
    return (
      <p className="text-xs text-muted-foreground p-4">
        Nenhuma pipeline encontrada.
      </p>
    );

  return (
    <Accordion type="single" collapsible className="w-full">
      {pipelines.map((p) => (
        <AccordionItem key={p.id} value={p.id}>
          <AccordionTrigger className="text-sm font-medium">
            {p.name}
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-2">
              {PIPELINE_BOXES.map((box) => (
                <div
                  key={box.id}
                  className="rounded-md border border-border/50 p-3"
                >
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                    {box.label}
                  </h4>
                  {box.render(p.id)}
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
