import { useState, useEffect } from "react";
import { Save, Loader2, X, Edit2, FileText, Globe, Video, BookOpen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { TRAINING_TITLE_MAX } from "@/lib/training-title";

interface TrainingBlockEditorProps {
  id: string;
  type: string;
  initialContent: string;
  /** Parsed block name, or a positional fallback like "BL01". */
  title?: string;
  /** True when `title` is a real user-given name rather than the fallback. */
  hasCustomTitle?: boolean;
  index: number;
  onSave: (id: string, newContent: string, title: string | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const typeConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  TEXT: { icon: FileText, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  WEBSITE: { icon: Globe, color: 'bg-green-500/10 text-green-600 dark:text-green-400' },
  VIDEO: { icon: Video, color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400' },
  DOCUMENT: { icon: BookOpen, color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
};

export function TrainingBlockEditor({ id, type, initialContent, title, hasCustomTitle, index, onSave, onDelete }: TrainingBlockEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(initialContent);
  // Only a real name is editable text; the positional fallback starts blank so
  // the user names the block rather than "editing" a label we invented.
  const [nameDraft, setNameDraft] = useState(hasCustomTitle ? (title ?? "") : "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const config = typeConfig[type] || typeConfig.TEXT;
  const Icon = config.icon;
  const visualId = `BL${String(index + 1).padStart(2, '0')}`;
  const displayTitle = title || `Bloco de ${type.toLowerCase()}`;

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  useEffect(() => {
    setNameDraft(hasCustomTitle ? (title ?? "") : "");
  }, [title, hasCustomTitle]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(id, content, nameDraft.trim() || null);
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Você tem certeza que deseja excluir este bloco?")) {
      setDeleting(true);
      try {
        await onDelete(id);
      } finally {
        setDeleting(false);
      }
    }
  };

  return (
    <>
      <div 
        onClick={() => setIsEditing(true)}
        className="group p-4 border border-border rounded-xl bg-card hover:border-primary/50 transition-all cursor-pointer flex flex-col sm:flex-row gap-4"
      >
        {/* Visual ID & Icon */}
        <div className="flex items-center sm:items-start gap-3 w-full sm:w-1/4 shrink-0">
          <div className={`p-2 rounded-lg shrink-0 ${config.color}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <div className="font-mono text-xs font-bold text-muted-foreground">{visualId}</div>
            <div className="text-sm font-semibold truncate text-foreground">{displayTitle}</div>
          </div>
        </div>

        {/* Content Preview */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground line-clamp-2 break-words mt-1 sm:mt-0">
            {initialContent || '(sem conteúdo detalhado)'}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-start gap-1 shrink-0 justify-end">
          <Button variant="ghost" size="icon" disabled={deleting} onClick={handleDelete} className="text-muted-foreground hover:text-red-500 hover:bg-red-500/10 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="font-mono text-xs shadow-sm bg-muted/50">{visualId}</Badge>
              <DialogTitle>Editando {displayTitle}</DialogTitle>
            </div>
          </DialogHeader>
          
          <div className="mt-4 space-y-1.5">
            <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
              Nome do bloco
            </label>
            <input
              type="text"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono
                         focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
              value={nameDraft}
              maxLength={TRAINING_TITLE_MAX}
              placeholder={`ex: ${visualId} — opcional`}
              onChange={(e) => setNameDraft(e.target.value)}
            />
          </div>

          <div className="relative mt-3">
            <textarea
              className="w-full min-h-[200px] bg-background border border-border rounded-lg p-4 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, 1200))}
              placeholder="Conteúdo do bloco de treinamento..."
              maxLength={1200}
              autoFocus
            />
            <div className="absolute bottom-3 right-3 flex items-center gap-2 bg-background/90 px-2 py-1 rounded">
              <span className={`text-xs font-mono ${content.length >= 1200 ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
                {content.length}/1200
              </span>
            </div>
          </div>

          <DialogFooter className="mt-4 sm:justify-end gap-2">
            <Button variant="outline" onClick={() => {
              setContent(initialContent);
              setNameDraft(hasCustomTitle ? (title ?? "") : "");
              setIsEditing(false);
            }}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || !content.trim()} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
