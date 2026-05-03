import { useRef, useState } from 'react';
import { InteractiveGraph } from './InteractiveGraph';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, X, Trash2 } from 'lucide-react';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { MathKeyboard } from './MathKeyboard';

const PRESET_EQUATIONS = [
  { label: 'y = x²', eq: 'y = x^2' },
  { label: 'y = sin(x)', eq: 'y = sin(x)' },
  { label: 'y = cos(x)', eq: 'y = cos(x)' },
  { label: 'y = 1/x', eq: 'y = 1/x' },
  { label: 'y = √x', eq: 'y = sqrt(x)' },
  { label: 'y = |x|', eq: 'y = abs(x)' },
];

const COLORS = ['#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'];

export function GraphCalculator() {
  const [equations, setEquations] = useState<string[]>(['y = x^2']);
  const [newEq, setNewEq] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useThemeLanguage();

  const insertAtCursor = (text: string, back = 0) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? newEq.length;
    const end = el?.selectionEnd ?? newEq.length;
    const next = newEq.slice(0, start) + text + newEq.slice(end);
    setNewEq(next);
    requestAnimationFrame(() => {
      const pos = start + text.length - back;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const backspace = () => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? newEq.length;
    const end = el?.selectionEnd ?? newEq.length;
    if (start === end && start === 0) return;
    if (start === end) {
      const next = newEq.slice(0, start - 1) + newEq.slice(end);
      setNewEq(next);
      requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start - 1, start - 1); });
    } else {
      setNewEq(newEq.slice(0, start) + newEq.slice(end));
      requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start, start); });
    }
  };

  const addEquation = () => {
    if (newEq.trim() && equations.length < 6) {
      setEquations(prev => [...prev, newEq.trim()]);
      setNewEq('');
    }
  };

  const removeEquation = (idx: number) => {
    setEquations(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="min-h-0 h-[calc(100vh-120px)] overflow-y-auto pt-14 pb-24">
      <div className="px-4 py-4 space-y-4">
        <div className="text-center">
          <h2 className="text-xl font-bold">{t('Graph Calculator', 'حاسبة الرسوم البيانية')}</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {t('Plot and explore mathematical functions', 'ارسم واستكشف الدوال الرياضية')}
          </p>
        </div>

        {/* Graph */}
        <div className="flex justify-center">
          <InteractiveGraph
            equations={equations}
            width={Math.min(400, window.innerWidth - 32)}
            height={300}
          />
        </div>

        {/* Active equations */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{t('Equations', 'المعادلات')}</h3>
          {equations.map((eq, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-card border border-border/30">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % 6] }} />
              <span className="flex-1 font-mono text-sm">{eq}</span>
              <button onClick={() => removeEquation(i)} className="text-muted-foreground hover:text-destructive p-1">
                <X size={14} />
              </button>
            </div>
          ))}
          {equations.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">{t('Add an equation to plot', 'أضف معادلة للرسم')}</p>
          )}
        </div>

        {/* Add equation input */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={newEq}
              onChange={(e) => setNewEq(e.target.value)}
              placeholder={t('e.g. y = 2*sin(x) + 1', 'مثال: y = 2*sin(x) + 1')}
              className="text-sm font-mono"
              inputMode="none"
              onKeyDown={(e) => e.key === 'Enter' && addEquation()}
            />
            <Button size="sm" onClick={addEquation} disabled={!newEq.trim() || equations.length >= 6}>
              <Plus size={14} />
            </Button>
          </div>
          <MathKeyboard
            onInsert={insertAtCursor}
            onBackspace={backspace}
            onClear={() => setNewEq('')}
            onSubmit={addEquation}
          />
        </div>

        {/* Presets */}
        <div>
          <h3 className="text-sm font-semibold mb-2">{t('Quick Add', 'إضافة سريعة')}</h3>
          <div className="flex flex-wrap gap-2">
            {PRESET_EQUATIONS.map((preset) => (
              <button
                key={preset.eq}
                onClick={() => {
                  if (equations.length < 6 && !equations.includes(preset.eq)) {
                    setEquations(prev => [...prev, preset.eq]);
                  }
                }}
                disabled={equations.includes(preset.eq) || equations.length >= 6}
                className="px-3 py-1.5 rounded-full text-xs font-mono border border-border/50 bg-card hover:bg-primary/10 hover:border-primary/30 transition-all disabled:opacity-40"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Clear all */}
        {equations.length > 0 && (
          <Button variant="outline" size="sm" className="w-full" onClick={() => setEquations([])}>
            <Trash2 size={14} className="mr-2" />
            {t('Clear All', 'مسح الكل')}
          </Button>
        )}
      </div>
    </div>
  );
}
