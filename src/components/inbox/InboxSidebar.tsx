import { useState, useMemo } from "react";
import { ChatSession, ConversationStatus } from "@/types/chat";
import { ChatListItem } from "./ChatListItem";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Inbox,
  MessageCircle,
  MessageSquareDot,
  Archive,
  Inbox as InboxIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TeamMember } from "@/types/crm";

interface ExtendedChatSession extends ChatSession {
  leadType?: "lead" | "contact" | "spam" | null;
  responsibleId?: string | null;
}

interface InboxSidebarProps {
  sessions: ExtendedChatSession[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onStatusChange?: (sessionId: string, status: ConversationStatus) => void;
  currentUserId?: string;
  /** Admins/Owners see all chats; regular sellers only see theirs */
  isAdmin?: boolean;
  /** Team members for the Responsible filter dropdown */
  teamMembers?: TeamMember[];
}

type StatusTab = "active" | "archived";

// Special sentinel values for the Responsible filter
const RESP_ALL = "__all__";
const RESP_MINE = "__mine__";
const RESP_AI = "__ai__";
const RESP_UNASSIGNED = "__unassigned__";

const CHANNEL_ALL = "__all__";
const CHANNEL_OPTIONS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "telegram", label: "Telegram" },
  { value: "web", label: "Web" },
  { value: "messenger", label: "Messenger" },
];

export function InboxSidebar({
  sessions,
  selectedSessionId,
  onSelectSession,
  onStatusChange,
  currentUserId,
  isAdmin = true,
  teamMembers = [],
}: InboxSidebarProps) {
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState<StatusTab>("active");
  const [channelFilter, setChannelFilter] = useState<string>(CHANNEL_ALL);
  const [responsibleFilter, setResponsibleFilter] = useState<string>(
    isAdmin ? RESP_ALL : RESP_MINE
  );
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  // Non-admin sellers only see their own chats — enforced regardless of filter
  const visibleSessions = isAdmin
    ? sessions
    : sessions.filter(
        (s) => !s.responsibleId || s.responsibleId === currentUserId
      );

  const teamMemberById = useMemo(() => {
    const map = new Map<string, string>();
    teamMembers.forEach((m) =>
      map.set(m.id, m.nome_completo || m.email || "Sem nome")
    );
    return map;
  }, [teamMembers]);

  const filteredSessions = visibleSessions.filter((session) => {
    // Status tab — "deleted" is always hidden in v1
    const sessionConvStatus: ConversationStatus =
      session.conversationStatus || "active";
    if (sessionConvStatus === "deleted") return false;
    if (sessionConvStatus !== statusTab) return false;

    // Search
    const matchesSearch =
      session.customerName.toLowerCase().includes(search.toLowerCase()) ||
      session.lastMessage.toLowerCase().includes(search.toLowerCase()) ||
      session.customerPhone.includes(search);
    if (!matchesSearch) return false;

    // Channel
    if (channelFilter !== CHANNEL_ALL && session.channel !== channelFilter) {
      return false;
    }

    // Responsible
    switch (responsibleFilter) {
      case RESP_ALL:
        break;
      case RESP_MINE:
        if (session.responsibleId !== currentUserId) return false;
        break;
      case RESP_AI:
        if (session.status !== "bot_handling") return false;
        break;
      case RESP_UNASSIGNED:
        if (session.responsibleId) return false;
        break;
      default:
        if (session.responsibleId !== responsibleFilter) return false;
    }

    // Unread
    if (showUnreadOnly && session.unreadCount === 0) return false;

    return true;
  });

  const unreadCount = visibleSessions.filter((s) => s.unreadCount > 0).length;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="p-3 divider-idv-bottom space-y-3">
        <h2 className="font-semibold text-base flex items-center gap-2 text-slate-800 dark:text-slate-200">
          <Inbox className="h-4 w-4 text-primary" />
          Inbox
        </h2>

        {/* Search + Unread toggle */}
        <div className="flex items-center justify-between gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversas..."
              className="pl-9 h-8 text-sm bg-slate-50 dark:bg-zinc-900/60 border-slate-200/50 dark:border-white/5 focus-visible:ring-primary"
            />
          </div>
          <Button
            variant={showUnreadOnly ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-8 px-2 gap-1.5 border border-slate-200/50 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors",
              showUnreadOnly &&
                "bg-gradient-to-r from-solo-orange to-solo-yellow border-0 text-white shadow-md"
            )}
            onClick={() => setShowUnreadOnly(!showUnreadOnly)}
            title="Filtrar não lidas"
          >
            <MessageSquareDot className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="font-mono text-[10px] leading-tight px-1.5 py-0.5 rounded-full bg-background/20">
                {unreadCount}
              </span>
            )}
          </Button>
        </div>

        {/* Status tabs */}
        <div className="flex items-center rounded-md border border-slate-200/60 dark:border-white/5 p-0.5 bg-slate-50 dark:bg-zinc-900/60">
          <button
            onClick={() => setStatusTab("active")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 text-xs py-1 rounded transition-colors",
              statusTab === "active"
                ? "bg-white dark:bg-white/[0.06] text-slate-900 dark:text-slate-100 shadow-sm dark:ring-1 dark:ring-white/10 border-b-2 border-b-solo-orange"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            )}
          >
            <InboxIcon className="h-3 w-3" />
            Ativas
          </button>
          <button
            onClick={() => setStatusTab("archived")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 text-xs py-1 rounded transition-colors",
              statusTab === "archived"
                ? "bg-white dark:bg-white/[0.06] text-slate-900 dark:text-slate-100 shadow-sm dark:ring-1 dark:ring-white/10"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            )}
          >
            <Archive className="h-3 w-3" />
            Arquivadas
          </button>
        </div>

        {/* Channel + Responsible filters */}
        <div className="grid grid-cols-2 gap-2">
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Canal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CHANNEL_ALL}>Todos os canais</SelectItem>
              <SelectSeparator />
              {CHANNEL_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={responsibleFilter}
            onValueChange={setResponsibleFilter}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Responsável" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={RESP_ALL}>Todos os chats</SelectItem>
                <SelectItem value={RESP_MINE}>Meus chats</SelectItem>
                <SelectItem value={RESP_AI}>Gerenciado pela IA</SelectItem>
                <SelectItem value={RESP_UNASSIGNED}>Sem responsável</SelectItem>
              </SelectGroup>
              {teamMembers.length > 0 && (
                <>
                  <SelectSeparator />
                  <SelectGroup>
                    {teamMembers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.nome_completo || m.email || "Sem nome"}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Chat List */}
      <ScrollArea className="flex-1">
        {filteredSessions.length > 0 ? (
          filteredSessions.map((session) => (
            <ChatListItem
              key={session.id}
              session={session}
              isSelected={session.id === selectedSessionId}
              onClick={() => onSelectSession(session.id)}
              responsibleName={
                session.responsibleId
                  ? teamMemberById.get(session.responsibleId)
                  : undefined
              }
              conversationStatus={session.conversationStatus || "active"}
              onStatusChange={
                onStatusChange
                  ? (status) => onStatusChange(session.id, status)
                  : undefined
              }
            />
          ))
        ) : (
          <div className="p-6 text-center text-muted-foreground">
            <MessageCircle className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhuma conversa encontrada</p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
