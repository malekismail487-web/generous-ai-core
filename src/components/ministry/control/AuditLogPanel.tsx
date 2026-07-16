import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMinistryControl, type AuditEntry } from '@/hooks/useMinistryControl';

export function AuditLogPanel() {
  const { toast } = useToast();
  const api = useMinistryControl();
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listAudit();
      setItems(data);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Load failed', description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [api, toast]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      i.action.toLowerCase().includes(q) ||
      (i.entity_type ?? '').toLowerCase().includes(q) ||
      (i.actor_label ?? '').toLowerCase().includes(q),
    );
  }, [items, query]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by action, actor, or entity type…"
          className="bg-gray-900 border-gray-800 max-w-sm" />
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
        <span className="ml-auto text-xs text-gray-600">
          {filtered.length} of {items.length} entries · immutable
        </span>
      </div>

      <div className="border border-gray-800 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-800 hover:bg-transparent">
              <TableHead className="text-gray-500 w-40">When</TableHead>
              <TableHead className="text-gray-500">Action</TableHead>
              <TableHead className="text-gray-500">Entity</TableHead>
              <TableHead className="text-gray-500">Actor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={4} className="text-center py-10">
                <Loader2 className="w-5 h-5 animate-spin inline text-emerald-500" />
              </TableCell></TableRow>
            )}
            {!loading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-gray-600 py-10">
                No audit entries.
              </TableCell></TableRow>
            )}
            {!loading && filtered.map((entry) => (
              <TableRow key={entry.id} className="border-gray-800/50 cursor-pointer hover:bg-gray-900/40"
                onClick={() => setSelected(entry)}>
                <TableCell className="text-gray-500 text-xs whitespace-nowrap">
                  {new Date(entry.created_at).toLocaleString()}
                </TableCell>
                <TableCell className="text-gray-200 font-mono text-xs">{entry.action}</TableCell>
                <TableCell className="text-gray-400 text-xs">
                  {entry.entity_type ?? '—'}
                  {entry.entity_id && <span className="text-gray-600"> · {entry.entity_id.slice(0, 8)}</span>}
                </TableCell>
                <TableCell className="text-gray-400 text-xs">{entry.actor_label}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {selected && (
        <div className="border border-gray-800 rounded-lg p-4 bg-gray-950 space-y-3">
          <div className="flex items-baseline justify-between">
            <p className="text-sm text-gray-200 font-mono">{selected.action}</p>
            <button className="text-xs text-gray-500 hover:text-gray-300" onClick={() => setSelected(null)}>
              close
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">Before</p>
              <pre className="text-[11px] bg-black/40 border border-gray-800 p-2 rounded max-h-56 overflow-auto">
                {selected.before_state ? JSON.stringify(selected.before_state, null, 2) : '—'}
              </pre>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">After</p>
              <pre className="text-[11px] bg-black/40 border border-gray-800 p-2 rounded max-h-56 overflow-auto">
                {selected.after_state ? JSON.stringify(selected.after_state, null, 2) : '—'}
              </pre>
            </div>
          </div>
          {selected.metadata && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">Metadata</p>
              <pre className="text-[11px] bg-black/40 border border-gray-800 p-2 rounded max-h-40 overflow-auto">
                {JSON.stringify(selected.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
