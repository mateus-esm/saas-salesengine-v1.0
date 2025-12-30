import { useState } from "react";
import { FileText, Globe, Video, FileBox, Lightbulb } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { AgentTraining } from "@/types/agent";

interface AddTrainingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (training: Omit<AgentTraining, 'id' | 'createdAt'>) => void;
}

type TrainingType = 'TEXT' | 'WEBSITE' | 'VIDEO' | 'DOCUMENT';

const typeOptions = [
  { type: 'TEXT' as TrainingType, icon: FileText, label: 'Texto', description: 'Informações em texto' },
  { type: 'WEBSITE' as TrainingType, icon: Globe, label: 'Website', description: 'URL de página web' },
  { type: 'VIDEO' as TrainingType, icon: Video, label: 'Vídeo', description: 'Link do YouTube' },
  { type: 'DOCUMENT' as TrainingType, icon: FileBox, label: 'Documento', description: 'Upload de PDF' },
];

export function AddTrainingModal({ open, onOpenChange, onAdd }: AddTrainingModalProps) {
  const [selectedType, setSelectedType] = useState<TrainingType>('TEXT');
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const handleSubmit = () => {
    if (!content.trim()) return;
    
    onAdd({
      type: selectedType,
      text: content.trim(),
      image: imageUrl.trim() || undefined,
    });
    
    // Reset form
    setContent('');
    setImageUrl('');
    setSelectedType('TEXT');
    onOpenChange(false);
  };

  const isUrlType = selectedType === 'WEBSITE' || selectedType === 'VIDEO';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="text-xl">Adicionar Treinamento</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Type Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Tipo de Conteúdo</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {typeOptions.map((option) => (
                <button
                  key={option.type}
                  onClick={() => setSelectedType(option.type)}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200",
                    selectedType === option.type
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/30 hover:bg-muted/50"
                  )}
                >
                  <option.icon className={cn(
                    "h-6 w-6",
                    selectedType === option.type ? "text-primary" : "text-muted-foreground"
                  )} />
                  <span className={cn(
                    "text-sm font-medium",
                    selectedType === option.type ? "text-primary" : "text-foreground"
                  )}>
                    {option.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Content Input */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              {isUrlType ? 'URL' : 'Conteúdo'}
            </Label>
            {isUrlType ? (
              <Input
                placeholder={selectedType === 'VIDEO' ? 'https://youtube.com/watch?v=...' : 'https://seusite.com/pagina'}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            ) : (
              <Textarea
                placeholder="Insira as informações de treinamento aqui..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[140px] resize-none"
              />
            )}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
              <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Insira informações de forma objetiva e direta. Evite exemplos de perguntas, cadastre apenas os dados relevantes.
              </p>
            </div>
          </div>

          {/* Image URL (optional) */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Imagem <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <Input
              placeholder="https://exemplo.com/imagem.jpg"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!content.trim()}>
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
