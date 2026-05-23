import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bot, User, Globe, MessageCircle, MoreVertical, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { ChatSession, ConversationStatus } from "@/types/chat";
import { cn } from "@/lib/utils";
import { isToday, isYesterday, format } from "date-fns";
import { ptBR } from "date-fns/locale";

/** Display labels for each supported channel. */
const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  telegram: "Telegram",
  web: "Web",
  messenger: "Messenger",
};

interface ChatListItemProps {
  session: ChatSession;
  isSelected: boolean;
  onClick: () => void;
  /** Resolved name of the responsible team member (lookup done by parent). */
  responsibleName?: string;
  /** Current conversation status — drives which kebab actions are shown. */
  conversationStatus?: ConversationStatus;
  /** Called when user picks Archive / Reopen / Delete from the kebab. */
  onStatusChange?: (status: ConversationStatus) => void;
  /** Sprint 5.5 EPIC 3 — bulk selection state. When defined, renders checkbox. */
  isChecked?: boolean;
  onToggleSelect?: () => void;
  /** Force the checkbox visible (e.g. when at least one row is selected). */
  showCheckbox?: boolean;
  /** Sprint 5.5 1.3 — fired on hover to warm the message cache. */
  onPrefetch?: () => void;
}

/** Ícone do canal em overlay no canto inferior-direito do avatar */
function ChannelBadge({ channel }: { channel?: string }) {
  if (!channel) return null;

  // WhatsApp — SVG inline para manter sem dependência extra
  if (channel === "whatsapp") {
    return (
      <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-[#25D366] border-2 border-background flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 fill-white" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      </span>
    );
  }

  // Instagram — gradiente roxo/laranja
  if (channel === "instagram") {
    return (
      <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-background flex items-center justify-center"
        style={{ background: "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)" }}>
        <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 fill-white" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
        </svg>
      </span>
    );
  }

  // Telegram — azul
  if (channel === "telegram") {
    return (
      <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-[#2AABEE] border-2 border-background flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 fill-white" xmlns="http://www.w3.org/2000/svg">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
        </svg>
      </span>
    );
  }

  // Web / Widget
  if (channel === "web") {
    return (
      <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-blue-500 border-2 border-background flex items-center justify-center">
        <Globe className="h-2.5 w-2.5 text-white" />
      </span>
    );
  }

  // Fallback genérico
  return (
    <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-muted border-2 border-background flex items-center justify-center">
      <MessageCircle className="h-2.5 w-2.5 text-muted-foreground" />
    </span>
  );
}

export function ChatListItem({
  session,
  isSelected,
  onClick,
  responsibleName,
  conversationStatus,
  onStatusChange,
  isChecked,
  onToggleSelect,
  showCheckbox,
  onPrefetch,
}: ChatListItemProps) {
  const initials = session.customerName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const channelLabel = session.channel
    ? CHANNEL_LABELS[session.channel] || session.channel
    : null;

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

  const checkboxAvailable = !!onToggleSelect;

  return (
    <div
      onClick={onClick}
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
      className={cn(
        "group flex items-start gap-3 p-3 pr-6 cursor-pointer transition-colors divider-idv-bottom",
        isSelected
          ? "bg-sidebar-accent dark:bg-white/[0.04] dark:ring-1 dark:ring-inset dark:ring-white/10"
          : "hover:bg-muted/50 dark:hover:bg-white/[0.02]"
      )}
    >
      {checkboxAvailable && (
        <div
          className={cn(
            "flex items-center pt-1 transition-opacity",
            showCheckbox || isChecked
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100"
          )}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect?.();
          }}
        >
          <Checkbox
            checked={!!isChecked}
            onCheckedChange={() => onToggleSelect?.()}
            aria-label="Selecionar conversa"
          />
        </div>
      )}

      {/* Avatar com channel badge overlay */}
      <div className="relative flex-shrink-0">
        <Avatar className="h-10 w-10">
          {session.customerAvatar && (
            <AvatarImage
              src={session.customerAvatar}
              alt={session.customerName}
              className="object-cover"
            />
          )}
          <AvatarFallback className="bg-secondary text-secondary-foreground text-sm font-medium">
            {initials}
          </AvatarFallback>
        </Avatar>
        {/* Online/Offline dot — top-right */}
        {session.isOnline ? (
          <span className="absolute top-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
        ) : (
          <span className="absolute top-0 right-0 h-2.5 w-2.5 rounded-full bg-slate-400 dark:bg-slate-600 ring-2 ring-background" />
        )}
        {/* Badge do canal — sempre visível */}
        <ChannelBadge channel={session.channel} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center w-full">
          <span className="font-medium text-sm text-foreground truncate min-w-0">
            {session.customerName}
          </span>
          <span className="text-[10px] text-muted-foreground flex-shrink-0 font-mono whitespace-nowrap text-right">
            {timeAgo}
          </span>
          {onStatusChange && (
            <DropdownMenu>
              <DropdownMenuTrigger
                asChild
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="p-0.5 rounded hover:bg-muted text-muted-foreground opacity-60 hover:opacity-100 transition-opacity"
                  aria-label="Ações da conversa"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onClick={(e) => e.stopPropagation()}
              >
                {conversationStatus === "archived" ? (
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
                  Remover
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Channel + Responsible line (Epic 1) */}
        {(channelLabel || responsibleName) && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5 truncate">
            {channelLabel && <span>{channelLabel}</span>}
            {channelLabel && responsibleName && <span>·</span>}
            {responsibleName && (
              <span className="truncate">{responsibleName}</span>
            )}
          </div>
        )}

        <p className="text-sm text-muted-foreground truncate mt-0.5">
          {session.lastMessage}
        </p>

        {/* Badges */}
        <div className="flex items-center gap-2 mt-2">
          {/* Status Badge */}
          {session.status === "bot_handling" ? (
            <Badge variant="secondary" className="gap-1 text-xs bg-gradient-to-r from-solo-orange/15 to-solo-yellow/10 text-orange-700 dark:from-solo-orange/15 dark:to-solo-yellow/10 dark:text-orange-300 ring-1 ring-solo-orange/20">
              <Bot className="h-3 w-3" />
              {session.agentName || 'Solo AI'}
            </Badge>
          ) : session.status === "human_handling" ? (
            <Badge variant="secondary" className="gap-1 text-xs bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300/90 dark:ring-1 dark:ring-orange-500/20">
              <User className="h-3 w-3" />
              {responsibleName || 'Sem Responsável'}
            </Badge>
          ) : null}

          {conversationStatus === "archived" && (
            <Badge
              variant="outline"
              className="gap-1 text-[10px] border-slate-300 text-slate-500"
            >
              <Archive className="h-3 w-3" />
              Arquivada
            </Badge>
          )}

          {/* Unread Badge */}
          {session.unreadCount > 0 && (
            <Badge className="h-5 min-w-5 flex items-center justify-center text-xs bg-gradient-to-br from-solo-orange to-solo-yellow text-white border-0 shadow-sm">
              {session.unreadCount}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
