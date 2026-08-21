import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Sparkles } from 'lucide-react';
import type { AIConfig } from './CodePreviewFrame';

const LEGACY_STORAGE_KEY = 'codelab:ai:v1';

export function loadAIConfig(): AIConfig {
  // Earlier builds stored third-party provider credentials in localStorage. The
  // canonical client never reads them and removes that legacy browser state.
  try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* storage may be unavailable */ }
  return { mode: 'lumina' };
}

export function saveAIConfig(_config: AIConfig | undefined) {
  try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* storage may be unavailable */ }
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: AIConfig;
  onSave: (config: AIConfig) => void;
}

export function AISettingsModal({ open, onOpenChange, onSave }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={16} className="text-primary" />
            AI in your code
          </DialogTitle>
          <DialogDescription className="text-xs">
            The <code className="font-mono text-[11px]">LUMINA_AI()</code> helper uses Lumina's authenticated server boundary.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-3 rounded-lg border border-foreground/10 bg-muted/40 p-3 text-xs text-muted-foreground">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" />
          <p>
            Provider credentials are configured only in protected server controls. They are never requested, stored, or sent by this browser or its sandboxed preview.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={() => { onSave({ mode: 'lumina' }); onOpenChange(false); }}>Use Lumina AI</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
