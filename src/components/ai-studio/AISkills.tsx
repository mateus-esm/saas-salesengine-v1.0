import { useState, useEffect, useCallback } from "react";
import { Plus, Zap, Trash2, Edit3, Webhook, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { IntentionWizard } from "./IntentionWizard";

interface Intention {
  id: string;
  name: string;
  description?: string;
  triggers: string[];
  webhook?: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
  };
  persistVariables?: boolean;
  responseType?: string;
  fixedResponse?: string;
}

const COLORS = [
  'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  'bg-pink-500/10 text-pink-600 dark:text-pink-400',
];

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
    try {
      if (editingIntention) {
        const { error } = await supabase.functions.invoke('manage-agent-intentions?action=update', {
          body: { intentionId: editingIntention.id, ...formData },
        });
        if (error) throw error;
        toast({ title: 'Atualizado!', description: `Intenção "${formData.name}" atualizada.` });
      } else {
        const { error } = await supabase.functions.invoke('manage-agent-intentions?action=create', {
          body: formData,
        });
        if (error) throw error;
        toast({ title: 'Criado!', description: `Intenção "${formData.name}" criada com sucesso.` });
      }
      setWizardOpen(false);
      setEditingIntention(null);
      fetchIntentions();
    } catch (err) {
      console.error('Error saving intention:', err);
      toast({ title: 'Erro', description: 'Falha ao salvar intenção. A API pode estar fora.', variant: 'destructive' });
    }
  };

  const handleDelete = async (intentionId: string) => {
    try {
      const { error } = await supabase.functions.invoke('manage-agent-intentions?action=delete', {
        body: { intentionId },
      });
      if (error) throw error;
      toast({ title: 'Removido', description: 'Intenção deletada com sucesso.' });
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Intenções & Skills</h2>
          <p className="text-sm text-muted-foreground">
            Configure gatilhos na conversa para disparar webhooks ou ações no sistema.
          </p>
        </div>
        <Button className="gap-2" onClick={() => { setEditingIntention(null); setWizardOpen(true); }}>
          <Plus className="w-4 h-4" />
          Nova Intenção
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : intentions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
          Nenhuma intenção configurada. Clique em "Nova Intenção" para começar.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {intentions.map((intention, index) => (
            <div
              key={intention.id}
              className="p-5 border border-border bg-card rounded-xl flex flex-col md:flex-row gap-4 md:items-center justify-between group hover:border-primary/30 transition-colors"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className={`p-2 rounded-lg ${COLORS[index % COLORS.length]}`}>
                    <Zap className="w-4 h-4" />
                  </div>
                  <h3 className="font-semibold text-card-foreground">{intention.name}</h3>
                </div>
                {intention.description && (
                  <p className="text-xs text-muted-foreground mb-2 ml-11">{intention.description}</p>
                )}
                <div className="flex gap-2 mt-2 flex-wrap ml-11">
                  {(intention.triggers || []).map((t) => (
                    <span key={t} className="text-xs bg-muted px-2 py-1 rounded-md font-medium">"{t}"</span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-4">
                {intention.webhook?.url && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                    <Webhook className="w-3 h-3" />
                    <span>{intention.webhook.method} {intention.webhook.url.replace(/^https?:\/\//, '').slice(0, 30)}...</span>
                  </div>
                )}
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(intention)} className="text-muted-foreground hover:text-foreground">
                    <Edit3 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(intention.id)} className="text-muted-foreground hover:text-red-500 hover:bg-red-500/10">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Wizard Modal */}
      {wizardOpen && (
        <IntentionWizard
          initialData={editingIntention || undefined}
          onSave={handleSave}
          onClose={() => { setWizardOpen(false); setEditingIntention(null); }}
        />
      )}
    </div>
  );
}
