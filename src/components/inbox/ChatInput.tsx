import { useState, useRef, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Paperclip, Smile, Mic, Send, MicOff, X, Loader2, StopCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import EmojiPicker, { EmojiClickData, Theme } from "emoji-picker-react";
import { useTheme } from "next-themes";

import { useMediaUpload, MediaType } from "@/hooks/useMediaUpload";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";

interface ChatInputProps {
  onSend: (message: string, media?: { url: string; type: MediaType }) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder = "Digite sua mensagem..." }: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { theme } = useTheme();

  const { uploadFile, isUploading } = useMediaUpload();
  const { isRecording, recordingTime, startRecording, stopRecording, cancelRecording } = useAudioRecorder();

  const handleSend = () => {
    if (message.trim() && !disabled && !isUploading && !isRecording) {
      onSend(message.trim());
      setMessage("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const result = await uploadFile(file);
      if (result) {
        onSend("", result);
      }
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleStopRecording = async () => {
    const blob = await stopRecording();
    if (blob) {
      const file = new File([blob], "audio_message.webm", { type: "audio/webm" });
      const result = await uploadFile(file);
      if (result) {
        onSend("", { ...result, type: 'audio' });
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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



  return (
    <div className={cn(
      "border-t border-border bg-card p-3",
      disabled && "opacity-50"
    )}>
      <div className="flex items-end gap-2">
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileSelect}
          // Accept images, audio, video, pdf, doc, docx, txt
          accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.txt"
        />

        {isRecording ? (
          /* Recording UI */
          <div className="flex-1 flex items-center gap-4 px-2 py-1.5 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 text-red-500 animate-pulse">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span className="text-sm font-medium">{formatTime(recordingTime)}</span>
            </div>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={cancelRecording}
              className="text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </Button>
            <Button
              size="icon"
              className="h-8 w-8 rounded-full bg-red-500 hover:bg-red-600 text-white"
              onClick={handleStopRecording}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          /* Normal Input UI */
          <>
            {/* Action buttons */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-foreground"
                disabled={disabled || isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Paperclip className="h-5 w-5" />
                )}
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
              {message.trim() ? (
                <Button
                  size="icon"
                  className="h-9 w-9"
                  onClick={handleSend}
                  disabled={disabled || isUploading}
                >
                  <Send className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground hover:text-foreground"
                  onClick={startRecording}
                  disabled={disabled || isUploading}
                >
                  <Mic className="h-5 w-5" />
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
