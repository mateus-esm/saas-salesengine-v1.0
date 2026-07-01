import { ChatSession, ConversationStatus } from "@/types/chat";
import { TeamMember } from "@/types/crm";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  Hand,
  User,
  ChevronLeft,
  UserCheck,
  UserX,
  MoreVertical,
  Archive,
  ArchiveRestore,
  Trash2,
  RefreshCw,
} from "lucide-react";
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
import { cn } from "@/lib/utils";

interface ConversationHeaderProps {
  session: ChatSession & { responsibleId?: string };
  teamMembers?: TeamMember[];
  onToggleHandoff: () => void;
  onUpdateCRM: (data: Partial<ChatSession['crmData']>) => void;
  onAssignResponsible?: (userId: string | null) => void;
  onBack?: () => void;
  onOpenLeadDetails?: () => void;
  /** Epic 1: change the conversation lifecycle status */
  onStatusChange?: (status: ConversationStatus) => void;
  onSyncHistory?: () => Promise<void>;
  isSyncingHistory?: boolean;
}

export function ConversationHeader({
  session,
  teamMembers = [],
  onToggleHandoff,
  onUpdateCRM,
  onAssignResponsible,
  onBack,
  onOpenLeadDetails,
  onStatusChange,
  onSyncHistory,
  isSyncingHistory = false,
}: ConversationHeaderProps) {

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
    <div className="flex items-center justify-between p-3 divider-idv-bottom bg-white dark:bg-zinc-950">
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
              <AvatarFallback className="bg-slate-100 dark:bg-zinc-900 text-slate-600 dark:text-slate-400 font-medium ring-1 ring-orange-500/30">
                {initials}
              </AvatarFallback>
            </Avatar>
            {session.isOnline ? (
              <span className="absolute bottom-0 right-0 flex h-3 w-3 items-center justify-center">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 ring-2 ring-white dark:ring-zinc-950"></span>
              </span>
            ) : (
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-600 ring-2 ring-white dark:ring-zinc-950" />
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
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20 flex items-center gap-1.5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                  </span>
                  Online (24h)
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-amber-50 text-amber-700 ring-1 ring-amber-300/50 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20">
                  Janela Fechada
                </Badge>
              )}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{session.customerPhone}</p>
          </div>
        </button>
      </div>

      <div className="flex items-center gap-2">
        {/* Quick Actions Area */}
        <div
          className="hidden md:flex items-center gap-2 mr-2 pr-2 border-r"
          style={{
            borderImage: "linear-gradient(180deg, hsla(14,100%,56%,0.25), hsla(48,91%,53%,0.14)) 1",
          }}
        >

          {/* Sync Chat History Button */}
          {onSyncHistory && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSyncHistory}
              disabled={isSyncingHistory}
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2"
              title="Sincronizar histórico com GPT Maker"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isSyncingHistory && "animate-spin")} />
              <span className="hidden lg:inline">{isSyncingHistory ? "Sincronizando..." : "Sincronizar"}</span>
            </Button>
          )}

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
                        <AvatarFallback className="text-[9px] bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200 ring-1 ring-white/10">
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

          {/* Sprint 5.5 polish #2 — Stage selector removed from the chat
              header. Stage now lives only in the CRM sidebar (per
              Opportunity in LeadOpportunitiesSection), which is the
              canonical source. Having it twice was a redundant click target
              and made it easy to write to the legacy lead.stage_id while
              the opportunity stage stayed unchanged. */}

          {/* T14 — R$ value tracker removed from the chat bar. Deal financials
              now live exclusively in the right CRM context panel. */}
        </div>

        {/* T14 — Hybrid handover control. When a human is in the loop, surface
            a warning badge and make "Devolver Controle ao Agente" prominent. */}
        {!isBotHandling && (
          <Badge
            variant="outline"
            className="hidden sm:flex items-center gap-1 h-7 px-2 text-[11px] bg-amber-50 text-amber-700 ring-1 ring-amber-300/50 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20"
          >
            <User className="h-3 w-3" />
            Vendedor no Loop
          </Badge>
        )}
        <Button
          onClick={onToggleHandoff}
          variant={isBotHandling ? "outline" : "default"}
          size="sm"
          className={cn(
            "gap-2 h-8",
            !isBotHandling &&
              "bg-gradient-to-r from-solo-orange to-solo-yellow hover:from-solo-orange/90 hover:to-solo-yellow/90 text-white border-0 shadow-md"
          )}
        >
          {isBotHandling ? (
            <>
              <Hand className="h-4 w-4" />
              <span className="hidden sm:inline">Assumir</span>
            </>
          ) : (
            <>
              <Bot className="h-4 w-4" />
              <span className="hidden sm:inline">Devolver Controle ao Agente</span>
            </>
          )}
        </Button>

        {/* Conversation status actions (Epic 1) */}
        {onStatusChange && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Ações da conversa"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs">Conversa</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {session.conversationStatus === "archived" ? (
                <DropdownMenuItem onClick={() => onStatusChange("active")}>
                  <ArchiveRestore className="h-4 w-4 mr-2" />
                  Reabrir
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => onStatusChange("archived")}>
                  <Archive className="h-4 w-4 mr-2" />
                  Arquivar
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onStatusChange("deleted")}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remover conversa
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
