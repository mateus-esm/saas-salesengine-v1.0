import { useState, useEffect, useCallback } from "react";
import { User, Building2, BookOpen, FileText, Globe, Video, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SectionFolder } from "./SectionFolder";
import { TrainingBlockEditor } from "./TrainingBlockEditor";
import { Accordion } from "@/components/ui/accordion";

interface TrainingItem {
  id: string;
  type: string;
  text: string;
  image?: string;
  title?: string; // Appended locally for now
}

export function AIKnowledgeBase() {
  const [loading, setLoading] = useState(true);
  const [behavior, setBehavior] = useState("");
  const [description, setDescription] = useState("");
  const [trainings, setTrainings] = useState<TrainingItem[]>([]);
  
  const [savingBehavior, setSavingBehavior] = useState(false);
  const [savingDescription, setSavingDescription] = useState(false);
  const [creating, setCreating] = useState(false);
  
  const [newText, setNewText] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newType, setNewType] = useState('TEXT');
  
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch settings
      const settingsRes = await supabase.functions.invoke('manage-agent-settings');
      if (!settingsRes.error && settingsRes.data) {
        setBehavior(settingsRes.data.behavior || '');
        setDescription(settingsRes.data.description || '');
      }

      // Fetch trainings
      const trainingsRes = await supabase.functions.invoke('manage-agent-training');
      if (!trainingsRes.error && trainingsRes.data) {
        const items = trainingsRes.data.data || trainingsRes.data || [];
        setTrainings(Array.isArray(items) ? items : []);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      toast({ title: 'Erro', description: 'Falha ao carregar a Knowledge Base.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleSaveSettings = async (field: 'behavior' | 'description', value: string) => {
    const isBehavior = field === 'behavior';
    const setSaving = isBehavior ? setSavingBehavior : setSavingDescription;
    const action = isBehavior ? 'update-behavior' : 'update-description';
    
    setSaving(true);
    toast({ description: "Sincronizando...", duration: 2000 });
    
    try {
      const { error } = await supabase.functions.invoke(`manage-agent-settings?action=${action}`, {
        body: { [field]: value },
      });
      if (error) throw error;
      toast({ title: 'Sincronizado!', description: `Dados atualizados com sucesso.` });
    } catch (err) {
      console.error(`Error saving ${field}:`, err);
      toast({ title: 'Erro de Sincronização', description: 'A API do AI Engine pode estar fora.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const createTraining = async () => {
    const content = newType === 'TEXT' ? newText : newUrl;
    if (!content.trim()) return;

    setCreating(true);
    toast({ description: "Criando e sincronizando bloco..." });
    try {
      const { error } = await supabase.functions.invoke('manage-agent-training?action=create', {
        body: { type: newType, text: content },
      });
      if (error) throw error;
      
      toast({ title: 'Sincronizado!', description: `Bloco adicionado com sucesso.` });
      setNewText(""); setNewUrl("");
      fetchAll();
    } catch (err) {
      console.error('Error creating training:', err);
      toast({ title: 'Erro', description: 'Falha ao criar bloco no AI Engine.', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const updateTraining = async (id: string, newContent: string) => {
    toast({ description: "Sincronizando alteração no bloco..." });
    // AI Engine API needs the type again for update, we infer it from local array
    const training = trainings.find(t => t.id === id || (t as any)._id === id);
    const type = training ? (training.type || 'TEXT') : 'TEXT';

    try {
      const { error } = await supabase.functions.invoke('manage-agent-training?action=update', {
         body: { trainingId: id, type, text: newContent },
      });
      if (error) throw error;
      toast({ title: 'Sincronizado!', description: `Bloco atualizado com sucesso.` });
      // Update local state without refetching all
      setTrainings(prev => prev.map(t => (t.id === id || (t as any)._id === id) ? { ...t, text: newContent } : t));
    } catch (err) {
       console.error('Error updating training:', err);
       toast({ title: 'Erro', description: 'Falha ao atualizar bloco no AI Engine.', variant: 'destructive' });
    }
  };

  const deleteTraining = async (id: string) => {
    try {
      const { error } = await supabase.functions.invoke('manage-agent-training?action=delete', {
        body: { trainingId: id },
      });
      if (error) throw error;
      toast({ title: 'Sincronizado!', description: `Bloco removido com sucesso.` });
      setTrainings(prev => prev.filter(t => t.id !== id && (t as any)._id !== id));
    } catch (err) {
      console.error('Error deleting training:', err);
      toast({ title: 'Erro', description: 'Falha ao deletar bloco.', variant: 'destructive' });
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground">Knowledge Base</h2>
        <p className="text-sm text-muted-foreground mt-1">Configure as "conexões neurais" do seu agente usando pastas lógico-específicas.</p>
      </div>

      <Accordion type="single" collapsible defaultValue="perfil" className="w-full">
        <SectionFolder 
        value="perfil" 
        title="Perfil (Behavior)" 
        description="Como o agente deve se comportar e responder (persona, regras gerais)."
        icon={<User className="w-5 h-5" />}
      >
        <div className="space-y-4 pt-2">
          <div className="relative">
            <textarea
              className="w-full min-h-[250px] bg-background border border-border rounded-lg p-4 text-sm font-medium resize-y focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground leading-relaxed shadow-inner"
              placeholder="Descreva o comportamento desejado do agente..."
              value={behavior}
              onChange={(e) => setBehavior(e.target.value.slice(0, 3000))}
              maxLength={3000}
            />
            <span className="absolute bottom-3 right-3 text-xs font-mono font-medium text-muted-foreground bg-background/80 px-2 py-1 rounded">
              {behavior.length}/3000
            </span>
          </div>
          <div className="flex justify-end">
             <Button onClick={() => handleSaveSettings('behavior', behavior)} disabled={savingBehavior} className="gap-2 px-6">
              {savingBehavior && <Loader2 className="w-4 h-4 animate-spin" />}
              {savingBehavior ? 'Sincronizando...' : 'Salvar Perfil'}
            </Button>
          </div>
        </div>
      </SectionFolder>

      <SectionFolder 
        value="empresa" 
        title="Empresa (Context)" 
        description="Descrição curta do negócio ou serviço prestado para dar base ao agente."
        icon={<Building2 className="w-5 h-5" />}
      >
         <div className="space-y-4 pt-2">
          <div className="relative">
            <textarea
              className="w-full min-h-[120px] bg-background border border-border rounded-lg p-4 text-sm font-medium resize-y focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground shadow-inner"
              placeholder="Descreva brevemente a empresa..."
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 500))}
              maxLength={500}
            />
            <span className="absolute bottom-3 right-3 text-xs font-mono font-medium text-muted-foreground bg-background/80 px-2 py-1 rounded">
              {description.length}/500
            </span>
          </div>
          <div className="flex justify-end">
             <Button onClick={() => handleSaveSettings('description', description)} disabled={savingDescription} className="gap-2 px-6" variant="secondary">
              {savingDescription && <Loader2 className="w-4 h-4 animate-spin" />}
              {savingDescription ? 'Sincronizando...' : 'Salvar Empresa'}
            </Button>
          </div>
        </div>
      </SectionFolder>

      <SectionFolder 
        value="treinamentos" 
        title="Blocos de Treinamento" 
        description={`${trainings.length} fragmentos de conhecimento multimodais injetados na memória do agente.`}
        icon={<BookOpen className="w-5 h-5" />}
      >
        <div className="space-y-6 pt-4">
          {/* New Block Input form inline */}
          <div className="flex flex-col sm:flex-row items-start sm:items-stretch gap-2 p-1 bg-muted rounded-xl">
             <div className="flex w-full sm:w-auto p-1 bg-background rounded-lg border border-border shrink-0">
               <button onClick={() => setNewType('TEXT')} className={`px-4 py-2 text-sm font-semibold rounded-md flex items-center gap-2 transition-colors ${newType === 'TEXT' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                 <FileText className="w-4 h-4"/> Texto
               </button>
               <button onClick={() => setNewType('WEBSITE')} className={`px-4 py-2 text-sm font-semibold rounded-md flex items-center gap-2 transition-colors ${newType === 'WEBSITE' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                 <Globe className="w-4 h-4"/> Website
               </button>
             </div>
             <div className="flex-1 flex w-full gap-2">
                {newType === 'TEXT' ? (
                  <input 
                    className="flex-1 min-w-0 bg-background border border-border rounded-lg px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="Cole um texto rápido ou regra..."
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createTraining()}
                  />
                ) : (
                  <input 
                    className="flex-1 min-w-0 bg-background border border-border rounded-lg px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="https://..."
                    type="url"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createTraining()}
                  />
                )}
                <Button onClick={createTraining} disabled={creating || (newType==='TEXT'?!newText:!newUrl)} size="icon" className="w-12 shrink-0">
                  {creating ? <Loader2 className="w-4 h-4 animate-spin"/> : <Plus className="w-5 h-5"/>}
                </Button>
             </div>
          </div>

          {/* Blocks List */}
          <div className="space-y-3">
            {trainings.map((t, index) => (
               <TrainingBlockEditor
                 key={t.id || (t as any)._id}
                 id={t.id || (t as any)._id}
                 type={(t.type || 'TEXT').toUpperCase()}
                 initialContent={t.text || ''}
                 title={t.title}
                 index={index}
                 onSave={updateTraining}
                 onDelete={deleteTraining}
               />
            ))}
          </div>
        </div>
      </SectionFolder>
      </Accordion>
    </div>
  );
}
