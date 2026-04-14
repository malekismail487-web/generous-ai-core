import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { InteractiveGraph } from './InteractiveGraph';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';

interface GraphModalProps {
  open: boolean;
  onClose: () => void;
  initialEquations: string[];
}

export function GraphModal({ open, onClose, initialEquations }: GraphModalProps) {
  const [equations, setEquations] = useState<string[]>(initialEquations);
  const [newEq, setNewEq] = useState('');
  const { t } = useThemeLanguage();

  const addEquation = () => {
    if (newEq.trim()) {
      setEquations(prev => [...prev, newEq.trim()]);
      setNewEq('');
    }
  };

  const removeEquation = (idx: number) => {
    setEquations(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[95vw] w-[600px] max-h-[90vh] p-4">
        <div className="space-y-3">
          <h3 className="text-lg font-bold">{t('Graph Explorer', 'مستكشف الرسوم البيانية')}</h3>
          
          <InteractiveGraph
            equations={equations}
            width={560}
            height={380}
          />

          {/* Equation list */}
          <div className="space-y-1.5">
            {equations.map((eq, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ['#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'][i % 6] }} />
                <span className="flex-1 font-mono text-xs">{eq}</span>
                <button onClick={() => removeEquation(i)} className="text-muted-foreground hover:text-destructive">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>

          {/* Add equation */}
          <div className="flex gap-2">
            <Input
              value={newEq}
              onChange={(e) => setNewEq(e.target.value)}
              placeholder={t('e.g. y = x^2 + 1', 'مثال: y = x^2 + 1')}
              className="text-sm font-mono"
              onKeyDown={(e) => e.key === 'Enter' && addEquation()}
            />
            <Button size="sm" onClick={addEquation} disabled={!newEq.trim()}>
              <Plus size={14} />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
