import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Key, ArrowRight, SkipForward, ExternalLink, CheckCircle2, Loader2, AlertTriangle, Zap, Shield } from 'lucide-react';

export default function ApiKeySetup() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [primaryKey, setPrimaryKey] = useState('');
  const [fallbackKey, setFallbackKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingPrimary, setIsTestingPrimary] = useState(false);
  const [isTestingFallback, setIsTestingFallback] = useState(false);
  const [primaryTested, setPrimaryTested] = useState(false);
  const [fallbackTested, setFallbackTested] = useState(false);
  const [existingKeys, setExistingKeys] = useState<{ primary: string | null; fallback: string | null }>({ primary: null, fallback: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('user_api_keys')
      .select('groq_api_key, groq_fallback_api_key')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.groq_api_key) {
          setExistingKeys({ primary: data.groq_api_key, fallback: (data as any).groq_fallback_api_key || null });
          setPrimaryKey(data.groq_api_key);
          setFallbackKey((data as any).groq_fallback_api_key || '');
        }
        setLoading(false);
      });
  }, [user]);

  const getDestination = () => {
    const dest = sessionStorage.getItem('apiKeySetupReturn') || '/';
    sessionStorage.setItem('iqTestReturn', dest);
    sessionStorage.removeItem('apiKeySetupReturn');
    return '/iq-test';
  };

  const handleSkip = () => {
    toast({
      variant: 'destructive',
      title: '⚠️ No API Keys Set',
      description: 'AI features (chat, exams, lectures, podcasts) will not work until you add your Groq API keys.',
    });
    navigate(getDestination(), { replace: true });
  };

  const testKey = async (key: string, label: string, setTesting: (v: boolean) => void, setTested: (v: boolean) => void) => {
    if (!key.trim().startsWith('gsk_')) {
      toast({ variant: 'destructive', title: 'Invalid Key Format', description: `${label} key must start with "gsk_"` });
      return;
    }
    setTesting(true);
    try {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${key.trim()}` },
      });
      if (res.ok) {
        setTested(true);
        toast({ title: '✅ Key Valid!', description: `${label} key works correctly.` });
      } else {
        toast({ variant: 'destructive', title: 'Invalid Key', description: `${label} key was rejected by Groq.` });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Test Failed', description: 'Could not reach Groq. Check your internet connection.' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!user || !primaryKey.trim()) return;
    if (!primaryKey.trim().startsWith('gsk_')) {
      toast({ variant: 'destructive', title: 'Invalid Key Format', description: 'Primary key must start with "gsk_"' });
      return;
    }
    if (fallbackKey.trim() && !fallbackKey.trim().startsWith('gsk_')) {
      toast({ variant: 'destructive', title: 'Invalid Key Format', description: 'Fallback key must start with "gsk_"' });
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('user_api_keys')
        .upsert({
          user_id: user.id,
          groq_api_key: primaryKey.trim(),
          groq_fallback_api_key: fallbackKey.trim() || null,
        } as any, { onConflict: 'user_id' });
      if (error) throw error;
      toast({ title: '🎉 API Keys Saved!', description: 'AI features are now powered by your personal keys.' });
      navigate(getDestination(), { replace: true });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Save Failed', description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent mb-2 glow-effect">
            <Zap className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold gradient-text">Connect Your AI Keys</h1>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Lumina uses two Groq API keys — one for the standard model (Meta Llama 3.3 70B) and one for the fallback model (Meta Llama 3.1 8B) when rate limits are hit.
          </p>
        </div>

        {/* Key card */}
        <div className="glass-effect rounded-2xl p-6 space-y-5">
          {existingKeys.primary && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-sm">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>You already have saved API key(s). You can update them below.</span>
            </div>
          )}

          {/* Primary Key */}
          <div className="space-y-2">
            <Label htmlFor="primary-key" className="font-semibold flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-primary" />
              Primary Key — Meta Llama 3.3 70B
            </Label>
            <p className="text-xs text-muted-foreground">The main model for high-quality AI responses.</p>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="primary-key"
                type="password"
                placeholder="gsk_..."
                value={primaryKey}
                onChange={(e) => { setPrimaryKey(e.target.value); setPrimaryTested(false); }}
                className="pl-10 font-mono"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => testKey(primaryKey, 'Primary', setIsTestingPrimary, setPrimaryTested)}
                disabled={!primaryKey.trim() || isTestingPrimary}
              >
                {isTestingPrimary ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                Test
              </Button>
              {primaryTested && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Verified ✓
                </p>
              )}
            </div>
          </div>

          {/* Fallback Key */}
          <div className="space-y-2">
            <Label htmlFor="fallback-key" className="font-semibold flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-amber-500" />
              Fallback Key — Meta Llama 3.1 8B
            </Label>
            <p className="text-xs text-muted-foreground">Used automatically when the primary model is rate-limited. Optional but recommended.</p>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="fallback-key"
                type="password"
                placeholder="gsk_..."
                value={fallbackKey}
                onChange={(e) => { setFallbackKey(e.target.value); setFallbackTested(false); }}
                className="pl-10 font-mono"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => testKey(fallbackKey, 'Fallback', setIsTestingFallback, setFallbackTested)}
                disabled={!fallbackKey.trim() || isTestingFallback}
              >
                {isTestingFallback ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                Test
              </Button>
              {fallbackTested && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Verified ✓
                </p>
              )}
            </div>
          </div>

          {/* How to get keys */}
          <div className="bg-muted/50 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">How to get free keys</p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Go to console.groq.com</li>
              <li>Sign up for a free account</li>
              <li>Click "API Keys" → "Create API Key"</li>
              <li>Create <strong>two separate keys</strong> — one for each model</li>
              <li>Copy and paste them here</li>
            </ol>
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-1"
            >
              <ExternalLink className="w-3 h-3" />
              Open Groq Console
            </a>
          </div>

          <Button
            onClick={handleSave}
            disabled={!primaryKey.trim() || isSaving}
            className="w-full gap-2"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            Save & Continue
          </Button>
        </div>

        {/* Skip */}
        <div className="text-center space-y-2">
          <button
            onClick={handleSkip}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <SkipForward className="w-4 h-4" />
            Skip for now
          </button>
          <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3 text-left">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">
              If you skip, AI features (chat, exam generation, lectures, podcasts) will not function until you add your keys.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
