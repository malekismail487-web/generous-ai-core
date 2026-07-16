import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useMinistryControl } from '@/hooks/useMinistryControl';
import { DraftChangeButton } from './DraftChangeButton';
import { Loader2 } from 'lucide-react';

interface Notice {
  id: string; title: string; body: string; severity: string;
  published: boolean; published_at: string | null; created_at: string;
}

const SEVERITY_STYLE: Record<string, string> = {
  info: 'text-sky-300 bg-sky-950/50 border-sky-800/50',
  warning: 'text-amber-300 bg-amber-950/50 border-amber-800/50',
  critical: 'text-red-300 bg-red-950/50 border-red-800/50',
};

export function CommunicationsPanel() {
  const { toast } = useToast();
  const api = useMinistryControl();
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('list_mc_notices' as never, { p_session_token: api.token } as never);
      if (error) throw error;
      setItems((data ?? []) as Notice[]);
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
          <p className="text-[10px] uppercase tracking-widest text-gray-600">National notices</p>
          <p className="text-xs text-gray-500">Ministry-wide announcements propagate to every school user in this tenant. Every publish is captured in the audit log.</p>
        </div>
        <DraftChangeButton
          entityType="communication.notice"
          buttonLabel="Draft notice"
          dialogTitle="Draft national notice"
          buildTitle={(v) => `Notice: ${v.title}`}
          buildPayload={(v) => ({
            title: v.title,
            body: v.body,
            severity: v.severity || 'info',
          })}
          fields={[
            { key: 'title', label: 'Title', required: true },
            { key: 'body', label: 'Body', type: 'textarea', required: true },
            { key: 'severity', label: 'Severity', default: 'info', help: 'info | warning | critical' },
          ]}
          onSubmitted={load}
        />
      </div>

      {loading && <div className="text-center py-6"><Loader2 className="w-4 h-4 animate-spin inline text-emerald-500" /></div>}
      {!loading && items.length === 0 && (
        <p className="text-center text-gray-600 py-8 border border-dashed border-gray-800 rounded-lg">
          No notices published yet.
        </p>
      )}
      <div className="space-y-2">
        {items.map((n) => (
          <article key={n.id} className="border border-gray-800 rounded-lg p-4 bg-gray-950">
            <header className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${SEVERITY_STYLE[n.severity] ?? SEVERITY_STYLE.info}`}>
                  {n.severity}
                </span>
                <h3 className="text-sm font-semibold text-gray-200">{n.title}</h3>
              </div>
              <span className="text-[10px] text-gray-600">
                {n.published_at ? new Date(n.published_at).toLocaleString() : 'draft'}
              </span>
            </header>
            <p className="text-xs text-gray-400 whitespace-pre-wrap">{n.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
