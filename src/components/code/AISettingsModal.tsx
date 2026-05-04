import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkles, KeyRound, Lock, Trash2 } from 'lucide-react';
import type { AIConfig } from './CodePreviewFrame';

const STORAGE_KEY = 'codelab:ai:v1';

export function loadAIConfig(): AIConfig | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw) as AIConfig;
  } catch {
    return undefined;
  }
}

export function saveAIConfig(cfg: AIConfig | undefined) {
  try {
    if (!cfg) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {}
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: AIConfig;
  onSave: (cfg: AIConfig | undefined) => void;
}

type Mode = 'lumina' | 'lovable' | 'custom';
type Provider = 'openai' | 'anthropic' | 'gemini';

export function AISettingsModal({ open, onOpenChange, initial, onSave }: Props) {
  const [mode, setMode] = useState<Mode>(initial?.mode ?? 'lumina');
  const [lovableKey, setLovableKey] = useState(initial?.lovableKey ?? '');
  const [provider, setProvider] = useState<Provider>(initial?.provider ?? 'openai');
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? '');
  const [model, setModel] = useState(initial?.model ?? '');

  useEffect(() => {
    if (open) {
      setMode(initial?.mode ?? 'lumina');
      setLovableKey(initial?.lovableKey ?? '');
      setProvider(initial?.provider ?? 'openai');
      setApiKey(initial?.apiKey ?? '');
      setModel(initial?.model ?? '');
    }
  }, [open, initial]);

  const handleSave = () => {
    let cfg: AIConfig;
    if (mode === 'lumina') {
      cfg = { mode: 'lumina' };
    } else if (mode === 'lovable') {
      if (!lovableKey.trim()) return;
      cfg = { mode: 'lovable', lovableKey: lovableKey.trim() };
    } else {
      if (!apiKey.trim()) return;
      cfg = { mode: 'custom', provider, apiKey: apiKey.trim(), model: model.trim() || undefined };
    }
    onSave(cfg);
    onOpenChange(false);
  };

  const handleDisable = () => {
    onSave(undefined);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={16} className="text-primary" />
            AI in your code
          </DialogTitle>
          <DialogDescription className="text-xs">
            Pick how the <code className="font-mono text-[11px]">LUMINA_AI()</code> helper inside your preview will reach an AI model. Keys are stored in your browser only.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Mode picker */}
          <div className="grid grid-cols-3 gap-1.5">
            {([
              { v: 'lumina', label: 'Lumina', icon: Sparkles, desc: 'Built-in' },
              { v: 'lovable', label: 'Gateway', icon: KeyRound, desc: 'Lovable AI key' },
              { v: 'custom', label: 'Your key', icon: Lock, desc: 'OpenAI / etc.' },
            ] as { v: Mode; label: string; icon: any; desc: string }[]).map(({ v, label, icon: Icon, desc }) => (
              <button
                key={v}
                onClick={() => setMode(v)}
                className={`p-2 rounded-lg border text-left transition-colors ${
                  mode === v ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center gap-1 text-xs font-medium">
                  <Icon size={12} /> {label}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{desc}</div>
              </button>
            ))}
          </div>

          {/* Mode-specific fields */}
          {mode === 'lumina' && (
            <div className="text-xs text-muted-foreground p-3 rounded-lg bg-muted/40 border border-border/40">
              Your code can call <code className="font-mono">await LUMINA_AI("prompt")</code>. Requests are routed through Lumina's secure backend — no key needed. Rate-limited per user.
            </div>
          )}

          {mode === 'lovable' && (
            <div className="space-y-2">
              <Label htmlFor="lk" className="text-xs">Lovable AI Gateway key</Label>
              <Input
                id="lk"
                type="password"
                value={lovableKey}
                onChange={(e) => setLovableKey(e.target.value)}
                placeholder="sk-..."
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Used directly from the preview to call <code className="font-mono">ai.gateway.lovable.dev</code>. Get a key from your Lovable workspace.
              </p>
            </div>
          )}

          {mode === 'custom' && (
            <div className="space-y-2">
              <Label className="text-xs">Provider</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['openai', 'anthropic', 'gemini'] as Provider[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setProvider(p)}
                    className={`px-2 py-1.5 rounded text-xs border transition-colors capitalize ${
                      provider === p ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <Label htmlFor="ak" className="text-xs">API key</Label>
              <Input
                id="ak"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={provider === 'anthropic' ? 'sk-ant-...' : provider === 'gemini' ? 'AIza...' : 'sk-...'}
                className="font-mono text-xs"
              />
              <Label htmlFor="md" className="text-xs">Model (optional)</Label>
              <Input
                id="md"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={provider === 'anthropic' ? 'claude-3-5-haiku-latest' : provider === 'gemini' ? 'gemini-1.5-flash' : 'gpt-4o-mini'}
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Stored in your browser's localStorage. Only sent to the provider you chose, directly from the preview iframe.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          {initial ? (
            <Button variant="ghost" size="sm" onClick={handleDisable} className="text-destructive">
              <Trash2 size={13} /> <span className="ml-1">Disable</span>
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
