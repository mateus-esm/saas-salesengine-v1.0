import { Message } from "@/types/chat";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bot, User, Image as ImageIcon, FileText, Download, CheckCheck, MoreVertical, Trash2, Pencil } from "lucide-react";
import { formatWhatsAppText } from "@/lib/whatsappFormatter";
import { useState } from "react";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const time = format(message.timestamp, "HH:mm", { locale: ptBR });
  const [imageError, setImageError] = useState(false);
  const [showActions, setShowActions] = useState(false);

  // System message (centered)
  if (message.sender === "system") {
    return (
      <div className="flex justify-center my-4">
        <span className="text-xs text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800/50 px-3 py-1 rounded-full font-mono">
          {message.content}
        </span>
      </div>
    );
  }

  const isCustomer = message.sender === "customer";
  const isAI = message.sender === "ai";
  const isAgent = message.sender === "agent";
  const isOutbound = isAI || isAgent;

  // Renderiza mídia se existir
  const renderMedia = () => {
    if (!message.mediaUrl || !message.mediaType) return null;

    if (message.mediaType === 'image' && !imageError) {
      return (
        <div className="mb-2 w-[240px] sm:w-[280px]">
          <AspectRatio ratio={4 / 3} className="bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden border border-slate-200/50 dark:border-slate-700/50">
            <img
              src={message.mediaUrl}
              alt="Imagem anexa"
              className="object-cover w-full h-full cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => window.open(message.mediaUrl, '_blank')}
              onError={() => setImageError(true)}
            />
          </AspectRatio>
        </div>
      );
    }

    if (message.mediaType === 'image' && imageError) {
      return (
        <div className="mb-2 flex items-center gap-2 text-slate-500 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-md border border-slate-200/50 dark:border-slate-700/50">
          <ImageIcon className="h-4 w-4" />
          <a
            href={message.mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm hover:underline"
          >
            Ver imagem
          </a>
        </div>
      );
    }

    if (message.mediaType === 'audio') {
      return (
        <div className="mb-2">
          <audio controls controlsList="nodownload" className="h-10 w-[240px] sm:w-[260px] opacity-90 hover:opacity-100 transition-opacity">
            <source src={message.mediaUrl} />
            Seu navegador não suporta áudio.
          </audio>
        </div>
      );
    }

    if (message.mediaType === 'video') {
      return (
        <div className="mb-2 w-[240px] sm:w-[280px]">
          <AspectRatio ratio={16 / 9} className="bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden border border-slate-200/50 dark:border-slate-700/50">
            <video
              controls
              className="w-full h-full object-cover"
            >
              <source src={message.mediaUrl} />
              Seu navegador não suporta vídeo.
            </video>
          </AspectRatio>
        </div>
      );
    }

    if (message.mediaType === 'document') {
      return (
        <div className="mb-2">
          <a
            href={message.mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-md border border-slate-200/50 dark:border-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors group max-w-[280px]"
          >
            <div className="h-8 w-8 bg-primary/10 rounded-md flex items-center justify-center flex-shrink-0">
               <FileText className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-slate-800 dark:text-slate-200">Documento Anexo</p>
              <p className="text-[10px] text-slate-400 font-mono">Clique para baixar</p>
            </div>
            <Download className="h-4 w-4 text-slate-400 group-hover:text-primary transition-colors flex-shrink-0" />
          </a>
        </div>
      );
    }

    return null;
  };

  // 3.2 — Read receipt checks (WhatsApp-style)
  const renderReadReceipt = () => {
    if (!isOutbound) return null;

    const isRead = !!message.readAt;
    return (
      <CheckCheck
        className={cn(
          "h-3.5 w-3.5 inline-block ml-1",
          isRead
            ? "text-blue-500"
            : isAgent
              ? "text-primary-foreground/40"
              : "text-slate-300 dark:text-slate-500"
        )}
      />
    );
  };

  // 3.3 — Action menu for agent messages (disabled items, V2 prep)
  const renderActionMenu = () => {
    if (!isAgent) return null;

    return (
      <div
        className={cn(
          "absolute -left-8 top-1 transition-opacity duration-150",
          showActions ? "opacity-100" : "opacity-0"
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-slate-200/80 dark:hover:bg-slate-700/80 transition-colors">
              <MoreVertical className="h-3.5 w-3.5 text-slate-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[180px]">
            <DropdownMenuItem disabled className="gap-2 text-slate-400 cursor-not-allowed">
              <Pencil className="h-3.5 w-3.5" />
              Editar Mensagem
              <Badge variant="secondary" className="ml-auto text-[9px] px-1 py-0">V2</Badge>
            </DropdownMenuItem>
            <DropdownMenuItem disabled className="gap-2 text-slate-400 cursor-not-allowed">
              <Trash2 className="h-3.5 w-3.5" />
              Apagar Mensagem
              <Badge variant="secondary" className="ml-auto text-[9px] px-1 py-0">V2</Badge>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  return (
    <div
      className={cn(
        "flex gap-2 mb-3 group",
        isCustomer ? "justify-start" : "justify-end"
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Customer avatar on left */}
      {isCustomer && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
          <User className="h-3.5 w-3.5 text-slate-400" />
        </div>
      )}

      {/* Bubble wrapper — max-w HERE so it's % of the flex row */}
      <div className="relative max-w-[72%]">
        {/* 3.3 — Action menu */}
        {renderActionMenu()}

        {/* 3.1 — Sober & Elegant bubble — always light mode colors */}
        <div
          className={cn(
            "px-3.5 py-2.5 shadow-sm",
            isCustomer && "bg-white border border-slate-200 text-slate-800 rounded-lg rounded-tl-sm",
            isAI && "bg-slate-50 border border-slate-200 text-slate-800 rounded-lg rounded-tr-sm",
            isAgent && "bg-primary text-primary-foreground rounded-lg rounded-tr-sm"
          )}
        >
          {/* Agent name — mostra sempre com fallback */}
          {isAgent && (
            <p className="text-xs font-medium opacity-80 mb-1">
              {message.senderName || 'Agente'}
            </p>
          )}

          {/* AI label — usa o nome real do assistente quando disponível */}
          {isAI && (
            <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mb-1 uppercase tracking-wider">
              {message.senderName || 'Assistente IA'}
            </p>
          )}

          {/* Media content */}
          {renderMedia()}

          {/* Message content with WhatsApp formatting */}
          {message.content && (
            <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
              {formatWhatsAppText(message.content)}
            </div>
          )}

          {/* 3.1 Timestamp + 3.2 Read Receipt */}
          <p
            className={cn(
              "text-[10px] mt-1.5 text-right font-mono flex items-center justify-end gap-0.5",
              isCustomer && "text-slate-400 dark:text-slate-500",
              isAI && "text-slate-400 dark:text-slate-500",
              isAgent && "text-primary-foreground/60"
            )}
          >
            {time}
            {renderReadReceipt()}
          </p>
        </div>
      </div>

      {/* AI/Agent icon on right */}
      {!isCustomer && (
        <div
          className={cn(
            "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center",
            isAI && "bg-slate-100",
            isAgent && "bg-primary"
          )}
        >
          {isAI ? (
            <Bot className="h-3.5 w-3.5 text-slate-500" />
          ) : (
            <User className="h-3.5 w-3.5 text-primary-foreground" />
          )}
        </div>
      )}
    </div>
  );
}
