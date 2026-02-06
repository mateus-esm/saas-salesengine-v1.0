import { ChatSession } from "@/types/chat";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, Hand, User, ChevronLeft } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { PipelineStage } from "@/hooks/usePipelineStages";

interface ConversationHeaderProps {
  session: ChatSession;
  stages: PipelineStage[];
  onToggleHandoff: () => void;
  onUpdateCRM: (data: Partial<ChatSession['crmData']>) => void;
  onBack?: () => void;
}

export function ConversationHeader({ session, onToggleHandoff, onBack }: ConversationHeaderProps) {
  const initials = session.customerName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const isBotHandling = session.status === "bot_handling";

  return (
    <div className="flex items-center justify-between p-3 border-b border-border bg-card">
      <div className="flex items-center gap-3">
        {/* Back Button (Mobile) */}
        {onBack && (
          <Button 
            variant="ghost" 
            size="icon" 
            className="lg:hidden mr-1"
            onClick={onBack}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}

        {/* Avatar */}
        <div className="relative">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary/10 text-primary font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          {session.isOnline && (
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-card" />
          )}
        </div>

        {/* Info */}
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">
              {session.customerName}
            </span>
            {session.isOnline ? (
              <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                Online
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                Offline
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{session.customerPhone}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Quick Actions Area */}
        <div className="hidden md:flex items-center gap-2 mr-2 pr-2 border-r border-border/50">
          
          {/* Stage Selector */}
          <Select 
            value={session.crmData.stage} 
            onValueChange={(value) => onUpdateCRM({ stage: value })}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs bg-muted/50 border-none shadow-none focus:ring-0">
              <SelectValue placeholder="Etapa" />
            </SelectTrigger>
            <SelectContent>
              {stages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-2 h-2 rounded-full" 
                      style={{ backgroundColor: stage.color }}
                    />
                    {stage.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Value Editor (Popover) */}
          <Popover>
            <PopoverTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 text-xs font-mono text-muted-foreground hover:text-foreground"
              >
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(session.crmData.value || 0)}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2">
              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground">Valor da Oportunidade</span>
                <Input
                  type="number" 
                  placeholder="0.00"
                  defaultValue={session.crmData.value}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onUpdateCRM({ value: parseFloat(e.currentTarget.value) });
                      // Close popover logic would be nice here but keeping it simple for now
                    }
                  }}
                  onBlur={(e) => {
                      onUpdateCRM({ value: parseFloat(e.target.value) });
                  }}
                />
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Handoff Button */}
        <Button
          onClick={onToggleHandoff}
          variant={isBotHandling ? "default" : "outline"}
          size="sm"
          className="gap-2 h-8"
        >
          {isBotHandling ? (
            <>
              <Hand className="h-4 w-4" />
              <span className="hidden sm:inline">Assumir</span>
            </>
          ) : (
            <>
              <Bot className="h-4 w-4" />
              <span className="hidden sm:inline">Devolver</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
