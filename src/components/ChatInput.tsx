import { useState, useRef, useEffect } from "react";
import { Send, Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoiceRecording } from "@/hooks/useVoiceRecording";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  const { isListening, isSupported, toggleListening } = useVoiceRecording({
    onTranscript: (text) => {
      setInput((prev) => prev + (prev ? ' ' : '') + text);
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Voice Recording Error",
        description: error,
      });
    },
  });

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !disabled) {
      onSend(input.trim());
      setInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div className="glass-effect rounded-2xl p-1.5 flex items-end gap-2">
        {isSupported && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={toggleListening}
            disabled={disabled}
            className={cn(
              "h-10 w-10 rounded-xl transition-all duration-200 flex-shrink-0",
              isListening && "bg-destructive/20 text-destructive animate-pulse"
            )}
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </Button>
        )}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isListening ? "Listening..." : "Ask Study Bright anything..."}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 px-3 py-2.5 text-sm min-h-[44px] max-h-[200px]"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!input.trim() || disabled}
          className="h-10 w-10 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          <Send size={18} />
        </Button>
      </div>
    </form>
  );
}
