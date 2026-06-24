import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useCopilotAgents } from "@/hooks/useCopilotAgents";
import { toast } from "sonner";
import { Bot, Info, Loader2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function AIAgentToggle() {
  const { equipe, profile } = useAuth();
  const { isLoading: agentsLoading, bulkSetAutonomy } = useCopilotAgents();
  const [isEnabled, setIsEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  // Initialize state from context
  useEffect(() => {
    if (equipe) {
      setIsEnabled(equipe.is_crm_agent_enabled || false);
    }
  }, [equipe]);

  const handleToggle = async (checked: boolean) => {
    if (!equipe) return;

    // Optimistic update
    setIsEnabled(checked);
    setLoading(true);

    try {
      const { error } = await supabase
        .from("equipes")
        .update({ is_crm_agent_enabled: checked } as any)
        .eq("id", equipe.id);

      if (error) throw error;

      // Sync agent autonomy modes
      if (checked) {
        // Toggle ON → all agents to autonomous (Autopilot)
        await bulkSetAutonomy.mutateAsync("autonomous");
      } else {
        // Toggle OFF → all agents to suggest (Copilot)
        await bulkSetAutonomy.mutateAsync("suggest");
      }

      toast.success(
        checked
          ? "Copilot ativado com sucesso."
          : "Copilot desativado.",
      );
    } catch (error) {
      console.error("Erro ao atualizar Copilot:", error);
      toast.error("Erro ao atualizar status do Copilot.");
      // Revert on error
      setIsEnabled(!checked);
    } finally {
      setLoading(false);
    }
  };

  // Only show for admins or owners? Assuming safe to show if user has access to CRM
  if (!equipe) return null;

  const isLoading = loading || agentsLoading;

  return (
    <div className="flex items-center gap-3 bg-card border border-border px-3 py-1.5 rounded-lg shadow-sm">
      <div className="flex items-center gap-2">
        <Bot className={`h-4 w-4 ${isEnabled ? "text-primary" : "text-muted-foreground"}`} />
        <Label htmlFor="crm-agent-toggle" className="text-sm font-medium cursor-pointer">
          Copilot
        </Label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Info className="h-3 w-3 text-muted-foreground hover:text-foreground transition-colors" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">
                Quando ativo, o Copilot analisa conversas e executa automações.
                Desative para economizar custos de processamento.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <Switch
          id="crm-agent-toggle"
          checked={isEnabled}
          onCheckedChange={handleToggle}
          disabled={loading}
          className="scale-90"
        />
      )}
    </div>
  );
}
