import { Message } from "@/lib/chat";
import { User, Sparkles, Volume2, VolumeX, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MathRenderer } from "@/components/MathRenderer";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
  voiceMode?: boolean;
}

function useTypewriter(content: string, isStreaming: boolean) {
  const [displayed, setDisplayed] = useState(isStreaming ? "" : content);
  const prevContentRef = useRef(content);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const targetRef = useRef(content);

  useEffect(() => {
    if (!isStreaming) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setDisplayed(content);
      targetRef.current = content;
      prevContentRef.current = content;
    }
  }, [isStreaming, content]);

  useEffect(() => {
    if (!isStreaming) return;
    targetRef.current = content;
    if (intervalRef.current) return;

    intervalRef.current = setInterval(() => {
      setDisplayed((prev) => {
        const target = targetRef.current;
        if (prev.length >= target.length) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return prev;
        }
        const charsToAdd = Math.min(4, target.length - prev.length);
        return target.slice(0, prev.length + charsToAdd);
      });
    }, 18);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [content, isStreaming]);

  return displayed;
}

export function ChatMessage({ message, isStreaming = false, voiceMode = false }: ChatMessageProps) {
  const isUser = message.role === "user";
  const displayedContent = useTypewriter(message.content, isStreaming && !isUser);
  const { speak, stop, isSpeaking, isLoading: ttsLoading } = useTextToSpeech();
  const hasAutoPlayed = useRef(false);

  // Auto-play voice when streaming completes in voice mode
  useEffect(() => {
    if (voiceMode && !isUser && !isStreaming && message.content && !hasAutoPlayed.current) {
      hasAutoPlayed.current = true;
      speak(message.content);
    }
  }, [voiceMode, isUser, isStreaming, message.content, speak]);

  // Reset auto-play flag when message changes
  useEffect(() => {
    hasAutoPlayed.current = false;
  }, [message.id]);

  const handleVoiceToggle = () => {
    if (isSpeaking) {
      stop();
    } else {
      speak(message.content);
    }
  };

  return (
    <div className={`flex gap-2.5 animate-fade-in ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${
          isUser ? "bg-primary/20 text-primary" : "bg-accent/20 text-accent"
        }`}
      >
        {isUser ? <User size={14} /> : <Sparkles size={14} />}
      </div>
      <div className={`message-bubble ${isUser ? "message-user" : "message-assistant"}`}>
        <div className="text-sm leading-relaxed">
          {isUser ? (
            <span className="whitespace-pre-wrap">{message.content}</span>
          ) : (
            <MathRenderer content={displayedContent} className="text-sm" />
          )}
          {isStreaming && !isUser && (
            <span className="inline-block w-1.5 h-4 ml-0.5 bg-current animate-pulse rounded-sm align-text-bottom" />
          )}
        </div>
        {/* Voice button for assistant messages */}
        {!isUser && !isStreaming && message.content && (
          <div className="flex justify-end mt-1.5">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-6 w-6 rounded-md",
                isSpeaking && "text-primary bg-primary/10"
              )}
              onClick={handleVoiceToggle}
              disabled={ttsLoading}
            >
              {ttsLoading ? (
                <Loader2 size={12} className="animate-spin" />
              ) : isSpeaking ? (
                <VolumeX size={12} />
              ) : (
                <Volume2 size={12} />
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
