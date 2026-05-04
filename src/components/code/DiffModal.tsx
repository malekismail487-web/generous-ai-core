import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, X, FilePlus, FileEdit } from 'lucide-react';

export type DiffEntry = {
  path: string;
  before?: string; // undefined => new file
  after: string;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diffs: DiffEntry[];
  onApply: () => void;
  onDiscard: () => void;
}

// Tiny line-level diff (LCS-based). Returns array of {type, text}.
function lineDiff(a: string, b: string): { type: 'eq' | 'add' | 'del'; text: string }[] {
  const A = a.split('\n');
  const B = b.split('\n');
  const m = A.length, n = B.length;
  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: { type: 'eq' | 'add' | 'del'; text: string }[] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (A[i] === B[j]) { out.push({ type: 'eq', text: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'del', text: A[i] }); i++; }
    else { out.push({ type: 'add', text: B[j] }); j++; }
  }
  while (i < m) { out.push({ type: 'del', text: A[i++] }); }
  while (j < n) { out.push({ type: 'add', text: B[j++] }); }
  return out;
}

export function DiffModal({ open, onOpenChange, diffs, onApply, onDiscard }: Props) {
  const rendered = useMemo(() => diffs.map((d) => ({
    ...d,
    isNew: d.before === undefined,
    rows: d.before === undefined
      ? d.after.split('\n').map((t) => ({ type: 'add' as const, text: t }))
      : lineDiff(d.before, d.after),
  })), [diffs]);

  const totalAdds = rendered.reduce((s, d) => s + d.rows.filter((r) => r.type === 'add').length, 0);
  const totalDels = rendered.reduce((s, d) => s + d.rows.filter((r) => r.type === 'del').length, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b border-border/40 flex-shrink-0">
          <DialogTitle className="text-sm flex items-center gap-2">
            Lumina's proposed changes
            <span className="text-[11px] font-normal text-green-600">+{totalAdds}</span>
            <span className="text-[11px] font-normal text-red-600">−{totalDels}</span>
            <span className="text-[11px] font-normal text-muted-foreground">across {diffs.length} file{diffs.length !== 1 ? 's' : ''}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-3 space-y-4">
          {rendered.map((d) => (
            <div key={d.path} className="rounded-lg border border-border overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/40 border-b border-border text-xs font-mono">
                {d.isNew ? <FilePlus size={12} className="text-green-600" /> : <FileEdit size={12} className="text-primary" />}
                <span>{d.path}</span>
                {d.isNew && <span className="text-[10px] text-green-600 ml-auto">NEW</span>}
              </div>
              <pre className="text-[11px] leading-snug font-mono overflow-x-auto bg-background">
                {d.rows.map((r, i) => (
                  <div
                    key={i}
                    className={
                      r.type === 'add' ? 'bg-green-500/10 text-green-800 dark:text-green-300' :
                      r.type === 'del' ? 'bg-red-500/10 text-red-800 dark:text-red-300 line-through opacity-80' :
                      'text-muted-foreground'
                    }
                  >
                    <span className="inline-block w-4 text-center select-none opacity-60">
                      {r.type === 'add' ? '+' : r.type === 'del' ? '−' : ' '}
                    </span>
                    <span>{r.text || ' '}</span>
                  </div>
                ))}
              </pre>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border/40 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={onDiscard}>
            <X size={14} /> <span className="ml-1">Discard</span>
          </Button>
          <Button size="sm" onClick={onApply}>
            <Check size={14} /> <span className="ml-1">Apply changes</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
