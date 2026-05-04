import { cn } from "@/lib/utils";

export type ConfidenceLevel = 1 | 2 | 3 | 4;

interface ConfidencePickerProps {
  value: ConfidenceLevel | null;
  onChange: (level: ConfidenceLevel) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}

const LEVELS: { level: ConfidenceLevel; label: string; hint: string }[] = [
  { level: 1, label: "Guessing", hint: "Pure guess" },
  { level: 2, label: "Unsure", hint: "Leaning one way" },
  { level: 3, label: "Likely", hint: "Pretty confident" },
  { level: 4, label: "Certain", hint: "Sure of this" },
];

/**
 * Confidence Calibration picker.
 * Student selects how sure they are BEFORE submitting.
 * Monochromatic, accessible, keyboard-friendly.
 */
export function ConfidencePicker({
  value,
  onChange,
  disabled,
  compact,
  className,
}: ConfidencePickerProps) {
  return (
    <div className={cn("w-full", className)}>
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        How confident are you?
      </div>
      <div
        role="radiogroup"
        aria-label="Confidence level"
        className={cn(
          "grid gap-2",
          compact ? "grid-cols-4" : "grid-cols-2 sm:grid-cols-4",
        )}
      >
        {LEVELS.map(({ level, label, hint }) => {
          const selected = value === level;
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(level)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left transition-colors",
                "border-border bg-card text-foreground",
                "hover:border-foreground/40",
                "focus:outline-none focus:ring-2 focus:ring-ring",
                selected && "border-foreground bg-foreground text-background",
                disabled && "opacity-50 cursor-not-allowed",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{label}</span>
                <span
                  className={cn(
                    "text-[10px] tabular-nums opacity-70",
                    selected && "opacity-90",
                  )}
                >
                  {level}/4
                </span>
              </div>
              {!compact && (
                <div
                  className={cn(
                    "text-[11px] mt-0.5",
                    selected ? "text-background/80" : "text-muted-foreground",
                  )}
                >
                  {hint}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
