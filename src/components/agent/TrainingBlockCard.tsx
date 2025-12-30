import { FileText, Globe, Video, FileBox, Trash2, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AgentTraining } from "@/types/agent";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface TrainingBlockCardProps {
  training: AgentTraining;
  onDelete: (id: string) => void;
}

const typeConfig = {
  TEXT: { icon: FileText, label: "Texto", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  WEBSITE: { icon: Globe, label: "Website", color: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
  VIDEO: { icon: Video, label: "Vídeo", color: "bg-red-500/10 text-red-500 border-red-500/20" },
  DOCUMENT: { icon: FileBox, label: "Documento", color: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
};

export function TrainingBlockCard({ training, onDelete }: TrainingBlockCardProps) {
  const config = typeConfig[training.type];
  const Icon = config.icon;
  const isUrl = training.text.startsWith('http');

  return (
    <Card className="group border-border/50 hover:border-border hover:shadow-md transition-all duration-300">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`${config.color} font-medium`}>
                <Icon className="h-3 w-3 mr-1" />
                {config.label}
              </Badge>
              {training.createdAt && (
                <span className="text-xs text-muted-foreground">
                  {format(new Date(training.createdAt), "dd MMM yyyy", { locale: ptBR })}
                </span>
              )}
            </div>
            
            {isUrl ? (
              <a 
                href={training.text} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1 truncate"
              >
                {training.text}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : (
              <p className="text-sm text-foreground/80 line-clamp-3 leading-relaxed">
                {training.text}
              </p>
            )}

            {training.image && (
              <div className="mt-2 p-2 bg-muted/50 rounded-lg flex items-center gap-2">
                <img 
                  src={training.image} 
                  alt="Preview" 
                  className="h-10 w-10 rounded object-cover"
                />
                <span className="text-xs text-muted-foreground truncate">Imagem anexada</span>
              </div>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => onDelete(training.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
