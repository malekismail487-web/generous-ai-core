import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useMinistryControl } from '@/hooks/useMinistryControl';
import { DraftChangeButton, parseJsonField } from './DraftChangeButton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCcw } from 'lucide-react';

interface Subject {
  id: string; subject_code: string; name: string; description: string | null;
  applies_grades: number[]; language: string | null; status: string;
  version_id: string | null; updated_at: string;
}
interface Version {
  id: string; label: string; status: string; effective_from: string | null; effective_to: string | null;
}

export function CurriculumPanel() {
  const { toast } = useToast();
  const api = useMinistryControl();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, v] = await Promise.all([
        supabase.rpc('list_mc_curriculum_subjects' as never, { p_session_token: api.token } as never),
        supabase.rpc('list_mc_curriculum_versions' as never, { p_session_token: api.token } as never),
      ]);
      if (s.error) throw s.error;
      if (v.error) throw v.error;
      setSubjects((s.data ?? []) as Subject[]);
      setVersions((v.data ?? []) as Version[]);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Load failed', description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [api.token, toast]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-6">
      {/* Curriculum Versions */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-600">Curriculum versions</p>
            <p className="text-xs text-gray-500">Named editions students are enrolled under (e.g. "Saudi 2028").</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={load}>
              <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <DraftChangeButton
              entityType="curriculum.version"
              buttonLabel="Draft version"
              dialogTitle="Draft curriculum version"
              dialogDescription="Named curriculum editions are tenant-scoped. Publishing enters Draft → Review → Publish."
              buildTitle={(v) => `Curriculum version: ${v.label}`}
              buildPayload={(v) => ({
                label: v.label,
                effective_from: v.effective_from || null,
                effective_to: v.effective_to || null,
                status: v.status || 'active',
                notes: v.notes || null,
              })}
              fields={[
                { key: 'label', label: 'Label', placeholder: 'Saudi 2028', required: true },
                { key: 'effective_from', label: 'Effective from (YYYY-MM-DD)', placeholder: '2028-09-01' },
                { key: 'effective_to', label: 'Effective to (YYYY-MM-DD)' },
                { key: 'status', label: 'Status', default: 'active', help: 'draft | active | retired' },
                { key: 'notes', label: 'Notes', type: 'textarea' },
              ]}
              onSubmitted={load}
            />
          </div>
        </div>
        <div className="border border-gray-800 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-800 hover:bg-transparent">
                <TableHead className="text-gray-500">Label</TableHead>
                <TableHead className="text-gray-500">Status</TableHead>
                <TableHead className="text-gray-500">Effective</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={3} className="text-center py-6"><Loader2 className="w-4 h-4 animate-spin inline text-emerald-500" /></TableCell></TableRow>}
              {!loading && versions.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-gray-600 py-6">No versions yet.</TableCell></TableRow>}
              {versions.map((v) => (
                <TableRow key={v.id} className="border-gray-800/50">
                  <TableCell className="text-gray-200">{v.label}</TableCell>
                  <TableCell className="text-emerald-300 text-xs">{v.status}</TableCell>
                  <TableCell className="text-gray-500 text-xs">
                    {v.effective_from ?? '—'} → {v.effective_to ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Official subjects */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-600">Official subjects</p>
            <p className="text-xs text-gray-500">Nationally recognized subjects. Automatically propagate to every school in the tenant.</p>
          </div>
          <DraftChangeButton
            entityType="curriculum.subject"
            buttonLabel="Draft subject"
            dialogTitle="Draft official subject"
            dialogDescription="Once published, this subject appears in every school of your tenant."
            buildTitle={(v) => `Curriculum subject: ${v.name || v.subject_code}`}
            buildPayload={(v) => {
              const grades = v.applies_grades
                ? v.applies_grades.split(',').map((g) => parseInt(g.trim(), 10)).filter((n) => !Number.isNaN(n))
                : [];
              return {
                action: v.action || 'upsert',
                subject_code: v.subject_code,
                name: v.name,
                description: v.description || null,
                applies_grades: grades,
                language: v.language || null,
                version_id: v.version_id || null,
                learning_standards: parseJsonField(v.learning_standards || '[]', []),
              };
            }}
            fields={[
              { key: 'action', label: 'Action', default: 'upsert', help: 'upsert | retire' },
              { key: 'subject_code', label: 'Subject code', placeholder: 'BIO', required: true },
              { key: 'name', label: 'Name', placeholder: 'Biology', required: true },
              { key: 'description', label: 'Description', type: 'textarea' },
              { key: 'applies_grades', label: 'Applies to grades', placeholder: '9,10,11,12', help: 'Comma-separated grade numbers.' },
              { key: 'language', label: 'Language', placeholder: 'en / ar' },
              { key: 'version_id', label: 'Curriculum version ID (optional)' },
              { key: 'learning_standards', label: 'Learning standards (JSON array)', type: 'json', default: '[]' },
            ]}
            onSubmitted={load}
          />
        </div>
        <div className="border border-gray-800 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-800 hover:bg-transparent">
                <TableHead className="text-gray-500">Code</TableHead>
                <TableHead className="text-gray-500">Name</TableHead>
                <TableHead className="text-gray-500">Grades</TableHead>
                <TableHead className="text-gray-500">Language</TableHead>
                <TableHead className="text-gray-500">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={5} className="text-center py-6"><Loader2 className="w-4 h-4 animate-spin inline text-emerald-500" /></TableCell></TableRow>}
              {!loading && subjects.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-gray-600 py-6">No official subjects yet. Draft one to seed the tenant curriculum.</TableCell></TableRow>}
              {subjects.map((s) => (
                <TableRow key={s.id} className="border-gray-800/50">
                  <TableCell className="font-mono text-xs text-gray-300">{s.subject_code}</TableCell>
                  <TableCell className="text-gray-200">{s.name}</TableCell>
                  <TableCell className="text-gray-500 text-xs">{(s.applies_grades ?? []).join(', ') || '—'}</TableCell>
                  <TableCell className="text-gray-500 text-xs">{s.language ?? '—'}</TableCell>
                  <TableCell>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                      s.status === 'active'
                        ? 'text-emerald-300 bg-emerald-950/50 border-emerald-800/50'
                        : 'text-gray-500 bg-gray-950 border-gray-800'
                    }`}>{s.status}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
