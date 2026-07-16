import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useMinistryControl } from '@/hooks/useMinistryControl';
import { DraftChangeButton } from './DraftChangeButton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2 } from 'lucide-react';

interface Flag {
  id: string; flag_key: string; enabled: boolean; mode: string | null;
  description: string | null; updated_at: string;
}

const MODE_STYLE: Record<string, string> = {
  required: 'text-emerald-300 bg-emerald-950/50 border-emerald-800/50',
  optional: 'text-sky-300 bg-sky-950/50 border-sky-800/50',
  disabled: 'text-gray-500 bg-gray-950 border-gray-800',
};

export function FeaturesPanel() {
  const { toast } = useToast();
  const api = useMinistryControl();
  const [items, setItems] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('list_mc_feature_flags' as never, { p_session_token: api.token } as never);
      if (error) throw error;
      setItems((data ?? []) as Flag[]);
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
          <p className="text-[10px] uppercase tracking-widest text-gray-600">Feature availability</p>
          <p className="text-xs text-gray-500">
            Each module has three modes:
            <span className="text-gray-400"> Disabled</span> (no school receives it),
            <span className="text-sky-300"> Optional</span> (schools choose), or
            <span className="text-emerald-300"> Required</span> (every school receives it automatically).
          </p>
        </div>
        <DraftChangeButton
          entityType="feature.mode"
          buttonLabel="Draft feature mode"
          dialogTitle="Draft feature availability change"
          buildTitle={(v) => `Feature: ${v.flag_key} → ${v.mode}`}
          buildPayload={(v) => ({
            flag_key: v.flag_key,
            mode: v.mode || 'optional',
            description: v.description || null,
          })}
          fields={[
            { key: 'flag_key', label: 'Feature key', required: true,
              placeholder: 'lumina_live',
              help: 'Examples: lumina_live, podcasts, flashcards, mind_maps, public_library, lct_exams' },
            { key: 'mode', label: 'Mode', required: true, default: 'optional',
              help: 'disabled | optional | required' },
            { key: 'description', label: 'Description' },
          ]}
          onSubmitted={load}
        />
      </div>
      <div className="border border-gray-800 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-800 hover:bg-transparent">
              <TableHead className="text-gray-500">Feature</TableHead>
              <TableHead className="text-gray-500">Mode</TableHead>
              <TableHead className="text-gray-500">Enabled?</TableHead>
              <TableHead className="text-gray-500">Description</TableHead>
              <TableHead className="text-gray-500">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={5} className="text-center py-6"><Loader2 className="w-4 h-4 animate-spin inline text-emerald-500" /></TableCell></TableRow>}
            {!loading && items.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-gray-600 py-6">No feature flags configured for this tenant.</TableCell></TableRow>}
            {items.map((f) => (
              <TableRow key={f.id} className="border-gray-800/50">
                <TableCell className="font-mono text-xs text-gray-300">{f.flag_key}</TableCell>
                <TableCell>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${MODE_STYLE[f.mode ?? 'optional'] ?? MODE_STYLE.optional}`}>
                    {f.mode ?? 'optional'}
                  </span>
                </TableCell>
                <TableCell className="text-xs">{f.enabled ? '✓' : '—'}</TableCell>
                <TableCell className="text-xs text-gray-500">{f.description ?? '—'}</TableCell>
                <TableCell className="text-[10px] text-gray-600">{new Date(f.updated_at).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
