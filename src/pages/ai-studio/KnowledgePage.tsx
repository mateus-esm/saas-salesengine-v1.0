import { useState, useEffect, useCallback, useRef } from "react";
import {
  User, Building2, BookOpen, FileText, Globe, Video, File,
  Plus, Loader2, Save, Sparkles, Paperclip, X, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TrainingBlockEditor } from "@/components/ai-studio/TrainingBlockEditor";
import { buildBehaviorPrompt, type BehaviorAnswers } from "@/components/ai-studio/PromptBuilder";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface TrainingItem {
  id: string;
  type: string;
  text: string;
  image?: string;
  title?: string;
}

type KnowledgeFolder = "perfil" | "empresa" | "treinamento";
type TrainingTab = "blocos" | "website" | "video" | "docs";

// ─────────────────────────────────────────────────────────────────────────────
// Perfil Folder
// ─────────────────────────────────────────────────────────────────────────────
const BEHAVIOR_FIELDS: { key: keyof BehaviorAnswers; label: string; placeholder: string; multiline?: boolean }[] = [
  { key: "agentName", label: "Nome do Agente", placeholder: "Ex: Solon, Aria, Max..." },
  { key: "tone", label: "Tom de Voz", placeholder: "Ex: consultivo, amigável, técnico, formal" },
  { key: "language", label: "Idioma", placeholder: "Ex: português, inglês" },
  { key: "persona", label: "Persona / Papel", placeholder: "Quem é o agente e qual seu papel?", multiline: true },
  { key: "goals", label: "Objetivos Principais", placeholder: "O que deve ajudar o usuário a fazer?", multiline: true },
  { key: "responseStyle", label: "Estilo de Resposta", placeholder: "Como estruturar as respostas?", multiline: true },
  { key: "restrictions", label: "Restrições", placeholder: "O que o agente NÃO deve responder?", multiline: true },
  { key: "escalation", label: "Escalada Humana", placeholder: "Quando transferir para atendente?", multiline: true },
];

function PerfilFolder() {
  const { toast } = useToast();
  const [mode, setMode] = useState<"wizard" | "raw">("wizard");
  const [saving, setSaving] = useState(false);
  const [rawBehavior, setRawBehavior] = useState("");
  const [answers, setAnswers] = useState<BehaviorAnswers>({
    agentName: "", tone: "", persona: "", goals: "",
    restrictions: "", responseStyle: "", language: "português", escalation: "",
  });

  const builtPrompt = buildBehaviorPrompt(answers);
  const activeText = mode === "wizard" ? builtPrompt : rawBehavior;
  const charCount = activeText.length;

  const handleSave = async () => {
    if (!activeText.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke("manage-agent-settings?action=update-behavior", {
        body: { behavior: activeText },
      });
      if (error) throw error;
      toast({ title: "Sincronizado!", description: "Perfil do agente atualizado." });
    } catch {
      toast({ title: "Erro", description: "Falha ao salvar o perfil.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      {/* Mode toggle + char counter */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center bg-muted p-1 rounded-lg text-xs">
          {(["wizard", "raw"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "px-3 py-1.5 rounded-md font-medium transition-all flex items-center gap-1.5",
                mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m === "wizard" && <Sparkles className="w-3.5 h-3.5" />}
              {m === "wizard" ? "Assistente" : "Texto Livre"}
            </button>
          ))}
        </div>
        <span className={cn("text-xs font-mono", charCount > 2800 ? "text-destructive font-bold" : "text-muted-foreground")}>
          {charCount} / 3000
        </span>
      </div>

      {mode === "wizard" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 border border-border rounded-lg bg-muted/20">
          {BEHAVIOR_FIELDS.map(({ key, label, placeholder, multiline }) => (
            <div key={key} className={cn("space-y-1", multiline && "md:col-span-2")}>
              <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
                {label}
              </label>
              {multiline ? (
                <textarea
                  rows={2}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
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
          ))}
        </div>
      ) : (
        <div className="relative">
          <textarea
            className="w-full min-h-[280px] bg-background border border-border rounded-lg p-4 text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground leading-relaxed"
            placeholder="Descreva o comportamento do agente em texto livre (max 3000 chars)..."
            value={rawBehavior}
            onChange={(e) => setRawBehavior(e.target.value.slice(0, 3000))}
          />
        </div>
      )}

      {/* Preview panel */}
      {mode === "wizard" && builtPrompt && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
            Prompt gerado
          </span>
          <pre className="max-h-[160px] overflow-y-auto bg-muted/40 border border-border rounded-lg p-3 text-[11px] font-mono text-foreground/80 whitespace-pre-wrap">
            {builtPrompt}
          </pre>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || !activeText.trim()} className="gap-2 px-6">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Sincronizando..." : "Salvar Perfil"}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empresa Folder
// ─────────────────────────────────────────────────────────────────────────────
function EmpresaFolder() {
  const { toast } = useToast();
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke("manage-agent-settings?action=update-description", {
        body: { description },
      });
      if (error) throw error;
      toast({ title: "Sincronizado!", description: "Descrição da empresa atualizada." });
    } catch {
      toast({ title: "Erro", description: "Falha ao salvar.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground leading-relaxed">
        Descrição curta do negócio ou serviço. Fornece contexto base ao agente para contextualizar respostas
        sem precisar repetir em cada bloco de treinamento.
      </p>
      <div className="relative">
        <textarea
          className="w-full min-h-[160px] bg-background border border-border rounded-lg p-4 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground leading-relaxed"
          placeholder="Ex: A Solo Energia é um hub de soluções em energia solar. Conectamos pessoas e negócios à liberdade energética..."
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 500))}
          maxLength={500}
        />
        <span className={cn(
          "absolute bottom-3 right-3 text-[11px] font-mono bg-background/80 px-1.5 py-0.5 rounded",
          description.length > 450 ? "text-destructive" : "text-muted-foreground"
        )}>
          {description.length}/500
        </span>
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || !description.trim()} variant="secondary" className="gap-2 px-6">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Sincronizando..." : "Salvar Empresa"}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Treinamento Folder — 4 tabs
// ─────────────────────────────────────────────────────────────────────────────
const TRAINING_TABS: { id: TrainingTab; label: string; icon: React.ComponentType<{className?:string}>; type: string }[] = [
  { id: "blocos", label: "Blocos", icon: FileText, type: "TEXT" },
  { id: "website", label: "Website", icon: Globe, type: "WEBSITE" },
  { id: "video", label: "Vídeo", icon: Video, type: "VIDEO" },
  { id: "docs", label: "Docs", icon: File, type: "DOCUMENT" },
];

function TrainingFolder() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TrainingTab>("blocos");
  const [trainings, setTrainings] = useState<TrainingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // New block form state
  const [newText, setNewText] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeTabCfg = TRAINING_TABS.find((t) => t.id === activeTab)!;

  const fetchTrainings = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("manage-agent-training");
      if (error) throw error;
      const items = data?.data || data || [];
      setTrainings(Array.isArray(items) ? items : []);
    } catch {
      toast({ title: "Erro", description: "Falha ao carregar treinamentos.", variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { fetchTrainings(); }, [fetchTrainings]);

  // Filter by type
  const filtered = trainings.filter((t) =>
    (t.type || "TEXT").toUpperCase() === activeTabCfg.type
  );

  const uploadToStorage = async (file: File): Promise<string | null> => {
    const ext = file.name.split(".").pop();
    const path = `training-attachments/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("agent-assets").upload(path, file, { upsert: false });
    if (error) { console.error("Storage upload error:", error); return null; }
    const { data: urlData } = supabase.storage.from("agent-assets").getPublicUrl(path);
    return urlData?.publicUrl ?? null;
  };

  const handleCreate = async () => {
    const content = activeTab === "blocos" ? newText : newUrl;
    if (!content.trim() && !attachFile) return;

    setCreating(true);
    try {
      let imageUrl: string | undefined;

      if (attachFile) {
        setUploadingFile(true);
        const url = await uploadToStorage(attachFile);
        setUploadingFile(false);
        if (!url) {
          toast({ title: "Erro", description: "Falha no upload do arquivo.", variant: "destructive" });
          return;
        }
        imageUrl = url;
      }

      const { error } = await supabase.functions.invoke("manage-agent-training?action=create", {
        body: {
          type: activeTabCfg.type,
          text: content || (attachFile?.name ?? ""),
          ...(imageUrl && { image: imageUrl }),
        },
      });
      if (error) throw error;

      toast({ title: "Sincronizado!", description: "Bloco adicionado com sucesso." });
      setNewText(""); setNewUrl(""); setAttachFile(null);
      fetchTrainings();
    } catch {
      toast({ title: "Erro", description: "Falha ao criar bloco.", variant: "destructive" });
    } finally { setCreating(false); }
  };

  const handleUpdate = async (id: string, content: string) => {
    const training = trainings.find((t) => t.id === id || (t as any)._id === id);
    const type = training ? (training.type || "TEXT") : "TEXT";
    const { error } = await supabase.functions.invoke("manage-agent-training?action=update", {
      body: { trainingId: id, type, text: content },
    });
    if (error) throw error;
    setTrainings((prev) => prev.map((t) => (t.id === id || (t as any)._id === id) ? { ...t, text: content } : t));
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.functions.invoke("manage-agent-training?action=delete", {
      body: { trainingId: id },
    });
    if (error) throw error;
    setTrainings((prev) => prev.filter((t) => t.id !== id && (t as any)._id !== id));
  };

  const isUrlTab = activeTab !== "blocos";

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex items-center gap-1 border-b border-border -mx-1 px-1">
        {TRAINING_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors -mb-px",
              activeTab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
        <span className="ml-auto text-[10px] font-mono text-muted-foreground pb-2">
          {filtered.length} {activeTab === "blocos" ? "blocos" : "itens"}
        </span>
      </div>

      {/* New item form */}
      <div className="flex items-stretch gap-2">
        {isUrlTab ? (
          <input
            type="url"
            className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground font-mono"
            placeholder={activeTab === "website" ? "https://seusite.com/pagina" : activeTab === "video" ? "https://youtube.com/watch?v=..." : "https://link-para-arquivo.pdf"}
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
        ) : (
          <>
            <textarea
              rows={2}
              className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
              placeholder="Cole o texto do bloco de treinamento (max 1100 chars)..."
              value={newText}
              onChange={(e) => setNewText(e.target.value.slice(0, 1100))}
            />
            {/* File attachment */}
            <div className="flex flex-col gap-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
                className="hidden"
                onChange={(e) => setAttachFile(e.target.files?.[0] ?? null)}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "p-2 rounded-md border transition-colors",
                  attachFile ? "border-primary bg-primary/8 text-primary" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
                title="Anexar arquivo (áudio, vídeo, imagem, doc)"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              {attachFile && (
                <button
                  onClick={() => setAttachFile(null)}
                  className="p-2 rounded-md border border-border text-muted-foreground hover:text-destructive"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </>
        )}
        <Button
          onClick={handleCreate}
          disabled={creating || uploadingFile || (!newText.trim() && !newUrl.trim() && !attachFile)}
          size="sm"
          className="self-start mt-0.5 gap-1.5"
        >
          {creating || uploadingFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {uploadingFile ? "Upload..." : "Adicionar"}
        </Button>
      </div>

      {/* Attachment preview */}
      {attachFile && (
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground bg-muted/40 px-3 py-2 rounded-md border border-border">
          <Upload className="w-3.5 h-3.5 text-primary" />
          <span className="truncate">{attachFile.name}</span>
          <span className="text-[10px] ml-auto">({(attachFile.size / 1024).toFixed(1)} KB)</span>
        </div>
      )}

      {/* Blocks list */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-border rounded-lg text-xs font-mono text-muted-foreground">
          Nenhum item em {activeTabCfg.label}. Adicione acima.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t, i) => (
            <TrainingBlockEditor
              key={t.id || (t as any)._id}
              id={t.id || (t as any)._id}
              type={(t.type || "TEXT").toUpperCase()}
              initialContent={t.text || ""}
              title={t.title}
              index={trainings.indexOf(t)}
              onSave={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
const FOLDERS: { id: KnowledgeFolder; label: string; icon: React.ComponentType<{className?:string}>; desc: string }[] = [
  { id: "perfil", label: "Perfil do Agente", icon: User, desc: "Comportamento, persona e regras de interação" },
  { id: "empresa", label: "Contexto da Empresa", icon: Building2, desc: "Descrição do negócio (500 chars)" },
  { id: "treinamento", label: "Treinamento Especializado", icon: BookOpen, desc: "Blocos, websites, vídeos e documentos" },
];

export default function KnowledgePage() {
  const [openFolder, setOpenFolder] = useState<KnowledgeFolder>("perfil");

  return (
    <div className="p-6 lg:p-8 max-w-[1100px] mx-auto space-y-5">
      {/* Header */}
      <div className="border-b border-border pb-5">
        <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-muted-foreground mb-1">
          AI Studio / Knowledge Base
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Knowledge Base</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Camada de memória estruturada do agente: comportamento, contexto empresarial e blocos de conhecimento.
        </p>
      </div>

      {/* Folder accordion */}
      <div className="space-y-3">
        {FOLDERS.map(({ id, label, icon: Icon, desc }) => {
          const isOpen = openFolder === id;
          return (
            <div key={id} className={cn("border rounded-lg overflow-hidden transition-colors", isOpen ? "border-primary/30 bg-card" : "border-border bg-card")}>
              {/* Folder header */}
              <button
                onClick={() => setOpenFolder(isOpen ? id : id)}
                className="w-full flex items-center gap-3 px-5 py-4 text-left"
              >
                <div className={cn(
                  "p-2 rounded border transition-colors shrink-0",
                  isOpen ? "bg-primary/8 border-primary/20 text-primary" : "bg-muted/60 border-border text-muted-foreground"
                )}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground">{label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
                </div>
                <div className={cn(
                  "w-4 h-4 shrink-0 text-muted-foreground transition-transform",
                  isOpen ? "rotate-180" : ""
                )}>
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M4 6l4 4 4-4" />
                  </svg>
                </div>
              </button>

              {/* Folder content */}
              {isOpen && (
                <div className="px-5 pb-5 border-t border-border/60">
                  <div className="pt-4">
                    {id === "perfil" && <PerfilFolder />}
                    {id === "empresa" && <EmpresaFolder />}
                    {id === "treinamento" && <TrainingFolder />}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
