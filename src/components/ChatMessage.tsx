import { User, Brain, ShieldCheck, SmilePlus } from "lucide-react";
import { LuminaLogo } from "@/components/LuminaLogo";
import { useEffect, useRef, useState, useMemo } from "react";
import { MathRenderer } from "@/components/MathRenderer";
import { mergeImagesIntoContent, InlineImage } from "@/lib/imageInsertion";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";

interface ChatMessageProps {
  message: {
    id: string;
    role: "user" | "assistant";
    content: string;
    images?: { src: string; alt?: string }[];
  };
  isStreaming?: boolean;
}

// Parse special tags from AI response
function parseAITags(content: string) {
  let mainContent = content;
  let thinking = '';
  let confidence: { level: number; reason: string } | null = null;
  let mood = '';

  // Extract <thinking>...</thinking>
  const thinkingMatch = mainContent.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  if (thinkingMatch) {
    thinking = thinkingMatch[1].trim();
    mainContent = mainContent.replace(thinkingMatch[0], '').trim();
  }

  // Extract <confidence level="N">reason</confidence>
  const confMatch = mainContent.match(/<confidence\s+level="(\d)">([\s\S]*?)<\/confidence>/i);
  if (confMatch) {
    confidence = { level: parseInt(confMatch[1]), reason: confMatch[2].trim() };
    mainContent = mainContent.replace(confMatch[0], '').trim();
  }

  // Extract <mood>...</mood>
  const moodMatch = mainContent.match(/<mood>([\s\S]*?)<\/mood>/i);
  if (moodMatch) {
    mood = moodMatch[1].trim().toLowerCase();
    mainContent = mainContent.replace(moodMatch[0], '').trim();
  }

  return { mainContent, thinking, confidence, mood };
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

const MOOD_ICONS: Record<string, string> = {
  frustrated: '😤',
  confused: '😕',
  bored: '😴',
  excited: '🤩',
  neutral: '',
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'bg-green-500/20 text-green-700 dark:text-green-400',
  medium: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  low: 'bg-red-500/20 text-red-700 dark:text-red-400',
};

function getConfidenceCategory(level: number) {
  if (level >= 4) return 'high';
  if (level >= 3) return 'medium';
  return 'low';
}

export function ChatMessage({ message, isStreaming = false }: ChatMessageProps) {
  const isUser = message.role === "user";
  const displayedContent = useTypewriter(message.content, isStreaming && !isUser);

  // Parse AI tags from content (only for non-streaming assistant messages)
  const parsed = useMemo(() => {
    if (isUser || isStreaming) return { mainContent: displayedContent, thinking: '', confidence: null, mood: '' };
    return parseAITags(displayedContent);
  }, [displayedContent, isUser, isStreaming]);

  // For streaming, use raw content
  const contentToRender = isStreaming ? displayedContent : parsed.mainContent;

  // Merge images inline into content
  const contentWithImages = useMemo(() => {
    if (isUser || isStreaming || !message.images || message.images.length === 0) {
      return contentToRender;
    }
    return mergeImagesIntoContent(contentToRender, message.images);
  }, [contentToRender, message.images, isUser, isStreaming]);

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

  // Assistant: with thinking block, confidence badge, mood indicator
  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-shrink-0 w-6 h-6 rounded-lg overflow-hidden">
          <LuminaLogo size={24} />
        </div>
        <span className="text-xs font-medium text-accent">Lumina</span>
        {/* Mood indicator */}
        {parsed.mood && MOOD_ICONS[parsed.mood] && (
          <span className="text-xs" title={`Detected mood: ${parsed.mood}`}>
            {MOOD_ICONS[parsed.mood]}
          </span>
        )}
        {/* Confidence badge */}
        {parsed.confidence && (
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${CONFIDENCE_COLORS[getConfidenceCategory(parsed.confidence.level)]}`}
            title={parsed.confidence.reason}
          >
            <ShieldCheck size={10} />
            {parsed.confidence.level}/5
          </span>
        )}
      </div>

      {/* Thinking block (collapsible) */}
      {parsed.thinking && (
        <div className="pl-8 mb-2">
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              <Brain size={12} className="text-primary" />
              <span className="font-medium">Lumina's Thinking</span>
              <span className="text-[10px]">▾</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1.5 p-3 rounded-xl bg-muted/50 border border-border/30 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {parsed.thinking}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      <div className="pl-8">
        <MathRenderer
          content={contentWithImages}
          className="text-sm leading-relaxed"
        />
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 ml-0.5 bg-current animate-pulse rounded-sm align-text-bottom" />
        )}
      </div>
    </div>
  );
}
