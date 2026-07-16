import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useMinistryControl } from '@/hooks/useMinistryControl';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2, RefreshCcw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Session {
  id: string; tenant_id: string; ip_address: string | null;
  is_active: boolean; created_at: string; last_activity: string; expires_at: string;
}

/**
 * MC11 — Security & Sessions
 *
 * Read-only surface. Session administration (revocation, ministry account
 * suspension) is intentionally scoped to Super Admin operations and is not
 * exposed as a ministry-level publishable change. The ministry sees who is
 * signed in, whether a session is currently active, and IP origin — that is
 * enough for oversight without granting session termination authority to
 * every named ministry role.
 */
export function SecurityPanel() {
  const { toast } = useToast();
  const api = useMinistryControl();
  const [items, setItems] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('list_ministry_sessions' as never, {
        p_session_token: api.token,
        p_limit: 100,
      } as never);
      if (error) throw error;
      setItems((data ?? []) as Session[]);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Load failed', description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [api.token, toast]);

  useEffect(() => { void load(); }, [load]);

  const active = items.filter((s) => s.is_active && new Date(s.expires_at) > new Date());
  const historical = items.filter((s) => !active.includes(s));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500 mt-0.5" />
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-600">Ministry sessions</p>
            <p className="text-xs text-gray-500">Read-only view. Session administration remains with Super Admin.</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <SessionTable label="Active sessions" rows={active} loading={loading} highlight />
      <SessionTable label="Historical sessions" rows={historical} loading={loading} />
    </div>
  );
}

function SessionTable({ label, rows, loading, highlight }: {
  label: string; rows: Session[]; loading: boolean; highlight?: boolean;
}) {
  return (
    <section>
      <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">{label} ({rows.length})</p>
      <div className={`border rounded-lg overflow-hidden ${highlight ? 'border-emerald-900/40' : 'border-gray-800'}`}>
        <Table>
          <TableHeader>
            <TableRow className="border-gray-800 hover:bg-transparent">
              <TableHead className="text-gray-500">Started</TableHead>
              <TableHead className="text-gray-500">Last activity</TableHead>
              <TableHead className="text-gray-500">Expires</TableHead>
              <TableHead className="text-gray-500">IP</TableHead>
              <TableHead className="text-gray-500">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={5} className="text-center py-6"><Loader2 className="w-4 h-4 animate-spin inline text-emerald-500" /></TableCell></TableRow>}
            {!loading && rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-gray-600 py-6">None.</TableCell></TableRow>}
            {rows.map((s) => (
              <TableRow key={s.id} className="border-gray-800/50">
                <TableCell className="text-xs text-gray-400">{new Date(s.created_at).toLocaleString()}</TableCell>
                <TableCell className="text-xs text-gray-400">{new Date(s.last_activity).toLocaleString()}</TableCell>
                <TableCell className="text-xs text-gray-500">{new Date(s.expires_at).toLocaleString()}</TableCell>
                <TableCell className="text-xs font-mono text-gray-500">{s.ip_address ?? '—'}</TableCell>
                <TableCell>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                    s.is_active && new Date(s.expires_at) > new Date()
                      ? 'text-emerald-300 bg-emerald-950/50 border-emerald-800/50'
                      : 'text-gray-500 bg-gray-950 border-gray-800'
                  }`}>
                    {s.is_active && new Date(s.expires_at) > new Date() ? 'active' : 'closed'}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
