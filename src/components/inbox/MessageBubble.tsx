import { Message } from "@/types/chat";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bot, User, Image as ImageIcon, FileAudio } from "lucide-react";
import { formatWhatsAppText } from "@/lib/whatsappFormatter";
import { useState } from "react";

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const time = format(message.timestamp, "HH:mm", { locale: ptBR });
  const [imageError, setImageError] = useState(false);

  // System message (centered)
  if (message.sender === "system") {
    return (
      <div className="flex justify-center my-4">
        <span className="text-xs text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  const isCustomer = message.sender === "customer";
  const isAI = message.sender === "ai";
  const isAgent = message.sender === "agent";

  // Renderiza mídia se existir
  const renderMedia = () => {
    if (!message.mediaUrl || !message.mediaType) return null;

    if (message.mediaType === 'image' && !imageError) {
      return (
        <div className="mb-2">
          <img
            src={message.mediaUrl}
            alt="Imagem"
            className="rounded-lg max-w-full max-h-64 object-contain cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => window.open(message.mediaUrl, '_blank')}
            onError={() => setImageError(true)}
          />
        </div>
      );
    }

    if (message.mediaType === 'image' && imageError) {
      return (
        <div className="mb-2 flex items-center gap-2 text-muted-foreground">
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
          <audio controls className="w-full max-w-[250px]">
            <source src={message.mediaUrl} />
            Seu navegador não suporta áudio.
          </audio>
        </div>
      );
    }

    if (message.mediaType === 'video') {
      return (
        <div className="mb-2">
          <video 
            controls 
            className="rounded-lg max-w-full max-h-64"
          >
            <source src={message.mediaUrl} />
            Seu navegador não suporta vídeo.
          </video>
        </div>
      );
    }

    if (message.mediaType === 'document') {
      return (
        <div className="mb-2 flex items-center gap-2">
          <FileAudio className="h-4 w-4" />
          <a 
            href={message.mediaUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-sm hover:underline"
          >
            Baixar documento
          </a>
        </div>
      );
    }

    return null;
  };

  return (
    <div
      className={cn(
        "flex gap-2 mb-3",
        isCustomer ? "justify-start" : "justify-end"
      )}
    >
      {/* Customer avatar on left */}
      {isCustomer && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
          <User className="h-4 w-4 text-muted-foreground" />
        </div>
      )}

      <div
        className={cn(
          "max-w-[70%] rounded-2xl px-4 py-2.5",
          isCustomer && "bg-muted text-foreground rounded-tl-sm",
          isAI && "bg-purple-100 text-purple-900 dark:bg-purple-900 dark:text-purple-100 rounded-tr-sm",
          isAgent && "bg-primary text-primary-foreground rounded-tr-sm"
        )}
      >
        {/* Agent name */}
        {isAgent && message.senderName && (
          <p className="text-xs font-medium opacity-80 mb-1">
            {message.senderName}
          </p>
        )}

        {/* Media content */}
        {renderMedia()}

        {/* Message content with WhatsApp formatting */}
        {message.content && (
          <div className="text-sm whitespace-pre-wrap break-words">
            {formatWhatsAppText(message.content)}
          </div>
        )}

        {/* Timestamp */}
        <p
          className={cn(
            "text-[10px] mt-1 text-right",
            isCustomer && "text-muted-foreground",
            isAI && "text-purple-600 dark:text-purple-300",
            isAgent && "text-primary-foreground/70"
          )}
        >
          {time}
        </p>
      </div>

      {/* AI/Agent icon on right */}
      {!isCustomer && (
        <div
          className={cn(
            "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
            isAI && "bg-purple-200 dark:bg-purple-800",
            isAgent && "bg-primary"
          )}
        >
          {isAI ? (
            <Bot className="h-4 w-4 text-purple-700 dark:text-purple-300" />
          ) : (
            <User className="h-4 w-4 text-primary-foreground" />
          )}
        </div>
      )}
    </div>
  );
}
