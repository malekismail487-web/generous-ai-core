import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useMinistryControl } from '@/hooks/useMinistryControl';
import { DraftChangeButton } from './DraftChangeButton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2 } from 'lucide-react';

interface Region {
  id: string; name: string; code: string | null; kind: string;
  parent_id: string | null; created_at: string;
}

export function RegionsPanel() {
  const { toast } = useToast();
  const api = useMinistryControl();
  const [items, setItems] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('list_mc_regions' as never, { p_session_token: api.token } as never);
      if (error) throw error;
      setItems((data ?? []) as Region[]);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Load failed', description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [api.token, toast]);

  useEffect(() => { void load(); }, [load]);

  const byKind = items.reduce<Record<string, Region[]>>((acc, r) => {
    (acc[r.kind] ||= []).push(r); return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Educational geography</p>
          <p className="text-xs text-muted-foreground">Regions contain districts; districts contain zones. Schools are assigned to any level.</p>
        </div>
        <div className="flex gap-2">
          <DraftChangeButton
            entityType="region.upsert"
            buttonLabel="Draft region"
            dialogTitle="Draft region / district / zone"
            buildTitle={(v) => `${v.kind || 'region'}: ${v.name}`}
            buildPayload={(v) => ({
              id: v.id || undefined,
              name: v.name,
              kind: v.kind || 'region',
              code: v.code || null,
              parent_id: v.parent_id || null,
            })}
            fields={[
              { key: 'name', label: 'Name', required: true, placeholder: 'Riyadh Region' },
              { key: 'kind', label: 'Kind', default: 'region', help: 'region | district | zone' },
              { key: 'code', label: 'Code (optional)' },
              { key: 'parent_id', label: 'Parent region ID (optional)' },
              { key: 'id', label: 'Existing region ID (leave empty to create)' },
            ]}
            onSubmitted={load}
          />
          <DraftChangeButton
            entityType="school.region_assignment"
            buttonLabel="Draft assignment"
            dialogTitle="Draft school → region assignment"
            buildTitle={(v) => `${v.action || 'assign'} school ↔ region`}
            buildPayload={(v) => ({
              school_id: v.school_id,
              region_id: v.region_id,
              action: v.action || 'assign',
            })}
            fields={[
              { key: 'school_id', label: 'School ID', required: true },
              { key: 'region_id', label: 'Region ID', required: true },
              { key: 'action', label: 'Action', default: 'assign', help: 'assign | unassign' },
            ]}
          />
        </div>
      </div>

      {loading && <div className="text-center py-6"><Loader2 className="w-4 h-4 animate-spin inline text-emerald-500" /></div>}
      {!loading && items.length === 0 && (
        <p className="text-center text-muted-foreground py-6 border border-dashed border-gray-800 rounded-lg">
          No regions defined for this tenant yet.
        </p>
      )}
      {!loading && (['region', 'district', 'zone'] as const).map((kind) => {
        const rows = byKind[kind] ?? [];
        if (rows.length === 0) return null;
        return (
          <section key={kind}>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">{kind}s</p>
            <div className="border border-gray-800 rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800 hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Name</TableHead>
                    <TableHead className="text-muted-foreground">Code</TableHead>
                    <TableHead className="text-muted-foreground">Parent</TableHead>
                    <TableHead className="text-muted-foreground">Region ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} className="border-gray-800/50">
                      <TableCell className="text-foreground">{r.name}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{r.code ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground text-[10px] font-mono">{r.parent_id?.slice(0, 8) ?? '—'}</TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground">{r.id}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
