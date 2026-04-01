import { useState, useEffect, useCallback } from "react";
import { BookOpen, FileText, Globe, Video, Plus, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BehaviorSettings } from "./BehaviorSettings";
import { TrainingBlockCard } from "./TrainingBlockCard";

interface TrainingItem {
  id: string;
  type: string;
  text: string;
  image?: string;
}

export function AIKnowledgeBase() {
  const [trainings, setTrainings] = useState<TrainingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [videoInput, setVideoInput] = useState("");
  const { toast } = useToast();

  const fetchTrainings = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('manage-agent-training');
      if (error) throw error;

      const items = data?.data || data || [];
      setTrainings(Array.isArray(items) ? items : []);
    } catch (err) {
      console.error('Error fetching trainings:', err);
      toast({ title: 'Erro', description: 'Não foi possível carregar treinamentos.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchTrainings();
  }, [fetchTrainings]);

  const createTraining = async (type: string, text: string) => {
    if (!text.trim()) return;
    setCreating(true);
    try {
      const { error } = await supabase.functions.invoke('manage-agent-training?action=create', {
        body: { type, text },
      });
      if (error) throw error;
      toast({ title: 'Treinamento criado!', description: `Bloco de ${type.toLowerCase()} adicionado.` });
      setTextInput("");
      setUrlInput("");
      setVideoInput("");
      fetchTrainings();
    } catch (err) {
      console.error('Error creating training:', err);
      toast({ title: 'Erro', description: 'Falha ao criar treinamento. A API pode estar fora.', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const deleteTraining = async (trainingId: string) => {
    try {
      const { error } = await supabase.functions.invoke('manage-agent-training?action=delete', {
        body: { trainingId },
      });
      if (error) throw error;
      toast({ title: 'Removido', description: 'Treinamento deletado com sucesso.' });
      setTrainings(prev => prev.filter(t => (t.id || (t as any)._id) !== trainingId));
    } catch (err) {
      console.error('Error deleting training:', err);
      toast({ title: 'Erro', description: 'Falha ao deletar treinamento.', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-8">
      {/* Layer 1 & 2: Behavior Settings */}
      <BehaviorSettings />

      {/* Layer 3: Training Blocks */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Blocos de Treinamento</h2>
            <p className="text-sm text-muted-foreground">Adicione conteúdo multimodal para treinar seu agente.</p>
          </div>
        </div>

        {/* Add Training Tabs */}
        <div className="p-6 rounded-xl border border-border bg-card">
          <Tabs defaultValue="text">
            <TabsList className="bg-muted/50 mb-4">
              <TabsTrigger value="text" className="gap-2"><FileText className="w-4 h-4" /> Texto</TabsTrigger>
              <TabsTrigger value="website" className="gap-2"><Globe className="w-4 h-4" /> Website</TabsTrigger>
              <TabsTrigger value="video" className="gap-2"><Video className="w-4 h-4" /> Vídeo</TabsTrigger>
            </TabsList>

            <TabsContent value="text" className="space-y-3">
              <textarea
                className="w-full min-h-[120px] bg-background border border-border rounded-lg p-4 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                placeholder="Cole aqui o texto para treinar o agente..."
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
              />
              <div className="flex justify-end">
                <Button onClick={() => createTraining('TEXT', textInput)} disabled={creating || !textInput.trim()} className="gap-2">
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Adicionar Texto
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="website" className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://sua-empresa.com.br"
                  className="flex-1 bg-background border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                />
                <Button onClick={() => createTraining('WEBSITE', urlInput)} disabled={creating || !urlInput.trim()} className="gap-2">
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Adicionar URL
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">O AI Studio vai acessar e extrair o conteúdo da página automaticamente.</p>
            </TabsContent>

            <TabsContent value="video" className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="Link do Youtube..."
                  className="flex-1 bg-background border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                  value={videoInput}
                  onChange={(e) => setVideoInput(e.target.value)}
                />
                <Button onClick={() => createTraining('VIDEO', videoInput)} disabled={creating || !videoInput.trim()} className="gap-2">
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Transcrever
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Existing Blocks Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : trainings.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-xl">
            Nenhum bloco de treinamento encontrado. Adicione conteúdo acima.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {trainings.map((t) => (
              <TrainingBlockCard
                key={t.id || (t as any)._id}
                id={t.id || (t as any)._id}
                type={(t.type || 'TEXT').toUpperCase()}
                content={t.text || ''}
                image={t.image}
                onDelete={deleteTraining}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
