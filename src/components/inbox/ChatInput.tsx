import { useState, useRef, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Paperclip, Smile, Mic, Send, MicOff, X, Loader2, StopCircle, Trash2 } from "lucide-react";
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
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { theme } = useTheme();

  const { uploadFile, isUploading } = useMediaUpload();
  const { isRecording, recordingTime, startRecording, stopRecording, cancelRecording } = useAudioRecorder();

  const handleSend = async () => {
    // Prevent send if nothing to send (no text AND no file)
    if (!message.trim() && !pendingFile) return;
    if (disabled || isUploading || isRecording) return;

    let mediaResult;

    // 1. Upload Pending File if exists
    if (pendingFile) {
        const result = await uploadFile(pendingFile);
        if (!result) return; // Error handled in hook
        mediaResult = result;
    }

    // 2. Send Message
    onSend(message.trim(), mediaResult);
    
    // 3. Reset State
    setMessage("");
    setPendingFile(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingFile(file);
      // Reset input value to allow selecting same file again if needed (after clearing)
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removePendingFile = () => {
      setPendingFile(null);
  };

  const handleStopRecording = async () => {
      const blob = await stopRecording();
      if (blob) {
        // opus-recorder sempre entrega audio/ogg;codecs=opus — formato nativo de PTT do WhatsApp.
        console.log('[ChatInput] Áudio OGG pronto para upload:', { size: blob.size, type: blob.type });
        const file = new File([blob], 'audio_message.ogg', { type: 'audio/ogg;codecs=opus' });
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

  const getFileIcon = (file: File) => {
      if (file.type.startsWith('image/')) return <Paperclip className="h-4 w-4" />; // Could use ImageIcon but Paperclip is generic enough for preview
      return <Paperclip className="h-4 w-4" />;
  };

  return (
    <div className={cn(
      "p-3",
      disabled && "opacity-50"
    )}>
      {/* File Preview Area - New Premium UI */}
      {pendingFile && (
        <div className="mb-2 mx-1 animate-in slide-in-from-bottom-2 fade-in duration-200">
            <div className="inline-flex items-center gap-2 bg-slate-50 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50 rounded-lg p-2 pr-3 shadow-sm">
                <div className="h-10 w-10 bg-white dark:bg-slate-900 rounded-md flex items-center justify-center border border-slate-200/50 dark:border-slate-700/50 text-slate-400 overflow-hidden">
                   {pendingFile.type.startsWith('image/') ? (
                       <img src={URL.createObjectURL(pendingFile)} alt="Preview" className="h-full w-full object-cover" />
                   ) : (
                       <Paperclip className="h-5 w-5" />
                   )}
                </div>
                <div className="flex flex-col max-w-[150px]">
                    <span className="text-xs font-medium truncate text-slate-800 dark:text-slate-200">{pendingFile.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{(pendingFile.size / 1024).toFixed(0)}kb</span>
                </div>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 ml-1 hover:bg-destructive/10 hover:text-destructive rounded-full"
                    onClick={removePendingFile}
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>
        </div>
      )}

      <div className="flex items-end gap-2 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-700/50 rounded-xl p-2 shadow-sm">
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
          <div className="flex-1 flex items-center gap-3 px-3 py-2 animate-in fade-in duration-200 bg-red-500/10 rounded-lg border border-red-500/20">
            <div className="flex items-center gap-2 text-red-500 animate-pulse min-w-[60px]">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
              <span className="text-sm font-semibold font-mono tracking-wide">{formatTime(recordingTime)}</span>
            </div>
            
            <div className="flex-1 flex items-center gap-1 opacity-50">
              {/* Fake waveform visualization aligned left */}
              {[...Array(12)].map((_, i) => (
                <div 
                  key={i} 
                  className="w-1 bg-red-500 rounded-full animate-bounce" 
                  style={{ 
                    height: Math.max(4, Math.random() * 20) + 'px',
                    animationDuration: (0.8 + Math.random() * 0.5) + 's',
                    animationDelay: (i * 0.05) + 's'
                  }} 
                />
              ))}
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={cancelRecording}
              className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-colors"
              title="Cancelar gravação"
            >
              <Trash2 className="h-5 w-5" />
            </Button>
            
            <Button
              size="icon"
              className="h-9 w-9 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-md transition-all hover:scale-105"
              onClick={handleStopRecording}
              title="Enviar áudio"
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
            className="min-h-[36px] max-h-[120px] resize-none py-2 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
          />
        </div>

        {/* Send / Record buttons */}
            <div className="flex items-center gap-1">
              {(message.trim() || pendingFile) ? (
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
