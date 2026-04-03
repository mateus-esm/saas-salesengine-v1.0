import { Message } from "@/types/chat";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bot, User, Image as ImageIcon, FileText, Download } from "lucide-react";
import { formatWhatsAppText } from "@/lib/whatsappFormatter";
import { useState } from "react";
import { AspectRatio } from "@/components/ui/aspect-ratio";

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
        <div className="mb-2 w-[240px] sm:w-[280px]">
          <AspectRatio ratio={4 / 3} className="bg-muted rounded-lg overflow-hidden border border-border/50">
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
        <div className="mb-2 flex items-center gap-2 text-muted-foreground bg-muted/50 p-2 rounded-lg border border-border/50">
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
          <AspectRatio ratio={16 / 9} className="bg-muted rounded-lg overflow-hidden border border-border/50">
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
            className="flex items-center gap-3 p-3 bg-background/50 rounded-lg border border-border/50 hover:bg-background/80 transition-colors group max-w-[280px]"
          >
            <div className="h-8 w-8 bg-primary/10 rounded-md flex items-center justify-center flex-shrink-0">
               <FileText className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Documento Anexo</p>
              <p className="text-[10px] text-muted-foreground">Clique para baixar</p>
            </div>
            <Download className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
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
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-secondary flex items-center justify-center">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}

      <div
        className={cn(
          "max-w-[70%] rounded-xl px-3.5 py-2.5",
          isCustomer && "bg-card border border-border text-foreground rounded-tl-sm",
          isAI && "bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 text-foreground rounded-tr-sm",
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
            "text-[10px] mt-1.5 text-right font-mono",
            isCustomer && "text-muted-foreground",
            isAI && "text-purple-500 dark:text-purple-400",
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
            "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center",
            isAI && "bg-purple-100 dark:bg-purple-900",
            isAgent && "bg-primary"
          )}
        >
          {isAI ? (
            <Bot className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
          ) : (
            <User className="h-3.5 w-3.5 text-primary-foreground" />
          )}
        </div>
      )}
    </div>
  );
}
