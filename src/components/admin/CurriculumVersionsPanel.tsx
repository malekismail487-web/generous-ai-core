import { useEffect, useState } from 'react';
import { Loader2, GitBranch } from 'lucide-react';
import { listCurriculumVersions, CurriculumVersion } from '@/lib/adaptive/curriculumGraph';

export function CurriculumVersionsPanel({ schoolId }: { schoolId: string }) {
  const [versions, setVersions] = useState<CurriculumVersion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listCurriculumVersions(schoolId).then(v => { setVersions(v); setLoading(false); });
  }, [schoolId]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card/40 p-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <GitBranch className="w-4 h-4" /> Curriculum Versions
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Every change to subjects, lectures, or concepts is logged here.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : versions.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
          No changes recorded yet.
        </div>
      ) : (
        <ol className="space-y-2">
          {versions.map(v => (
            <li key={v.id} className="rounded-lg border border-border bg-card/40 p-3 text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">{v.version_label || (v.changes as any)?.op || 'change'}</span>
                <span className="text-xs text-muted-foreground">{new Date(v.created_at).toLocaleString()}</span>
              </div>
              <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap font-mono">
                {JSON.stringify(v.changes, null, 2)}
              </pre>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
