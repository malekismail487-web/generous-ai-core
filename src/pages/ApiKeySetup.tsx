import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Key, ArrowRight, SkipForward, ExternalLink, CheckCircle2, Loader2, AlertTriangle, Zap } from 'lucide-react';

export default function ApiKeySetup() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [tested, setTested] = useState(false);
  const [existingKey, setExistingKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    // Check if user already has a key
    supabase
      .from('user_api_keys')
      .select('groq_api_key')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.groq_api_key) {
          setExistingKey(data.groq_api_key);
          setApiKey(data.groq_api_key);
        }
        setLoading(false);
      });
  }, [user]);

  const getDestination = () => {
    const dest = sessionStorage.getItem('apiKeySetupReturn') || '/';
    // After API key setup, go to IQ test (which will check if already done)
    sessionStorage.setItem('iqTestReturn', dest);
    sessionStorage.removeItem('apiKeySetupReturn');
    return '/iq-test';
  };

  const handleSkip = () => {
    toast({
      variant: 'destructive',
      title: '⚠️ No API Key Set',
      description: 'AI features (chat, exams, lectures, podcasts) will not work until you add a Groq API key.',
    });
    navigate(getDestination(), { replace: true });
  };

  const handleTestKey = async () => {
    if (!apiKey.trim().startsWith('gsk_')) {
      toast({ variant: 'destructive', title: 'Invalid Key Format', description: 'Groq API keys start with "gsk_"' });
      return;
    }
    setIsTesting(true);
    try {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
      });
      if (res.ok) {
        setTested(true);
        toast({ title: '✅ Key Valid!', description: 'Your Groq API key works correctly.' });
      } else {
        toast({ variant: 'destructive', title: 'Invalid Key', description: 'This API key was rejected by Groq.' });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Test Failed', description: 'Could not reach Groq. Check your internet connection.' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!user || !apiKey.trim()) return;
    if (!apiKey.trim().startsWith('gsk_')) {
      toast({ variant: 'destructive', title: 'Invalid Key Format', description: 'Groq API keys start with "gsk_"' });
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('user_api_keys')
        .upsert({ user_id: user.id, groq_api_key: apiKey.trim() }, { onConflict: 'user_id' });
      if (error) throw error;
      toast({ title: '🎉 API Key Saved!', description: 'All AI features are now powered by your personal key.' });
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
          <h1 className="text-2xl font-bold gradient-text">Connect Your AI Key</h1>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Lumina uses Groq's free API. Each key resets daily — using your own key ensures uninterrupted AI access.
          </p>
        </div>

        {/* Key card */}
        <div className="glass-effect rounded-2xl p-6 space-y-5">
          {existingKey && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-sm">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>You already have a saved API key. You can update it below.</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="api-key" className="font-semibold">Your Groq API Key</Label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="api-key"
                type="password"
                placeholder="gsk_..."
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setTested(false); }}
                className="pl-10 font-mono"
              />
            </div>
            {tested && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Key verified ✓
              </p>
            )}
          </div>

          {/* How to get a key */}
          <div className="bg-muted/50 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">How to get a free key</p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Go to console.groq.com</li>
              <li>Sign up for a free account</li>
              <li>Click "API Keys" → "Create API Key"</li>
              <li>Copy and paste it here</li>
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

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleTestKey}
              disabled={!apiKey.trim() || isTesting}
              className="flex-1"
            >
              {isTesting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Test Key
            </Button>
            <Button
              onClick={handleSave}
              disabled={!apiKey.trim() || isSaving}
              className="flex-1 gap-2"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              Save & Continue
            </Button>
          </div>
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
              If you skip, AI features (chat, exam generation, lectures, podcasts) will not function until you add a key.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
