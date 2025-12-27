import { useState } from "react";
import { ChatSession } from "@/types/chat";
import { ChatListItem } from "./ChatListItem";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Inbox, Bot, User, MessageCircle, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExtendedChatSession extends ChatSession {
  leadType?: 'lead' | 'contact' | 'spam' | null;
  responsibleId?: string | null;
}

interface InboxSidebarProps {
  sessions: ExtendedChatSession[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  currentUserId?: string;
}

type FilterType = "all" | "mine" | "unread" | "bot" | "contacts";

export function InboxSidebar({
  sessions,
  selectedSessionId,
  onSelectSession,
  currentUserId,
}: InboxSidebarProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");

  const filters: { id: FilterType; label: string; icon: React.ElementType }[] = [
    { id: "all", label: "Todos", icon: Inbox },
    { id: "mine", label: "Meus", icon: User },
    { id: "unread", label: "Não Lidos", icon: MessageCircle },
    { id: "bot", label: "Bot", icon: Bot },
    { id: "contacts", label: "Contatos", icon: Users },
  ];

  // Filter sessions - exclude contacts/spam from "all" unless specifically viewing "contacts"
  const filteredSessions = sessions.filter((session) => {
    // Search filter
    const matchesSearch =
      session.customerName.toLowerCase().includes(search.toLowerCase()) ||
      session.lastMessage.toLowerCase().includes(search.toLowerCase()) ||
      session.customerPhone.includes(search);

    // Status filter
    let matchesFilter = true;
    switch (filter) {
      case "all":
        // Show only leads (not contacts/spam) in "all"
        matchesFilter = !session.leadType || session.leadType === 'lead';
        break;
      case "mine":
        // Show sessions where user is responsible or handling
        matchesFilter = 
          session.status === "human_handling" || 
          session.responsibleId === currentUserId;
        break;
      case "unread":
        matchesFilter = session.unreadCount > 0;
        break;
      case "bot":
        matchesFilter = session.status === "bot_handling";
        break;
      case "contacts":
        // Show only contacts (not leads)
        matchesFilter = session.leadType === 'contact' || session.leadType === 'spam';
        break;
    }

    return matchesSearch && matchesFilter;
  });

  const unreadCount = sessions.filter((s) => s.unreadCount > 0).length;

  return (
    <div className="h-full flex flex-col border-r border-border bg-card">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <h2 className="font-semibold text-lg mb-3 flex items-center gap-2">
          <Inbox className="h-5 w-5 text-primary" />
          Inbox
          {unreadCount > 0 && (
            <Badge className="ml-auto">{unreadCount}</Badge>
          )}
        </h2>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar conversas..."
            className="pl-9 h-9"
          />
        </div>

        {/* Filter badges */}
        <div className="flex gap-1.5 mt-3 flex-wrap">
          {filters.map(({ id, label, icon: Icon }) => (
            <Badge
              key={id}
              variant={filter === id ? "default" : "outline"}
              className={cn(
                "cursor-pointer gap-1 transition-colors",
                filter === id && "bg-primary"
              )}
              onClick={() => setFilter(id)}
            >
              <Icon className="h-3 w-3" />
              {label}
            </Badge>
          ))}
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
