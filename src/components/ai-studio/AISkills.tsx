import { useState, useEffect, useCallback } from "react";
import { Zap, Plus, Loader2, Webhook, Edit3, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { IntentionWizard } from "./IntentionWizard";
import { SectionFolder } from "./SectionFolder";
import { Accordion } from "@/components/ui/accordion";

interface Intention {
  id: string;
  name: string;
  description?: string;
  triggers: string[];
  webhook?: {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
    body?: string;
  };
  persistVariables?: boolean;
  responseType?: string;
  fixedResponse?: string;
}

export function AISkills() {
  const [intentions, setIntentions] = useState<Intention[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingIntention, setEditingIntention] = useState<Intention | null>(null);
  const { toast } = useToast();

  const fetchIntentions = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('manage-agent-intentions');
      if (error) throw error;

      const items = data?.data || data || [];
      setIntentions(Array.isArray(items) ? items : []);
    } catch (err) {
      console.error('Error fetching intentions:', err);
      toast({ title: 'Erro', description: 'Não foi possível carregar intenções.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchIntentions();
  }, [fetchIntentions]);

  const handleSave = async (formData: any) => {
    toast({ description: "Sincronizando intenção..." });
    try {
      if (editingIntention) {
        const { error } = await supabase.functions.invoke('manage-agent-intentions?action=update', {
          body: { intentionId: editingIntention.id, ...formData },
        });
        if (error) throw error;
        toast({ title: 'Sincronizado!', description: `Intenção "${formData.name}" atualizada.` });
      } else {
        const { error } = await supabase.functions.invoke('manage-agent-intentions?action=create', {
          body: formData,
        });
        if (error) throw error;
        toast({ title: 'Sincronizado!', description: `Intenção "${formData.name}" criada.` });
      }
      setWizardOpen(false);
      setEditingIntention(null);
      fetchIntentions(); // Refresh list to get real ID
    } catch (err) {
      console.error('Error saving intention:', err);
      toast({ title: 'Erro', description: 'Falha ao salvar no GPT Maker.', variant: 'destructive' });
    }
  };

  const handleDelete = async (e: React.MouseEvent, intentionId: string) => {
    e.stopPropagation(); // Previne abrir o wizard ao clicar em deletar
    if (!window.confirm("Certeza que deseja deletar esta intenção?")) return;

    toast({ description: "Sincronizando remoção..." });
    try {
      const { error } = await supabase.functions.invoke('manage-agent-intentions?action=delete', {
        body: { intentionId },
      });
      if (error) throw error;
      toast({ title: 'Sincronizado!', description: 'Intenção removida.' });
      setIntentions(prev => prev.filter(i => i.id !== intentionId));
    } catch (err) {
      console.error('Error deleting intention:', err);
      toast({ title: 'Erro', description: 'Falha ao deletar intenção.', variant: 'destructive' });
    }
  };

  const openEdit = (intention: Intention) => {
    setEditingIntention(intention);
    setWizardOpen(true);
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground">Skills & Intenções</h2>
        <p className="text-sm text-muted-foreground mt-1">Configure gatilhos na conversa para disparar webhooks ou ações no sistema.</p>
      </div>

      <Accordion type="single" collapsible defaultValue="intencoes" className="w-full">
        <SectionFolder 
          value="intencoes" 
          title="Pasta de Intenções" 
          description={`${intentions.length} intenções ativas mapeadas para o agente.`}
          icon={<Zap className="w-5 h-5" />}
        >
        <div className="space-y-4 pt-4">
          <div className="flex justify-end mb-2">
            <Button className="gap-2" onClick={() => { setEditingIntention(null); setWizardOpen(true); }}>
              <Plus className="w-4 h-4" />
              Nova Intenção
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : intentions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
              Nenhuma intenção encontrada na pasta.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {intentions.map((intention) => (
                <div
                  key={intention.id}
                  onClick={() => openEdit(intention)}
                  className="group flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border border-border bg-card hover:bg-muted/30 rounded-lg cursor-pointer transition-colors gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-primary shrink-0" />
                      <h4 className="font-semibold text-sm text-foreground truncate">{intention.name}</h4>
                    </div>
                    {intention.description && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{intention.description}</p>
                    )}
                    {(intention.triggers || []).length > 0 && (
                       <div className="flex gap-1.5 mt-2 flex-wrap">
                        {intention.triggers.slice(0, 3).map(t => (
                           <Badge key={t} variant="secondary" className="font-mono text-[10px] px-1.5 py-0 truncate max-w-[150px]">
                             {t}
                           </Badge>
                        ))}
                        {intention.triggers.length > 3 && (
                           <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 text-muted-foreground">
                             +{intention.triggers.length - 3} mais
                           </Badge>
                        )}
                       </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {intention.webhook?.url && (
                       <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded">
                         <Webhook className="w-3 h-3 text-primary" />
                         <span>{intention.webhook.method}</span>
                       </div>
                    )}
                    
                    <div className="flex gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                        <Edit3 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={(e) => handleDelete(e, intention.id)} className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </SectionFolder>
      </Accordion>

      {wizardOpen && (
        <IntentionWizard
          initialData={editingIntention as any}
          onSave={handleSave}
          onClose={() => { setWizardOpen(false); setEditingIntention(null); }}
        />
      )}
    </div>
  );
}
