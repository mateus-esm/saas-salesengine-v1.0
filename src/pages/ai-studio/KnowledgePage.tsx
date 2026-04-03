import { useState } from "react";
import { User, Building2, BookOpen, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AIKnowledgeBase } from "@/components/ai-studio/AIKnowledgeBase";
import { buildBehaviorPrompt, type BehaviorAnswers } from "@/components/ai-studio/PromptBuilder";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

// Sub-tab navigation inside Knowledge
type KnowledgeTab = "profile" | "company" | "training";

const TABS: { id: KnowledgeTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "profile", label: "Perfil", icon: User },
  { id: "company", label: "Empresa", icon: Building2 },
  { id: "training", label: "Treinamento", icon: BookOpen },
];

// ----- Profile Tab with PromptBuilder -----
function ProfileTab() {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [rawBehavior, setRawBehavior] = useState("");
  const [answers, setAnswers] = useState<BehaviorAnswers>({
    agentName: "",
    tone: "",
    persona: "",
    goals: "",
    restrictions: "",
    responseStyle: "",
    language: "português",
    escalation: "",
  });

  const builtPrompt = buildBehaviorPrompt(answers);
  const preview = showWizard ? builtPrompt : rawBehavior;
  const charCount = preview.length;

  const handleSave = async () => {
    const value = showWizard ? builtPrompt : rawBehavior;
    if (!value.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke(
        "manage-agent-settings?action=update-behavior",
        { body: { behavior: value } }
      );
      if (error) throw error;
      toast({ title: "Sincronizado!", description: "Perfil do agente atualizado." });
    } catch {
      toast({ title: "Erro", description: "Falha ao salvar o perfil.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const field = (
    key: keyof BehaviorAnswers,
    label: string,
    placeholder: string,
    multiline = false
  ) => (
    <div className="space-y-1.5">
      <label className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider">
        {label}
      </label>
      {multiline ? (
        <textarea
          rows={3}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
          placeholder={placeholder}
          value={answers[key] ?? ""}
          onChange={(e) => setAnswers((p) => ({ ...p, [key]: e.target.value }))}
        />
      ) : (
        <input
          type="text"
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
          placeholder={placeholder}
          value={answers[key] ?? ""}
          onChange={(e) => setAnswers((p) => ({ ...p, [key]: e.target.value }))}
        />
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Mode Toggle */}
      <div className="flex items-center gap-2">
        <div className="flex items-center bg-muted p-1 rounded-lg text-xs">
          <button
            onClick={() => setShowWizard(false)}
            className={`px-3 py-1.5 rounded-md font-medium transition-all ${
              !showWizard ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Texto Livre
          </button>
          <button
            onClick={() => setShowWizard(true)}
            className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center gap-1.5 ${
              showWizard ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            PromptBuilder
          </button>
        </div>
        <span className="text-xs text-muted-foreground font-mono ml-auto">
          {charCount}/3000 chars
        </span>
      </div>

      {showWizard ? (
        // Wizard form
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5 border border-border rounded-lg bg-card">
          {field("agentName", "Nome do Agente", "Ex: Aria, Max, Sofia...")}
          {field("tone", "Tom de Voz", "Ex: formal, amigável, técnico, consultivo")}
          {field("language", "Idioma Padrão", "Ex: português, inglês")}
          {field("persona", "Persona / Papel", "Descreva quem o agente é e seu papel...", true)}
          {field("goals", "Objetivos Principais", "O que o agente deve ajudar o usuário a fazer...", true)}
          {field("responseStyle", "Estilo de Resposta", "Como o agente deve estruturar as respostas...", true)}
          {field("restrictions", "Restrições", "O que o agente NÃO deve fazer ou responder...", true)}
          {field("escalation", "Escalada Humana", "Em quais situações escalar para um atendente...", true)}
        </div>
      ) : (
        // Raw textarea
        <div className="relative">
          <textarea
            className="w-full min-h-[300px] bg-background border border-border rounded-lg p-4 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground font-mono leading-relaxed"
            placeholder="Descreva o comportamento do agente em texto livre..."
            value={rawBehavior}
            onChange={(e) => setRawBehavior(e.target.value.slice(0, 3000))}
            maxLength={3000}
          />
        </div>
      )}

      {/* Preview when wizard is active */}
      {showWizard && builtPrompt && (
        <div className="space-y-2">
          <div className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider">
            Preview gerado
          </div>
          <pre className="w-full max-h-[200px] overflow-y-auto bg-muted/40 border border-border rounded-lg p-4 text-xs font-mono text-foreground whitespace-pre-wrap">
            {builtPrompt}
          </pre>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || !preview.trim()} className="gap-2 px-6">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? "Sincronizando..." : "Salvar Perfil"}
        </Button>
      </div>
    </div>
  );
}

// ----- Company Tab -----
function CompanyTab() {
  const { toast } = useToast();
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke(
        "manage-agent-settings?action=update-description",
        { body: { description } }
      );
      if (error) throw error;
      toast({ title: "Sincronizado!", description: "Descrição da empresa atualizada." });
    } catch {
      toast({ title: "Erro", description: "Falha ao salvar.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">
          Descrição curta do negócio ou serviço prestado. Fornece contexto base ao agente.
        </p>
      </div>
      <div className="relative">
        <textarea
          className="w-full min-h-[180px] bg-background border border-border rounded-lg p-4 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground leading-relaxed"
          placeholder="Descreva brevemente a empresa, produto ou serviço oferecido..."
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 500))}
          maxLength={500}
        />
        <span className="absolute bottom-3 right-3 text-xs font-mono text-muted-foreground bg-background/80 px-1.5 py-0.5 rounded">
          {description.length}/500
        </span>
      </div>
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saving || !description.trim()}
          variant="secondary"
          className="gap-2 px-6"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? "Sincronizando..." : "Salvar Empresa"}
        </Button>
      </div>
    </div>
  );
}

// ----- Main Page -----
export default function KnowledgePage() {
  const [activeTab, setActiveTab] = useState<KnowledgeTab>("profile");

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      {/* Page Header */}
      <div className="border-b border-border pb-5">
        <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-muted-foreground mb-1">
          AI Studio / Knowledge Base
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Knowledge Base
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure as "conexões neurais" do agente: comportamento, contexto de empresa e blocos de treinamento.
        </p>
      </div>

      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "profile" && <ProfileTab />}
        {activeTab === "company" && <CompanyTab />}
        {activeTab === "training" && (
          <AIKnowledgeBase />
        )}
      </div>
    </div>
  );
}
