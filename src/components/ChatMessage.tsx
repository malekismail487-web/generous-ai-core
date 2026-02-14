import { Message } from "@/lib/chat";
import { User, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
}

function useTypewriter(content: string, isStreaming: boolean) {
  const [displayed, setDisplayed] = useState("");
  const prevLenRef = useRef(0);
  const queueRef = useRef<string[]>([]);
  const rafRef = useRef<number | null>(null);

  // When not streaming (history or stream ended), show full content
  useEffect(() => {
    if (!isStreaming) {
      setDisplayed(content);
      prevLenRef.current = content.length;
      queueRef.current = [];
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }
  }, [isStreaming, content]);

  // When streaming and new content arrives, queue it
  useEffect(() => {
    if (!isStreaming) return;

    if (content.length > prevLenRef.current) {
      const newChars = content.slice(prevLenRef.current);
      const words = newChars.split(/(?<=\s)/);
      queueRef.current.push(...words);
      prevLenRef.current = content.length;
    }

    const flush = () => {
      if (queueRef.current.length === 0) {
        rafRef.current = null;
        return;
      }
      const batch = queueRef.current.splice(0, 2).join("");
      setDisplayed((prev) => prev + batch);
      rafRef.current = requestAnimationFrame(flush);
    };

    if (queueRef.current.length > 0 && !rafRef.current) {
      rafRef.current = requestAnimationFrame(flush);
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [content, isStreaming]);

  return displayed;
}

export function ChatMessage({ message, isStreaming = false }: ChatMessageProps) {
  const isUser = message.role === "user";
  const displayedContent = useTypewriter(
    message.content,
    isStreaming && !isUser
  );

  return (
    <div
      className={`flex gap-2.5 animate-fade-in ${isUser ? "flex-row-reverse" : ""}`}
    >
      <div
        className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${
          isUser
            ? "bg-primary/20 text-primary"
            : "bg-accent/20 text-accent"
        }`}
      >
        {isUser ? <User size={14} /> : <Sparkles size={14} />}
      </div>
      <div
        className={`message-bubble ${
          isUser ? "message-user" : "message-assistant"
        }`}
      >
        <div className="text-sm leading-relaxed whitespace-pre-wrap">
          {isUser ? message.content : displayedContent}
          {isStreaming && !isUser && (
            <span className="inline-block w-1.5 h-4 ml-0.5 bg-current animate-pulse rounded-sm align-text-bottom" />
          )}
        </div>
      </div>
    </div>
  );
}
