/**
 * FeatureFlagsEditor — Super-Admin surface for per-tenant feature flags.
 *
 * Lists existing flags for a tenant via the `list_feature_flags(p_tenant_id)`
 * RPC, lets the admin toggle `enabled`, and supports authoring new flags via
 * `set_feature_flag(...)`. All writes go through the RPC — never a direct
 * table UPDATE — so authorization stays server-side.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Loader2, Flag, Plus } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface FlagRow {
  id: string;
  flag_key: string;
  enabled: boolean;
  description: string | null;
  updated_at: string;
}

export default function FeatureFlagsEditor({ tenantId }: { tenantId: string }) {
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [newFlag, setNewFlag] = useState({ key: '', description: '' });
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('list_feature_flags', { p_tenant_id: tenantId });
    if (!error) setFlags(((data ?? []) as FlagRow[]));
    setLoading(false);
  };

  useEffect(() => { load(); }, [tenantId]);

  const toggle = async (row: FlagRow, next: boolean) => {
    setSavingKey(row.flag_key);
    const { data, error } = await supabase.rpc('set_feature_flag', {
      p_tenant_id: tenantId,
      p_flag_key: row.flag_key,
      p_enabled: next,
      p_config: {},
      p_description: row.description,
    });
    setSavingKey(null);
    const result = data as { success: boolean; error?: string } | null;
    if (error || !result?.success) {
      toast({ variant: 'destructive', title: 'Could not save flag', description: error?.message || result?.error });
      return;
    }
    setFlags((prev) => prev.map((f) => (f.flag_key === row.flag_key ? { ...f, enabled: next } : f)));
  };

  const create = async () => {
    const key = newFlag.key.trim().toLowerCase().replace(/\s+/g, '_');
    if (!key) { toast({ variant: 'destructive', title: 'Flag key required' }); return; }
    setCreating(true);
    const { data, error } = await supabase.rpc('set_feature_flag', {
      p_tenant_id: tenantId,
      p_flag_key: key,
      p_enabled: false,
      p_config: {},
      p_description: newFlag.description || null,
    });
    setCreating(false);
    const result = data as { success: boolean; error?: string } | null;
    if (error || !result?.success) {
      toast({ variant: 'destructive', title: 'Could not create flag', description: error?.message || result?.error });
      return;
    }
    setNewFlag({ key: '', description: '' });
    load();
  };

  return (
    <div className="mt-3 border-t border-border/40 pt-3">
      <div className="flex items-center gap-2 mb-2">
        <Flag className="w-3.5 h-3.5" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Feature flags
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
      ) : flags.length === 0 ? (
        <p className="text-xs text-muted-foreground italic mb-2">No flags configured yet.</p>
      ) : (
        <div className="space-y-1.5">
          {flags.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-3 bg-muted/30 rounded px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-mono">{f.flag_key}</p>
                {f.description && (
                  <p className="text-[11px] text-muted-foreground truncate">{f.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {savingKey === f.flag_key && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                <Switch checked={f.enabled} onCheckedChange={(v) => toggle(f, v)} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
        <Input
          placeholder="new_flag_key"
          value={newFlag.key}
          onChange={(e) => setNewFlag({ ...newFlag, key: e.target.value })}
        />
        <Input
          placeholder="description (optional)"
          value={newFlag.description}
          onChange={(e) => setNewFlag({ ...newFlag, description: e.target.value })}
        />
        <Button size="sm" variant="outline" onClick={create} disabled={creating} className="gap-1">
          {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Add
        </Button>
      </div>
    </div>
  );
}
