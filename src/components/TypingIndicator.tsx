import { Sparkles } from "lucide-react";

export function TypingIndicator() {
  return (
    <div className="flex gap-3 animate-fade-in">
      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-accent/20 text-accent">
        <Sparkles size={16} className="animate-pulse-glow" />
      </div>
      <div className="message-bubble message-assistant">
        <div className="flex gap-1.5 py-1">
          <span
            className="w-2 h-2 rounded-full bg-muted-foreground animate-typing"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="w-2 h-2 rounded-full bg-muted-foreground animate-typing"
            style={{ animationDelay: "200ms" }}
          />
          <span
            className="w-2 h-2 rounded-full bg-muted-foreground animate-typing"
            style={{ animationDelay: "400ms" }}
          />
        </div>
      </div>
    </div>
  );
}
