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
  const rafRef = useRef<number>(0);
  const idxRef = useRef(0);

  useEffect(() => {
    if (!isStreaming) {
      // Not streaming — show full content immediately (for history messages)
      setDisplayed(content);
      prevLenRef.current = content.length;
      idxRef.current = content.length;
      return;
    }

    // When new content arrives, queue the new characters
    if (content.length > prevLenRef.current) {
      const newChars = content.slice(prevLenRef.current);
      // Push word-sized chunks for natural feel
      const words = newChars.split(/(?<=\s)/);
      queueRef.current.push(...words);
      prevLenRef.current = content.length;
    }

    const flush = () => {
      if (queueRef.current.length === 0) return;
      // Pop 1-2 words per frame for a fast but visible effect
      const batch = queueRef.current.splice(0, 2).join("");
      setDisplayed((prev) => prev + batch);

      if (queueRef.current.length > 0) {
        rafRef.current = requestAnimationFrame(flush);
      }
    };

    if (queueRef.current.length > 0 && !rafRef.current) {
      rafRef.current = requestAnimationFrame(flush);
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [content, isStreaming]);

  // When streaming ends, flush any remaining queue instantly
  useEffect(() => {
    if (!isStreaming && queueRef.current.length > 0) {
      setDisplayed(content);
      queueRef.current = [];
    }
  }, [isStreaming, content]);

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
