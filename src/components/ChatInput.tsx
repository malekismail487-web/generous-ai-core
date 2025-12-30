import { useState, useRef, useEffect } from "react";
import { Send, Mic, MicOff } from "lucide-react";
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

  const displayPlaceholder = isListening 
    ? (interimText || "Listening...") 
    : "Ask anything...";

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div className="glass-effect rounded-2xl p-1.5 flex items-end gap-1.5">
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
          disabled={!input.trim() || disabled}
          className="h-9 w-9 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-200 disabled:opacity-50 flex-shrink-0"
        >
          <Send size={16} />
        </Button>
      </div>
    </form>
  );
}