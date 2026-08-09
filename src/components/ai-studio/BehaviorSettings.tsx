import { useState, useEffect, useCallback } from "react";
import { Save, Loader2, User, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function BehaviorSettings() {
  const [behavior, setBehavior] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingBehavior, setSavingBehavior] = useState(false);
  const [savingDescription, setSavingDescription] = useState(false);
  const { toast } = useToast();

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('manage-agent-settings');
      if (error) throw error;
      // W1 note #1: nested shape. data.agent.* is the contract; the flat keys
      // die in 7.3. W1 note #2: the edge function maps `description` onto
      // upstream `jobDescription` — the UI keeps using `description`.
      setBehavior(data?.agent?.behavior || '');
      setDescription(data?.agent?.description || '');
    } catch (err) {
      console.error('Error loading settings:', err);
      toast({ title: 'Erro', description: 'Não foi possível carregar configurações do agente.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const saveBehavior = async () => {
    setSavingBehavior(true);
    try {
      const { error } = await supabase.functions.invoke('manage-agent-settings?action=update-behavior', {
        body: { behavior },
      });
      if (error) throw error;
      toast({ title: 'Salvo!', description: 'Comportamento do agente atualizado.' });
    } catch (err) {
      console.error('Error saving behavior:', err);
      toast({ title: 'Erro', description: 'Falha ao salvar. A API pode estar fora do ar.', variant: 'destructive' });
    } finally {
      setSavingBehavior(false);
    }
  };

  const saveDescription = async () => {
    setSavingDescription(true);
    try {
      const { error } = await supabase.functions.invoke('manage-agent-settings?action=update-description', {
        body: { description },
      });
      if (error) throw error;
      toast({ title: 'Salvo!', description: 'Descrição da empresa atualizada.' });
    } catch (err) {
      console.error('Error saving description:', err);
      toast({ title: 'Erro', description: 'Falha ao salvar. A API pode estar fora do ar.', variant: 'destructive' });
    } finally {
      setSavingDescription(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Behavior Card */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-lg">
              <User className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-lg">Perfil (Behavior)</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Como o agente deve se comportar e responder.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <textarea
              className="w-full min-h-[180px] bg-background border border-border rounded-lg p-4 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
              placeholder="Descreva o comportamento desejado do agente..."
              value={behavior}
              onChange={(e) => setBehavior(e.target.value.slice(0, 3000))}
              maxLength={3000}
            />
            <span className="absolute bottom-3 right-3 text-xs text-muted-foreground font-mono">
              {behavior.length}/3000
            </span>
          </div>
          <div className="flex justify-end">
            <Button onClick={saveBehavior} disabled={savingBehavior} className="gap-2">
              {savingBehavior ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Perfil
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Description Card */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-lg">Empresa (Company)</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Descrição curta do negócio para contexto.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <textarea
              className="w-full min-h-[180px] bg-background border border-border rounded-lg p-4 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
              placeholder="Descreva brevemente a empresa..."
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 500))}
              maxLength={500}
            />
            <span className="absolute bottom-3 right-3 text-xs text-muted-foreground font-mono">
              {description.length}/500
            </span>
          </div>
          <div className="flex justify-end">
            <Button onClick={saveDescription} disabled={savingDescription} className="gap-2">
              {savingDescription ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Empresa
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
