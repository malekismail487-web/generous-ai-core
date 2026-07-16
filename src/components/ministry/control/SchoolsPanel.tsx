import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useMinistryControl } from '@/hooks/useMinistryControl';
import { DraftChangeButton } from './DraftChangeButton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2 } from 'lucide-react';

interface School {
  id: string; name: string; code: string; status: string; governance_status: string | null;
  created_at: string;
}

const STATUS_STYLE: Record<string, string> = {
  operational: 'text-emerald-300 bg-emerald-950/50 border-emerald-800/50',
  suspended: 'text-amber-300 bg-amber-950/50 border-amber-800/50',
  archived: 'text-gray-500 bg-gray-950 border-gray-800',
};

export function SchoolsPanel() {
  const { toast } = useToast();
  const api = useMinistryControl();
  const [items, setItems] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('list_mc_schools' as never, { p_session_token: api.token } as never);
      if (error) throw error;
      setItems((data ?? []) as School[]);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Load failed', description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [api.token, toast]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-600">Schools in tenant</p>
          <p className="text-xs text-gray-500">Ministry governs school lifecycle (activation happens through the platform). Every status change flows through Draft &amp; Publish and is recorded in <code className="font-mono">mc_school_lifecycle_events</code>.</p>
        </div>
        <DraftChangeButton
          entityType="school.lifecycle"
          buttonLabel="Draft status change"
          dialogTitle="Draft school lifecycle change"
          buildTitle={(v) => `School status → ${v.new_status}`}
          buildPayload={(v) => ({
            school_id: v.school_id,
            new_status: v.new_status,
            reason: v.reason || null,
          })}
          fields={[
            { key: 'school_id', label: 'School ID', required: true,
              help: 'Copy from the table below.' },
            { key: 'new_status', label: 'New status', required: true, default: 'operational',
              help: 'operational | suspended | archived' },
            { key: 'reason', label: 'Reason', type: 'textarea' },
          ]}
          onSubmitted={load}
        />
      </div>
      <div className="border border-gray-800 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-800 hover:bg-transparent">
              <TableHead className="text-gray-500">Name</TableHead>
              <TableHead className="text-gray-500">Code</TableHead>
              <TableHead className="text-gray-500">Activation</TableHead>
              <TableHead className="text-gray-500">Ministry status</TableHead>
              <TableHead className="text-gray-500">School ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={5} className="text-center py-6"><Loader2 className="w-4 h-4 animate-spin inline text-emerald-500" /></TableCell></TableRow>}
            {!loading && items.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-gray-600 py-6">No schools registered in this tenant yet.</TableCell></TableRow>}
            {items.map((s) => (
              <TableRow key={s.id} className="border-gray-800/50">
                <TableCell className="text-gray-200">{s.name}</TableCell>
                <TableCell className="font-mono text-xs text-gray-400">{s.code}</TableCell>
                <TableCell className="text-xs text-gray-500">{s.status}</TableCell>
                <TableCell>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                    STATUS_STYLE[s.governance_status ?? ''] ?? 'text-gray-500 bg-gray-950 border-gray-800'
                  }`}>
                    {s.governance_status ?? '—'}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-[10px] text-gray-600">{s.id}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
