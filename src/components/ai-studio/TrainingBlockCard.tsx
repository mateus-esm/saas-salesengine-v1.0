import { FileText, Globe, Video, BookOpen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TrainingBlockCardProps {
  id: string;
  type: string;
  content: string;
  image?: string;
  onDelete: (id: string) => void;
}

const typeConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
  TEXT: { icon: FileText, label: 'Texto', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  WEBSITE: { icon: Globe, label: 'Website', color: 'bg-green-500/10 text-green-600 dark:text-green-400' },
  VIDEO: { icon: Video, label: 'Vídeo', color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400' },
  DOCUMENT: { icon: BookOpen, label: 'Documento', color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
};

export function TrainingBlockCard({ id, type, content, onDelete }: TrainingBlockCardProps) {
  const config = typeConfig[type] || typeConfig.TEXT;
  const Icon = config.icon;

  return (
    <div className="group p-4 border border-border rounded-xl bg-card hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`p-2 rounded-lg shrink-0 ${config.color}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{config.label}</span>
            <p className="text-sm text-card-foreground mt-1 line-clamp-3 break-words">
              {content || '(sem conteúdo)'}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
          onClick={() => onDelete(id)}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
