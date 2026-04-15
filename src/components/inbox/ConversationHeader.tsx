import { ChatSession } from "@/types/chat";
import { TeamMember } from "@/types/crm";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, Hand, User, ChevronLeft, UserCheck, UserX } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PipelineStage } from "@/hooks/usePipelineStages";

interface ConversationHeaderProps {
  session: ChatSession & { responsibleId?: string };
  stages: PipelineStage[];
  teamMembers?: TeamMember[];
  onToggleHandoff: () => void;
  onUpdateCRM: (data: Partial<ChatSession['crmData']>) => void;
  onAssignResponsible?: (userId: string | null) => void;
  onBack?: () => void;
  onOpenLeadDetails?: () => void;
}

export function ConversationHeader({ session, stages, teamMembers = [], onToggleHandoff, onUpdateCRM, onAssignResponsible, onBack, onOpenLeadDetails }: ConversationHeaderProps) {
  const initials = session.customerName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const isBotHandling = session.status === "bot_handling";

  // Current responsible member
  const responsibleMember = teamMembers.find(m => m.id === (session as any).responsibleId);
  const responsibleInitials = responsibleMember?.nome_completo
    ?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';

  // Canal badge label + estilo
  const channelLabel = (ch?: string): { label: string; cls: string } => {
    switch (ch) {
      case 'instagram': return { label: 'IG',        cls: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300' };
      case 'telegram':  return { label: 'Telegram',  cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300' };
      case 'web':       return { label: 'Web',        cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' };
      case 'messenger': return { label: 'Messenger', cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300' };
      default:          return { label: 'WA',         cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' };
    }
  };
  const ch = channelLabel(session.channel);

  return (
    <div className="flex items-center justify-between p-3 border-b border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900">
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

        {/* Avatar and Info Block */}
        <button 
          onClick={onOpenLeadDetails}
          className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity focus:outline-none"
        >
          <div className="relative">
            <Avatar className="h-10 w-10">
              {session.customerAvatar && (
                <AvatarImage
                  src={session.customerAvatar}
                  alt={session.customerName}
                  className="object-cover"
                />
              )}
              <AvatarFallback className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
            {session.isOnline && (
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {session.customerName}
              </span>
              {/* Canal badge */}
              <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 h-4 font-mono ${ch.cls}`}>
                {ch.label}
              </Badge>
              {session.isOnline ? (
                <Badge variant="secondary" className="text-xs bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  Online
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  Offline
                </Badge>
              )}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{session.customerPhone}</p>
          </div>
        </button>
      </div>

      <div className="flex items-center gap-2">
        {/* Quick Actions Area */}
        <div className="hidden md:flex items-center gap-2 mr-2 pr-2 border-r border-border/50">

          {/* Responsible Assignment */}
          {onAssignResponsible && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2"
                  title="Atribuir responsável"
                >
                  {responsibleMember ? (
                    <>
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[9px] bg-primary text-primary-foreground">
                          {responsibleInitials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="hidden lg:inline max-w-[80px] truncate">
                        {responsibleMember.nome_completo?.split(' ')[0]}
                      </span>
                    </>
                  ) : (
                    <>
                      <UserCheck className="h-4 w-4" />
                      <span className="hidden lg:inline">Atribuir</span>
                    </>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-xs">Responsável</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {teamMembers.map(member => (
                  <DropdownMenuItem
                    key={member.id}
                    onClick={() => onAssignResponsible(member.id)}
                    className="gap-2"
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-[10px]">
                        {member.nome_completo?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm truncate">{member.nome_completo || member.email}</span>
                    {(session as any).responsibleId === member.id && (
                      <UserCheck className="h-3.5 w-3.5 ml-auto text-primary" />
                    )}
                  </DropdownMenuItem>
                ))}
                {(session as any).responsibleId && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onAssignResponsible(null)}
                      className="gap-2 text-muted-foreground"
                    >
                      <UserX className="h-3.5 w-3.5" />
                      Remover responsável
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

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
