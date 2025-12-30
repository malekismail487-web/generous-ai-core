import { Sparkles, BookOpen, Brain, Lightbulb } from "lucide-react";

const suggestions = [
  { icon: BookOpen, text: "Teach me about photosynthesis" },
  { icon: Brain, text: "Explain how memory works" },
  { icon: Lightbulb, text: "Help me understand calculus" },
];

interface EmptyStateProps {
  onSuggestionClick: (text: string) => void;
}

export function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 animate-fade-in">
      <div className="relative mb-5">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center glow-effect"
             style={{ background: 'var(--gradient-primary)' }}>
          <Sparkles className="w-8 h-8 text-primary-foreground" />
        </div>
        <div className="absolute inset-0 rounded-2xl animate-pulse-glow" 
             style={{ background: 'var(--gradient-primary)', opacity: 0.3 }} />
      </div>
      
      <h1 className="text-2xl font-bold mb-2">
        <span className="gradient-text">Study Bright AI</span>
      </h1>
      <p className="text-muted-foreground text-sm mb-6 max-w-xs">
        Learn anything, then test yourself in the Exam or SAT tabs
      </p>

      <div className="w-full max-w-sm space-y-2">
        {suggestions.map((suggestion, index) => (
          <button
            key={index}
            onClick={() => onSuggestionClick(suggestion.text)}
            className="w-full glass-effect rounded-xl p-3 text-left hover:bg-secondary/50 transition-all duration-200 group flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors">
              <suggestion.icon size={18} />
            </div>
            <span className="text-sm text-foreground">{suggestion.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}