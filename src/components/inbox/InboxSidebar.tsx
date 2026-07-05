import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChatSession, ConversationStatus } from "@/types/chat";
import { ChatListItem } from "./ChatListItem";
import { InboxBulkActions } from "./InboxBulkActions";
import { prefetchConversationMessages } from "@/hooks/useMessages";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePipelines } from "@/hooks/usePipelines";
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
// T9 — funnel (pipeline) filter sentinel
const FUNNEL_ALL = "__all__";
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
  const [responsibleFilter, setResponsibleFilter] = useState<string>(RESP_ALL);
  const [funnelFilter, setFunnelFilter] = useState<string>(FUNNEL_ALL);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // T9 — Funnel filter. Each session carries the lead's stage_id (crmData.stage);
  // map stage_id -> pipeline_id once so we can segment the inbox by funnel.
  const { profile } = useAuth();
  const { pipelines } = usePipelines();
  const { data: stagePipelineMap } = useQuery({
    queryKey: ["inbox_stage_pipeline_map", profile?.equipe_id],
    enabled: !!profile?.equipe_id,
    queryFn: async (): Promise<Record<string, string>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("pipeline_stages_v2")
        .select("id, pipeline_id")
        .eq("equipe_id", profile!.equipe_id)
        .is("deleted_at", null);
      const map: Record<string, string> = {};
      ((data ?? []) as { id: string; pipeline_id: string }[]).forEach((r) => {
        map[r.id] = r.pipeline_id;
      });
      return map;
    },
  });

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

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

    // Funnel (T9) — derive the session's pipeline from its stage_id
    if (funnelFilter !== FUNNEL_ALL) {
      const stageId = session.crmData?.stage;
      const sessionPipeline = stageId ? stagePipelineMap?.[stageId] : undefined;
      if (sessionPipeline !== funnelFilter) return false;
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

        {/* Channel filter chips */}
        <div className="space-y-2">
          <div className="overflow-x-auto flex gap-1.5 pb-1.5 scrollbar-hide">
            <button
              onClick={() => setChannelFilter(CHANNEL_ALL)}
              className={cn(
                "flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap",
                channelFilter === CHANNEL_ALL
                  ? "bg-gradient-to-r from-solo-orange to-solo-yellow text-white shadow-md"
                  : "bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-zinc-700"
              )}
            >
              Todos
            </button>
            {CHANNEL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setChannelFilter(opt.value)}
                className={cn(
                  "flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap",
                  channelFilter === opt.value
                    ? "bg-gradient-to-r from-solo-orange to-solo-yellow text-white shadow-md"
                    : "bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-zinc-700"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Responsible filter */}
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

        {/* Funnel filter (T9) — segment the inbox by pipeline */}
        {pipelines.length > 0 && (
          <Select value={funnelFilter} onValueChange={setFunnelFilter}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Funil" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FUNNEL_ALL}>Todos os funis</SelectItem>
              <SelectSeparator />
              {pipelines.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Bulk actions bar — visible when at least one conversation is selected.
          Sprint 5.5 1.2: now exposes "Selecionar todas (N)" so operators can
          sweep an entire filtered view (e.g. all 150 spam threads) in two
          clicks instead of one-by-one. */}
      {selectedIds.size > 0 && (
        <InboxBulkActions
          selectedIds={[...selectedIds]}
          visibleIds={filteredSessions.map((s) => s.id)}
          onClearSelection={clearSelection}
          onSelectAllVisible={() =>
            setSelectedIds(new Set(filteredSessions.map((s) => s.id)))
          }
        />
      )}

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
              isChecked={selectedIds.has(session.id)}
              onToggleSelect={() => toggleSelect(session.id)}
              showCheckbox={selectedIds.size > 0}
              onPrefetch={() => {
                void prefetchConversationMessages(session.id);
              }}
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
