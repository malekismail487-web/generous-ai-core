import { Sparkles, Zap, Brain, MessageCircle } from "lucide-react";

const suggestions = [
  { icon: Zap, text: "Explain quantum computing simply" },
  { icon: Brain, text: "Help me brainstorm creative ideas" },
  { icon: MessageCircle, text: "Write a professional email" },
];

interface EmptyStateProps {
  onSuggestionClick: (text: string) => void;
}

export function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4 animate-fade-in">
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center glow-effect">
          <Sparkles className="w-10 h-10 text-primary" />
        </div>
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/10 to-transparent animate-pulse-glow" />
      </div>
      
      <h1 className="text-3xl font-bold mb-2">
        <span className="gradient-text">Study Bright AI</span>
      </h1>
      <p className="text-muted-foreground mb-8 max-w-md">
        Your free, intelligent AI learning assistant. Ask me anything!
      </p>

      <div className="grid gap-3 w-full max-w-md">
        {suggestions.map((suggestion, index) => (
          <button
            key={index}
            onClick={() => onSuggestionClick(suggestion.text)}
            className="glass-effect rounded-xl p-4 text-left hover:bg-secondary/50 transition-all duration-200 group flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors">
              <suggestion.icon size={20} />
            </div>
            <span className="text-sm text-foreground">{suggestion.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
