import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Plus, Copy, Trash2, Activity, KeyRound, Power, Code2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

type ApiKey = {
  id: string;
  label: string;
  partner_name: string;
  key_prefix: string;
  monthly_request_quota: number;
  rate_limit_per_minute: number;
  requests_this_month: number;
  last_used_at: string | null;
  is_active: boolean;
  revoked_at: string | null;
  created_at: string;
};

type Usage = {
  id: string;
  api_key_id: string;
  endpoint: string;
  status_code: number;
  tokens_used: number;
  latency_ms: number | null;
  error_message: string | null;
  created_at: string;
};

// Cryptographically secure random key — generated client-side, hashed before send.
function generatePlaintextKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '').replace(/\//g, '').replace(/=/g, '');
  return `lum_live_${b64}`;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function LuminaApiPanel() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newPlaintext, setNewPlaintext] = useState<string | null>(null);
  const [form, setForm] = useState({
    label: '',
    partner_name: '',
    monthly_request_quota: 100000,
    rate_limit_per_minute: 60,
  });

  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lumina-api`;

  const load = async () => {
    setLoading(true);
    const [{ data: k }, { data: u }] = await Promise.all([
      supabase.from('lumina_api_keys').select('*').order('created_at', { ascending: false }),
      supabase.from('lumina_api_usage').select('*').order('created_at', { ascending: false }).limit(100),
    ]);
    setKeys((k as any) || []);
    setUsage((u as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.label.trim() || !form.partner_name.trim()) {
      toast({ variant: 'destructive', title: 'Missing fields', description: 'Label and partner name are required.' });
      return;
    }
    setCreating(true);
    try {
      const plaintext = generatePlaintextKey();
      const hash = await sha256Hex(plaintext);
      const prefix = plaintext.slice(0, 16);
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('lumina_api_keys').insert({
        label: form.label.trim(),
        partner_name: form.partner_name.trim(),
        key_hash: hash,
        key_prefix: prefix,
        monthly_request_quota: form.monthly_request_quota,
        rate_limit_per_minute: form.rate_limit_per_minute,
        created_by: user?.id,
      });
      if (error) throw error;
      setNewPlaintext(plaintext);
      setForm({ label: '', partner_name: '', monthly_request_quota: 100000, rate_limit_per_minute: 60 });
      await load();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Create failed', description: e.message });
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this key? The partner will immediately lose access.')) return;
    const { error } = await supabase.from('lumina_api_keys')
      .update({ is_active: false, revoked_at: new Date().toISOString() })
      .eq('id', id);
    if (error) toast({ variant: 'destructive', title: 'Revoke failed', description: error.message });
    else { toast({ title: 'Key revoked' }); load(); }
  };

  const handleReactivate = async (id: string) => {
    const { error } = await supabase.from('lumina_api_keys')
      .update({ is_active: true, revoked_at: null })
      .eq('id', id);
    if (error) toast({ variant: 'destructive', title: 'Failed', description: error.message });
    else { toast({ title: 'Key reactivated' }); load(); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Permanently delete this key and its usage logs? This cannot be undone.')) return;
    const { error } = await supabase.from('lumina_api_keys').delete().eq('id', id);
    if (error) toast({ variant: 'destructive', title: 'Delete failed', description: error.message });
    else { toast({ title: 'Deleted' }); load(); }
  };

  const copy = (text: string, label = 'Copied') => {
    navigator.clipboard.writeText(text);
    toast({ title: label });
  };

  const totalRequests = usage.length;
  const errorCount = usage.filter((u) => u.status_code >= 400).length;
  const avgLatency = usage.length
    ? Math.round(usage.reduce((s, u) => s + (u.latency_ms || 0), 0) / usage.length)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <KeyRound className="w-6 h-6" /> Lumina API Keys
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Issue API keys to partners (e.g. robotics, kiosks, third-party apps) to access Lumina's adaptive AI.
          </p>
        </div>
        <Button onClick={() => { setNewPlaintext(null); setShowCreate(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> New API Key
        </Button>
      </div>

      <Tabs defaultValue="keys">
        <TabsList>
          <TabsTrigger value="keys">Keys ({keys.length})</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="docs">API Docs</TabsTrigger>
        </TabsList>

        <TabsContent value="keys" className="space-y-3 mt-4">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : keys.length === 0 ? (
            <div className="glass-effect rounded-xl p-8 text-center text-muted-foreground">
              No API keys yet. Click "New API Key" to issue one.
            </div>
          ) : keys.map((k) => (
            <div key={k.id} className="glass-effect rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    {k.label}
                    {!k.is_active && <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">Revoked</span>}
                  </div>
                  <div className="text-sm text-muted-foreground">{k.partner_name}</div>
                </div>
                <div className="flex gap-2">
                  {k.is_active ? (
                    <Button size="sm" variant="outline" onClick={() => handleRevoke(k.id)} className="gap-1">
                      <Power className="w-3.5 h-3.5" /> Revoke
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => handleReactivate(k.id)}>Reactivate</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(k.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div className="font-mono text-xs bg-muted/50 px-3 py-2 rounded-lg">
                {k.key_prefix}••••••••••••••••
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div><div className="text-muted-foreground">Requests / month</div><div className="font-semibold">{k.requests_this_month.toLocaleString()} / {k.monthly_request_quota.toLocaleString()}</div></div>
                <div><div className="text-muted-foreground">Rate limit</div><div className="font-semibold">{k.rate_limit_per_minute}/min</div></div>
                <div><div className="text-muted-foreground">Last used</div><div className="font-semibold">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'Never'}</div></div>
                <div><div className="text-muted-foreground">Created</div><div className="font-semibold">{new Date(k.created_at).toLocaleDateString()}</div></div>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="usage" className="space-y-3 mt-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="glass-effect rounded-xl p-4"><div className="text-xs text-muted-foreground">Recent requests</div><div className="text-2xl font-bold">{totalRequests}</div></div>
            <div className="glass-effect rounded-xl p-4"><div className="text-xs text-muted-foreground">Errors</div><div className="text-2xl font-bold text-destructive">{errorCount}</div></div>
            <div className="glass-effect rounded-xl p-4"><div className="text-xs text-muted-foreground">Avg latency</div><div className="text-2xl font-bold">{avgLatency}ms</div></div>
          </div>
          <div className="glass-effect rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4" /> Last 100 requests
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {usage.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No usage yet.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background/95 backdrop-blur">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-3 py-2">Time</th>
                      <th className="px-3 py-2">Key</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Tokens</th>
                      <th className="px-3 py-2">Latency</th>
                      <th className="px-3 py-2">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.map((u) => {
                      const k = keys.find((kk) => kk.id === u.api_key_id);
                      return (
                        <tr key={u.id} className="border-t border-border/50">
                          <td className="px-3 py-2">{new Date(u.created_at).toLocaleTimeString()}</td>
                          <td className="px-3 py-2">{k?.label || '—'}</td>
                          <td className={`px-3 py-2 font-semibold ${u.status_code >= 400 ? 'text-destructive' : 'text-emerald-500'}`}>{u.status_code}</td>
                          <td className="px-3 py-2">{u.tokens_used}</td>
                          <td className="px-3 py-2">{u.latency_ms}ms</td>
                          <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">{u.error_message || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="docs" className="mt-4">
          <div className="glass-effect rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 font-semibold"><Code2 className="w-5 h-5" /> Lumina API — Quick Start</div>
            <div>
              <div className="text-sm font-semibold mb-1">Endpoint</div>
              <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2 font-mono text-xs break-all">
                <span className="flex-1">POST {apiUrl}</span>
                <Button size="sm" variant="ghost" onClick={() => copy(apiUrl, 'Endpoint copied')}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold mb-1">Example request</div>
              <pre className="bg-muted/50 rounded-lg p-3 text-xs overflow-x-auto">{`curl -X POST ${apiUrl} \\
  -H "Authorization: Bearer lum_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [
      { "role": "user", "content": "Explain photosynthesis to a 10-year-old." }
    ],
    "stream": false
  }'`}</pre>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>• Set <code className="bg-muted px-1 rounded">stream: true</code> to receive Server-Sent Events.</p>
              <p>• Lumina keeps its own personality and adaptive teaching style — partners do <strong>not</strong> need to add a system prompt.</p>
              <p>• Quota and per-minute rate limits are enforced server-side.</p>
              <p>• Errors return JSON: <code className="bg-muted px-1 rounded">{`{ "error": "..." }`}</code> with codes 401/429/402/500.</p>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) setNewPlaintext(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{newPlaintext ? 'Save this key now' : 'Issue new Lumina API key'}</DialogTitle>
          </DialogHeader>

          {newPlaintext ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This is the only time the full key will be shown. Copy it and hand it to the partner securely.
              </p>
              <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs break-all">{newPlaintext}</div>
              <Button onClick={() => copy(newPlaintext, 'Key copied to clipboard')} className="w-full gap-2">
                <Copy className="w-4 h-4" /> Copy key
              </Button>
              <Button variant="outline" onClick={() => { setShowCreate(false); setNewPlaintext(null); }} className="w-full">Done</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>Label</Label>
                <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Spark Robotics — Production" />
              </div>
              <div>
                <Label>Partner / Company</Label>
                <Input value={form.partner_name} onChange={(e) => setForm({ ...form, partner_name: e.target.value })} placeholder="e.g. Spark Robotics" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Monthly quota</Label>
                  <Input type="number" value={form.monthly_request_quota} onChange={(e) => setForm({ ...form, monthly_request_quota: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Rate / min</Label>
                  <Input type="number" value={form.rate_limit_per_minute} onChange={(e) => setForm({ ...form, rate_limit_per_minute: Number(e.target.value) })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={creating} className="gap-2">
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />} Create
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
