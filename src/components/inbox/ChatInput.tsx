import { useState, useRef, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Paperclip, Smile, Mic, Send, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import EmojiPicker, { EmojiClickData, Theme } from "emoji-picker-react";
import { useTheme } from "next-themes";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder = "Digite sua mensagem..." }: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { theme } = useTheme();

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    // Auto-resize
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newMessage = message.substring(0, start) + emojiData.emoji + message.substring(end);
      setMessage(newMessage);
      
      // Mover cursor para depois do emoji
      setTimeout(() => {
        textarea.focus();
        const newPosition = start + emojiData.emoji.length;
        textarea.setSelectionRange(newPosition, newPosition);
      }, 0);
    } else {
      setMessage(prev => prev + emojiData.emoji);
    }
    setEmojiPickerOpen(false);
  };

  const toggleRecording = () => {
    setIsRecording(!isRecording);
    // TODO: Implement actual audio recording
  };

  return (
    <div className={cn(
      "border-t border-border bg-card p-3",
      disabled && "opacity-50"
    )}>
      <div className="flex items-end gap-2">
        {/* Action buttons */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
            disabled={disabled}
          >
            <Paperclip className="h-5 w-5" />
          </Button>
          
          {/* Emoji Picker */}
          <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-foreground"
                disabled={disabled}
              >
                <Smile className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent 
              className="w-auto p-0 border-none" 
              side="top" 
              align="start"
            >
              <EmojiPicker
                onEmojiClick={handleEmojiClick}
                theme={theme === 'dark' ? Theme.DARK : Theme.LIGHT}
                width={320}
                height={400}
                searchPlaceHolder="Buscar emoji..."
                previewConfig={{ showPreview: false }}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Text input */}
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="min-h-[40px] max-h-[120px] resize-none pr-12 py-2.5"
          />
        </div>

        {/* Send / Record buttons */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-9 w-9",
              isRecording 
                ? "text-destructive hover:text-destructive" 
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={toggleRecording}
            disabled={disabled}
          >
            {isRecording ? (
              <MicOff className="h-5 w-5" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </Button>

          <Button
            size="icon"
            className="h-9 w-9"
            onClick={handleSend}
            disabled={disabled || !message.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
