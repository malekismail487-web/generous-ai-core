import { useState, useRef, useEffect } from "react";
import { Send, Mic, MicOff, Paperclip, X, FileText, Image as ImageIcon, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoiceRecording } from "@/hooks/useVoiceRecording";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export interface ChatAttachment {
  file: File;
  preview?: string; // data URL for images
  type: 'image' | 'pdf' | 'video';
}

interface ChatInputProps {
  onSend: (message: string, attachments?: ChatAttachment[]) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { isListening, isSupported, interimText, toggleListening } = useVoiceRecording({
    onTranscript: (text) => {
      setInput((prev) => prev + (prev ? ' ' : '') + text);
    },
    onInterimTranscript: (text) => {
      // Show interim text in placeholder
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Voice Recording Error",
        description: error,
      });
    },
    continuous: true,
  });

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((input.trim() || attachments.length > 0) && !disabled) {
      onSend(input.trim(), attachments.length > 0 ? attachments : undefined);
      setInput("");
      setAttachments([]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const maxSizes: Record<string, number> = { image: 10 * 1024 * 1024, pdf: 10 * 1024 * 1024, video: 20 * 1024 * 1024 };

    for (const file of files) {
      const type = file.type.startsWith('image/') ? 'image' : file.type === 'application/pdf' ? 'pdf' : file.type.startsWith('video/') ? 'video' : null;
      if (!type) { toast({ variant: "destructive", title: "Unsupported file type", description: file.name }); continue; }
      if (file.size > (maxSizes[type] || 10 * 1024 * 1024)) {
        toast({ variant: "destructive", title: "File too large", description: `${file.name} exceeds the size limit` });
        continue;
      }
      if (type === 'image') {
        const reader = new FileReader();
        reader.onload = () => setAttachments(prev => [...prev, { file, preview: reader.result as string, type }]);
        reader.readAsDataURL(file);
      } else {
        setAttachments(prev => [...prev, { file, type }]);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const displayPlaceholder = isListening 
    ? (interimText || "Listening...") 
    : "Ask anything...";

  return (
    <form onSubmit={handleSubmit} className="relative">
      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex gap-2 px-2 pt-2 pb-1 flex-wrap">
          {attachments.map((att, i) => (
            <div key={i} className="relative group">
              {att.type === 'image' && att.preview ? (
                <img src={att.preview} alt="" className="w-14 h-14 rounded-lg object-cover border border-border/30" />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-muted flex flex-col items-center justify-center border border-border/30">
                  {att.type === 'pdf' ? <FileText size={16} className="text-muted-foreground" /> : <Film size={16} className="text-muted-foreground" />}
                  <span className="text-[8px] text-muted-foreground mt-0.5 truncate max-w-[50px]">{att.file.name.split('.').pop()}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeAttachment(i)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,video/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      <div className="glass-effect rounded-2xl p-1.5 flex items-end gap-1.5">
        {/* Paperclip button */}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="h-9 w-9 rounded-xl transition-all duration-200 flex-shrink-0"
        >
          <Paperclip size={16} />
        </Button>

        {isSupported && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={toggleListening}
            disabled={disabled}
            className={cn(
              "h-9 w-9 rounded-xl transition-all duration-200 flex-shrink-0",
              isListening && "bg-primary text-primary-foreground animate-pulse"
            )}
          >
            {isListening ? <MicOff size={16} /> : <Mic size={16} />}
          </Button>
        )}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={displayPlaceholder}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 px-2 py-2 text-sm min-h-[36px] max-h-[120px]"
        />
        <Button
          type="submit"
          size="icon"
          disabled={(!input.trim() && attachments.length === 0) || disabled}
          className="h-9 w-9 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-200 disabled:opacity-50 flex-shrink-0"
        >
          <Send size={16} />
        </Button>
      </div>
    </form>
  );
}