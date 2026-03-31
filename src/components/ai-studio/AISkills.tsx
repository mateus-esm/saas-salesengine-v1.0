import { Plus, Webhook, Zap, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AISkills() {

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Intenções & Skills</h2>
          <p className="text-sm text-muted-foreground">
            Configure gatilhos na conversa para disparar webhooks ou ações no sistema.
          </p>
        </div>
        <Button className="gap-2 bg-primary">
          <Plus className="w-4 h-4" />
          Nova Intenção
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* Mocked Intention Item */}
        <div className="p-5 border border-border bg-card rounded-xl flex flex-col md:flex-row gap-4 md:items-center justify-between group">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-lg">
                <Zap className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-card-foreground">Agendar Reunião</h3>
            </div>
            <div className="flex gap-2 mt-3 flex-wrap">
              <span className="text-xs bg-muted px-2 py-1 rounded-md font-medium">"quero agendar"</span>
              <span className="text-xs bg-muted px-2 py-1 rounded-md font-medium">"marcar reunião"</span>
              <span className="text-xs bg-muted px-2 py-1 rounded-md font-medium">"falar com especialista"</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex flex-col text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5 font-mono text-xs"><Webhook className="w-3 h-3" /> POST webhook-url.com/trigger</span>
            </div>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-red-500 hover:bg-red-500/10">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="p-5 border border-border bg-card rounded-xl flex flex-col md:flex-row gap-4 md:items-center justify-between group">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg">
                <Zap className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-card-foreground">Consultar Pedido</h3>
            </div>
            <div className="flex gap-2 mt-3 flex-wrap">
              <span className="text-xs bg-muted px-2 py-1 rounded-md font-medium">"status pedido"</span>
              <span className="text-xs bg-muted px-2 py-1 rounded-md font-medium">"onde está meu pedido?"</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex flex-col text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5 font-mono text-xs"><Webhook className="w-3 h-3" /> GET webhook-url.com/status</span>
            </div>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-red-500 hover:bg-red-500/10">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
