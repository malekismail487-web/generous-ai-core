/**
 * TenantDefaultsEditor — Super-Admin editor for a single tenant's curriculum
 * & localisation defaults (T3).
 *
 * Read + write path: `update_tenant_defaults` RPC (super-admin gated). We
 * intentionally keep the surface compact — the goal is auditable, correct
 * per-country configuration, not a full curriculum authoring tool (that's T4).
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Loader2, Save, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

interface Props {
  tenantId: string;
  defaults: {
    default_subjects: unknown;
    grading_system: unknown;
    academic_calendar: unknown;
    default_language: string;
    supported_languages: string[];
    curriculum_framework: string | null;
  };
  onSaved?: () => void;
}

function pretty(value: unknown): string {
  try { return JSON.stringify(value ?? {}, null, 2); } catch { return ''; }
}

export default function TenantDefaultsEditor({ tenantId, defaults, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [subjects, setSubjects] = useState<string>(pretty(defaults.default_subjects));
  const [grading, setGrading] = useState<string>(pretty(defaults.grading_system));
  const [calendar, setCalendar] = useState<string>(pretty(defaults.academic_calendar));
  const [defaultLang, setDefaultLang] = useState(defaults.default_language ?? 'en');
  const [supported, setSupported] = useState((defaults.supported_languages ?? []).join(','));
  const [framework, setFramework] = useState(defaults.curriculum_framework ?? '');

  const parseOrThrow = (label: string, raw: string): Json => {
    try {
      return JSON.parse(raw) as Json;
    } catch (e) {
      throw new Error(`${label} is not valid JSON`);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        p_tenant_id: tenantId,
        p_default_subjects:    parseOrThrow('Default subjects',    subjects),
        p_grading_system:      parseOrThrow('Grading system',      grading),
        p_academic_calendar:   parseOrThrow('Academic calendar',   calendar),
        p_default_language:    defaultLang.trim(),
        p_supported_languages: supported.split(',').map((s) => s.trim()).filter(Boolean),
        p_curriculum_framework: framework.trim() || null,
      };
      const { data, error } = await supabase.rpc('update_tenant_defaults', payload);
      const result = data as { success: boolean; error?: string } | null;
      if (error || !result?.success) {
        throw new Error(error?.message || result?.error || 'Update failed');
      }
      toast({ title: 'Tenant defaults updated' });
      onSaved?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Update failed';
      toast({ variant: 'destructive', title: 'Save failed', description: msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 border-t border-border/30 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {open ? 'Hide curriculum defaults' : 'Edit curriculum defaults'}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label className="text-[11px] text-muted-foreground">Default language</label>
              <Input value={defaultLang} onChange={(e) => setDefaultLang(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Supported languages (comma-separated)</label>
              <Input value={supported} onChange={(e) => setSupported(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Curriculum framework</label>
              <Input value={framework} onChange={(e) => setFramework(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground">
              Default subjects (JSON array of {'{slug, name, emoji, color}'})
            </label>
            <Textarea
              className="font-mono text-xs min-h-[140px]"
              value={subjects}
              onChange={(e) => setSubjects(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground">Grading system (JSON)</label>
              <Textarea
                className="font-mono text-xs min-h-[120px]"
                value={grading}
                onChange={(e) => setGrading(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Academic calendar (JSON)</label>
              <Textarea
                className="font-mono text-xs min-h-[120px]"
                value={calendar}
                onChange={(e) => setCalendar(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={save} disabled={saving} className="gap-1">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save defaults
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Changes affect newly created schools in this country. Existing schools keep their current subjects.
          </p>
        </div>
      )}
    </div>
  );
}
