import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Copy, KeyRound, Loader2, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function MinistryCodeGenerator() {
  const [generating, setGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<Date | null>(null);
  const [cooldownText, setCooldownText] = useState('');

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Countdown for code expiry
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const remaining = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      if (remaining <= 0) {
        setCountdown('Expired');
        setGeneratedCode(null);
        return;
      }
      setCountdown(formatTime(remaining));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  // Countdown for cooldown
  useEffect(() => {
    if (!cooldownUntil) return;
    const tick = () => {
      const remaining = Math.max(0, Math.floor((cooldownUntil.getTime() - Date.now()) / 1000));
      if (remaining <= 0) {
        setCooldownUntil(null);
        setCooldownText('');
        return;
      }
      setCooldownText(formatTime(remaining));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const generate = useCallback(async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.rpc('generate_ministry_invite_code');
      if (error) throw error;
      const result = data as any;
      if (!result.success) {
        if (result.cooldown_until) {
          setCooldownUntil(new Date(result.cooldown_until));
        }
        toast({ title: 'Cannot generate', description: result.error, variant: 'destructive' });
        return;
      }
      setGeneratedCode(result.code);
      setExpiresAt(new Date(result.expires_at));
      setCooldownUntil(new Date(result.expires_at));
      setDialogOpen(true);
      setCopied(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  }, []);

  const copyCode = () => {
    if (!generatedCode) return;
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    toast({ title: 'Copied!', description: 'Ministry code copied to clipboard.' });
  };

  return (
    <div className="space-y-6">
      <div className="glass-effect rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-amber-500 to-orange-600 text-white">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-semibold text-lg">Ministry Access Code</h2>
            <p className="text-sm text-muted-foreground">Generate a one-time 100-character code</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-muted/50 rounded-xl p-4 text-sm text-muted-foreground space-y-2">
            <p>• Each code expires after <strong>15 minutes</strong></p>
            <p>• Only the SHA-256 hash is stored — plaintext shown once</p>
            <p>• Previous codes are deactivated on generation</p>
            <p>• 15-minute cooldown between generations</p>
          </div>

          {cooldownUntil && cooldownText && (
            <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <Clock size={14} />
              <span>Cooldown active — next code available in {cooldownText}</span>
            </div>
          )}

          <Button
            onClick={generate}
            disabled={generating || !!(cooldownUntil && cooldownText)}
            className="w-full gap-2"
            size="lg"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <KeyRound className="w-4 h-4" />
            )}
            Generate Ministry Code
          </Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" />
              Ministry Access Code Generated
            </DialogTitle>
            <DialogDescription>
              This code will only be shown once. Copy it now.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              {countdown === 'Expired' ? (
                <span className="text-destructive flex items-center gap-1">
                  <AlertTriangle size={14} /> Code expired
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <Clock size={14} /> Expires in {countdown}
                </span>
              )}
            </div>

            {generatedCode && countdown !== 'Expired' ? (
              <div
                className="bg-muted rounded-xl p-4 font-mono text-xs break-all select-all cursor-pointer border-2 border-dashed border-primary/30 hover:border-primary/60 transition-colors"
                onClick={copyCode}
              >
                {generatedCode}
              </div>
            ) : (
              <div className="bg-destructive/10 rounded-xl p-4 text-center text-sm text-destructive">
                This code has expired. Generate a new one.
              </div>
            )}

            <Button
              onClick={copyCode}
              disabled={!generatedCode || countdown === 'Expired'}
              className="w-full gap-2"
              variant={copied ? 'secondary' : 'default'}
            >
              {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
              {copied ? 'Copied!' : 'Copy Code'}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              ⚠️ This code is shown once and never stored in plaintext.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
