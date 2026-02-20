import { Message } from "@/lib/chat";
import { User, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MathRenderer } from "@/components/MathRenderer";

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
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

export function ChatMessage({ message, isStreaming = false }: ChatMessageProps) {
  const isUser = message.role === "user";
  const displayedContent = useTypewriter(message.content, isStreaming && !isUser);

  if (isUser) {
    return (
      <div className="flex gap-2.5 animate-fade-in flex-row-reverse">
        <div className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center bg-primary/20 text-primary">
          <User size={14} />
        </div>
        <div className="message-bubble message-user">
          <div className="text-sm leading-relaxed">
            <span className="whitespace-pre-wrap">{message.content}</span>
          </div>
        </div>
      </div>
    );
  }

  // Assistant: no bubble, clean open layout
  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center bg-accent/20 text-accent">
          <Sparkles size={12} />
        </div>
        <span className="text-xs font-medium text-accent">Study Bright</span>
      </div>
      <div className="pl-8">
        <MathRenderer content={displayedContent} className="text-sm leading-relaxed" />
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 ml-0.5 bg-current animate-pulse rounded-sm align-text-bottom" />
        )}
      </div>
    </div>
  );
}
