import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useMinistryControl } from '@/hooks/useMinistryControl';
import { DraftChangeButton, parseJsonField } from './DraftChangeButton';
import { Loader2 } from 'lucide-react';

interface Config {
  id: string; tenant_id: string;
  terminology: Record<string, unknown>;
  explanation_style: Record<string, unknown>;
  vocabulary: Record<string, unknown>;
  pacing: Record<string, unknown>;
  accessibility: Record<string, unknown>;
  updated_at: string;
}

const SECTIONS: Array<{ key: keyof Config; label: string; help: string }> = [
  { key: 'terminology', label: 'Terminology', help: 'Override educational terms (e.g. "mark" vs "grade").' },
  { key: 'explanation_style', label: 'Explanation style', help: 'Formality, tone, cultural framing.' },
  { key: 'vocabulary', label: 'Vocabulary', help: 'Preferred / discouraged word lists.' },
  { key: 'pacing', label: 'Pacing', help: 'Session length, difficulty ramp preferences.' },
  { key: 'accessibility', label: 'Accessibility', help: 'Font, contrast, dyslexia mode defaults.' },
];

export function LuminaConfigPanel() {
  const { toast } = useToast();
  const api = useMinistryControl();
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('list_mc_lumina_config' as never, { p_session_token: api.token } as never);
      if (error) throw error;
      const rows = (data ?? []) as Config[];
      setConfig(rows[0] ?? null);
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
          <p className="text-[10px] uppercase tracking-widest text-gray-600">Presentation configuration</p>
          <p className="text-xs text-gray-500">Policy configures Lumina's <em>presentation</em>. It never overrides reasoning, factual correctness, or safety systems — those remain protected platform infrastructure.</p>
        </div>
        <DraftChangeButton
          entityType="lumina.config"
          buttonLabel="Draft config change"
          dialogTitle="Draft Lumina configuration"
          buildTitle={() => 'Lumina presentation update'}
          buildPayload={(v) => ({
            terminology: parseJsonField(v.terminology || '{}', {}),
            explanation_style: parseJsonField(v.explanation_style || '{}', {}),
            vocabulary: parseJsonField(v.vocabulary || '{}', {}),
            pacing: parseJsonField(v.pacing || '{}', {}),
            accessibility: parseJsonField(v.accessibility || '{}', {}),
          })}
          fields={SECTIONS.map((s) => ({
            key: s.key as string,
            label: s.label,
            type: 'json' as const,
            default: JSON.stringify(config?.[s.key] ?? {}, null, 2),
            help: s.help,
          }))}
          onSubmitted={load}
        />
      </div>

      {loading && <div className="text-center py-6"><Loader2 className="w-4 h-4 animate-spin inline text-emerald-500" /></div>}
      {!loading && !config && (
        <p className="text-center text-gray-600 py-8 border border-dashed border-gray-800 rounded-lg">
          No Lumina configuration published for this tenant yet. Defaults apply.
        </p>
      )}
      {!loading && config && (
        <div className="grid gap-3 md:grid-cols-2">
          {SECTIONS.map((s) => (
            <div key={String(s.key)} className="border border-gray-800 rounded-lg p-3 bg-gray-950">
              <p className="text-xs font-semibold text-gray-200 mb-1">{s.label}</p>
              <p className="text-[10px] text-gray-600 mb-2">{s.help}</p>
              <pre className="text-[11px] bg-black/40 border border-gray-800 p-2 rounded max-h-40 overflow-auto">
                {JSON.stringify(config[s.key], null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
