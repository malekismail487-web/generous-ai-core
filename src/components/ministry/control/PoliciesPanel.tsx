import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useMinistryControl } from '@/hooks/useMinistryControl';
import { DraftChangeButton, parseJsonField } from './DraftChangeButton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2 } from 'lucide-react';

interface Policy {
  id: string; policy_key: string; title: string; config: Record<string, unknown>;
  allows_school_override: boolean; effective_from: string | null; status: string; updated_at: string;
}

const PRESETS = [
  { key: 'grading.system', title: 'Grading system' },
  { key: 'calendar.academic', title: 'Academic calendar' },
  { key: 'promotion.rules', title: 'Promotion & graduation' },
  { key: 'attendance.min', title: 'Attendance requirements' },
  { key: 'assessment.policy', title: 'Assessment policy' },
];

export function PoliciesPanel() {
  const { toast } = useToast();
  const api = useMinistryControl();
  const [items, setItems] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('list_mc_policies' as never, { p_session_token: api.token } as never);
      if (error) throw error;
      setItems((data ?? []) as Policy[]);
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
          <p className="text-[10px] uppercase tracking-widest text-gray-600">National policies</p>
          <p className="text-xs text-gray-500">Rules every school inherits. Grant `allows_school_override` per policy to permit local variance.</p>
        </div>
        <DraftChangeButton
          entityType="policy.set"
          buttonLabel="Draft policy"
          dialogTitle="Draft educational policy"
          buildTitle={(v) => `Policy: ${v.title || v.policy_key}`}
          buildPayload={(v) => ({
            policy_key: v.policy_key,
            title: v.title,
            config: parseJsonField(v.config || '{}', {}),
            allows_school_override: v.allows_school_override === 'true',
            effective_from: v.effective_from || null,
            status: v.status || 'active',
          })}
          fields={[
            { key: 'policy_key', label: 'Policy key', placeholder: 'grading.system', required: true,
              help: `Common keys: ${PRESETS.map((p) => p.key).join(', ')}` },
            { key: 'title', label: 'Title', placeholder: 'National Grading System', required: true },
            { key: 'config', label: 'Config (JSON)', type: 'json', required: true,
              default: '{\n  "scale": "percent",\n  "passing": 60\n}' },
            { key: 'allows_school_override', label: 'Allow school override? (true/false)', default: 'false' },
            { key: 'effective_from', label: 'Effective from (YYYY-MM-DD)' },
            { key: 'status', label: 'Status', default: 'active', help: 'draft | active | retired' },
          ]}
          onSubmitted={load}
        />
      </div>
      <div className="border border-gray-800 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-800 hover:bg-transparent">
              <TableHead className="text-gray-500">Key</TableHead>
              <TableHead className="text-gray-500">Title</TableHead>
              <TableHead className="text-gray-500">Override?</TableHead>
              <TableHead className="text-gray-500">Status</TableHead>
              <TableHead className="text-gray-500">Config</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={5} className="text-center py-6"><Loader2 className="w-4 h-4 animate-spin inline text-emerald-500" /></TableCell></TableRow>}
            {!loading && items.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-gray-600 py-6">No policies published yet.</TableCell></TableRow>}
            {items.map((p) => (
              <TableRow key={p.id} className="border-gray-800/50 align-top">
                <TableCell className="font-mono text-xs text-gray-300">{p.policy_key}</TableCell>
                <TableCell className="text-gray-200">{p.title}</TableCell>
                <TableCell className="text-xs">
                  <span className={p.allows_school_override ? 'text-amber-300' : 'text-gray-500'}>
                    {p.allows_school_override ? 'schools may override' : 'strict'}
                  </span>
                </TableCell>
                <TableCell className="text-emerald-300 text-xs">{p.status}</TableCell>
                <TableCell>
                  <pre className="text-[10px] bg-black/40 border border-gray-800 rounded p-2 max-w-xs overflow-auto max-h-24">
                    {JSON.stringify(p.config, null, 2)}
                  </pre>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
