import { ChatSession } from "@/types/chat";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, Hand, User } from "lucide-react";

interface ConversationHeaderProps {
  session: ChatSession;
  onToggleHandoff: () => void;
}

export function ConversationHeader({ session, onToggleHandoff }: ConversationHeaderProps) {
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

      {/* Handoff Button */}
      <Button
        onClick={onToggleHandoff}
        variant={isBotHandling ? "default" : "outline"}
        className="gap-2"
      >
        {isBotHandling ? (
          <>
            <Hand className="h-4 w-4" />
            Assumir Atendimento
          </>
        ) : (
          <>
            <Bot className="h-4 w-4" />
            Devolver p/ IA
          </>
        )}
      </Button>
    </div>
  );
}
