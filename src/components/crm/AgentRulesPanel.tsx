import { Bot, Sparkles, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";

interface AgentRulesPanelProps {
  pipelineId: string;
  pipelineName?: string;
}

/**
 * Sprint 4 EPIC 2 — placeholder shell for the per-pipeline Agente CRM rules
 * editor. Epic 5 fills in the structured trigger→action builder and the
 * extraction-hints textarea backed by `pipeline_agent_rules`.
 *
 * The tab exists this sprint so the URL contract (`?view=agent`) and tabbed
 * navigation are stable before Epic 5 lands the real UI.
 */
export const AgentRulesPanel = ({ pipelineName }: AgentRulesPanelProps) => {
  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="max-w-xl w-full space-y-6 text-center">
        <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Bot className="h-7 w-7 text-primary" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">Agente CRM</h2>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              Em breve
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Configurações inteligentes da pipeline
            {pipelineName ? ` ${pipelineName}` : ""}.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 text-left">
          <div className="rounded-md border border-border bg-card p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Wrench className="h-4 w-4 text-primary" />
              Gatilhos estruturados
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Regras tipadas (intent_detected, message_contains, stage_entered…)
              com ações auditáveis: mover etapa, definir campo, criar tarefa.
            </p>
          </div>
          <div className="rounded-md border border-border bg-card p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" />
              Hints de extração
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Texto livre que orienta a IA a extrair campos personalizados
              específicos desta pipeline.
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground/80">
          Esta aba será habilitada em Sprint 4 · EPIC 5.
        </p>
      </div>
    </div>
  );
};
