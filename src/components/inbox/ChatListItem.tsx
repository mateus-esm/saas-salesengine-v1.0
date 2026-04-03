import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Bot, User } from "lucide-react";
import { ChatSession } from "@/types/chat";
import { cn } from "@/lib/utils";
import { isToday, isYesterday, format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ChatListItemProps {
  session: ChatSession;
  isSelected: boolean;
  onClick: () => void;
}

export function ChatListItem({ session, isSelected, onClick }: ChatListItemProps) {
  const initials = session.customerName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const getFormattedDate = (date: Date) => {
    if (isToday(date)) {
      return format(date, "HH:mm");
    }
    if (isYesterday(date)) {
      return "Ontem";
    }
    return format(date, "dd/MM/yyyy");
  };

  const timeAgo = getFormattedDate(session.lastMessageTime);

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 p-3 pr-6 cursor-pointer transition-colors border-b border-border/50",
        isSelected
          ? "bg-sidebar-accent"
          : "hover:bg-muted/50"
      )}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-secondary text-secondary-foreground text-sm font-medium">
            {initials}
          </AvatarFallback>
        </Avatar>
        {session.isOnline && (
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-background" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-sm text-foreground truncate flex-1 min-w-0">
            {session.customerName}
          </span>
          <span className="text-[10px] text-muted-foreground flex-shrink-0 font-mono whitespace-nowrap ml-2">
            {timeAgo}
          </span>
        </div>

        <p className="text-sm text-muted-foreground truncate mt-0.5">
          {session.lastMessage}
        </p>

        {/* Badges */}
        <div className="flex items-center gap-2 mt-2">
          {/* Status Badge */}
          {session.status === "bot_handling" ? (
            <Badge variant="secondary" className="gap-1 text-xs bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
              <Bot className="h-3 w-3" />
              IA
            </Badge>
          ) : session.status === "human_handling" ? (
            <Badge variant="secondary" className="gap-1 text-xs bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">
              <User className="h-3 w-3" />
              Humano
            </Badge>
          ) : null}

          {/* Unread Badge */}
          {session.unreadCount > 0 && (
            <Badge className="h-5 min-w-5 flex items-center justify-center text-xs bg-primary">
              {session.unreadCount}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
