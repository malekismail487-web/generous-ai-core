import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { Delete } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MathKeyboardProps {
  onInsert: (text: string, cursorOffset?: number) => void;
  onBackspace: () => void;
  onClear: () => void;
  onSubmit?: () => void;
  className?: string;
}

interface Key {
  label: string;
  insert: string;
  /** how many characters to move cursor LEFT after insert (e.g. inside parens) */
  back?: number;
  wide?: boolean;
  variant?: 'default' | 'op' | 'fn' | 'primary';
}

const ROWS: Key[][] = [
  [
    { label: '7', insert: '7' }, { label: '8', insert: '8' }, { label: '9', insert: '9' },
    { label: '÷', insert: '/', variant: 'op' }, { label: 'x', insert: 'x', variant: 'op' },
    { label: 'y', insert: 'y', variant: 'op' },
  ],
  [
    { label: '4', insert: '4' }, { label: '5', insert: '5' }, { label: '6', insert: '6' },
    { label: '×', insert: '*', variant: 'op' }, { label: 'x²', insert: '^2', variant: 'fn' },
    { label: 'xⁿ', insert: '^', variant: 'fn' },
  ],
  [
    { label: '1', insert: '1' }, { label: '2', insert: '2' }, { label: '3', insert: '3' },
    { label: '−', insert: '-', variant: 'op' }, { label: '√', insert: 'sqrt()', back: 1, variant: 'fn' },
    { label: '|x|', insert: 'abs()', back: 1, variant: 'fn' },
  ],
  [
    { label: '0', insert: '0' }, { label: '.', insert: '.' }, { label: '=', insert: '=', variant: 'op' },
    { label: '+', insert: '+', variant: 'op' }, { label: '(', insert: '(', variant: 'op' },
    { label: ')', insert: ')', variant: 'op' },
  ],
  [
    { label: 'sin', insert: 'sin()', back: 1, variant: 'fn' },
    { label: 'cos', insert: 'cos()', back: 1, variant: 'fn' },
    { label: 'tan', insert: 'tan()', back: 1, variant: 'fn' },
    { label: 'ln', insert: 'ln()', back: 1, variant: 'fn' },
    { label: 'log', insert: 'log()', back: 1, variant: 'fn' },
    { label: 'π', insert: 'pi', variant: 'fn' },
  ],
];

export function MathKeyboard({ onInsert, onBackspace, onClear, onSubmit, className }: MathKeyboardProps) {
  const { t } = useThemeLanguage();

  return (
    <div className={cn('rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-2 space-y-1.5', className)}>
      {ROWS.map((row, ri) => (
        <div key={ri} className="grid grid-cols-6 gap-1.5">
          {row.map((k) => (
            <button
              key={k.label}
              type="button"
              onClick={() => onInsert(k.insert, k.back ?? 0)}
              className={cn(
                'h-9 rounded-md text-sm font-mono transition-colors active:scale-95',
                k.variant === 'op' && 'bg-primary/10 text-foreground hover:bg-primary/20',
                k.variant === 'fn' && 'bg-muted/60 text-foreground hover:bg-muted text-xs',
                (!k.variant || k.variant === 'default') && 'bg-secondary/60 text-foreground hover:bg-secondary',
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
      ))}
      <div className="grid grid-cols-6 gap-1.5 pt-0.5">
        <button
          type="button"
          onClick={onClear}
          className="h-9 col-span-2 rounded-md text-xs font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors active:scale-95"
        >
          {t('Clear', 'مسح')}
        </button>
        <button
          type="button"
          onClick={onBackspace}
          className="h-9 col-span-2 rounded-md bg-muted/60 hover:bg-muted text-foreground flex items-center justify-center transition-colors active:scale-95"
          aria-label="Backspace"
        >
          <Delete size={16} />
        </button>
        {onSubmit && (
          <button
            type="button"
            onClick={onSubmit}
            className="h-9 col-span-2 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors active:scale-95"
          >
            {t('Plot', 'ارسم')}
          </button>
        )}
      </div>
    </div>
  );
}
