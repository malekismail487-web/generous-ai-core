import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, PlusCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useMinistryControl } from '@/hooks/useMinistryControl';

interface FieldDef {
  key: string;
  label: string;
  type?: 'text' | 'textarea' | 'json' | 'number';
  placeholder?: string;
  required?: boolean;
  default?: string;
  help?: string;
}

interface DraftChangeButtonProps {
  entityType: string;
  buttonLabel?: string;
  dialogTitle: string;
  dialogDescription?: string;
  fields: FieldDef[];
  buildPayload?: (values: Record<string, string>) => Record<string, unknown>;
  buildTitle?: (values: Record<string, string>) => string;
  onSubmitted?: () => void;
}

/**
 * Shared "New draft" affordance for every MC3+ panel. Standardizes how
 * ministry personnel submit changes into the MC2 Draft & Publish pipeline
 * so every tool behaves identically (submit → in_review → approve → publish).
 */
export function DraftChangeButton({
  entityType, buttonLabel = 'Draft change', dialogTitle, dialogDescription,
  fields, buildPayload, buildTitle, onSubmitted,
}: DraftChangeButtonProps) {
  const { toast } = useToast();
  const api = useMinistryControl();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>(
    () => Object.fromEntries(fields.map((f) => [f.key, f.default ?? '']))
  );

  useEffect(() => {
    if (!open) return;
    setValues(Object.fromEntries(fields.map((f) => [f.key, f.default ?? ''])));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = api.token;
      if (!token) return;
      const { data } = await supabase
        .from('ministry_sessions')
        .select('tenant_id')
        .eq('session_token', token)
        .maybeSingle();
      if (!cancelled && data?.tenant_id) setTenantId(data.tenant_id);
    })();
    return () => { cancelled = true; };
  }, [api.token]);

  const submit = async () => {
    if (!tenantId) {
      toast({ variant: 'destructive', title: 'No tenant context' });
      return;
    }
    for (const f of fields) {
      if (f.required && !values[f.key]?.trim()) {
        toast({ variant: 'destructive', title: `${f.label} is required` });
        return;
      }
    }
    let payload: Record<string, unknown>;
    try {
      payload = buildPayload ? buildPayload(values) : { ...values };
    } catch (e) {
      toast({ variant: 'destructive', title: 'Invalid input', description: (e as Error).message });
      return;
    }
    setSaving(true);
    try {
      const title = buildTitle ? buildTitle(values) : dialogTitle;
      await api.submitChangeRequest({
        tenantId,
        entityType,
        title,
        payload,
      });
      toast({ title: 'Draft submitted', description: 'Awaiting review in Publishing.' });
      setOpen(false);
      onSubmitted?.();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Submit failed', description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-emerald-800/50 text-emerald-300">
          <PlusCircle className="w-3.5 h-3.5 mr-1.5" /> {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gray-950 border-gray-800 text-gray-200 max-w-lg">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          {dialogDescription && (
            <p className="text-xs text-gray-500 mt-1">{dialogDescription}</p>
          )}
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label className="text-xs text-gray-500">
                {f.label}{f.required && <span className="text-red-400"> *</span>}
              </Label>
              {f.type === 'textarea' || f.type === 'json' ? (
                <Textarea
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  rows={f.type === 'json' ? 6 : 4}
                  className={`bg-gray-900 border-gray-800 ${f.type === 'json' ? 'font-mono text-xs' : ''}`}
                />
              ) : (
                <Input
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  type={f.type === 'number' ? 'number' : 'text'}
                  className="bg-gray-900 border-gray-800"
                />
              )}
              {f.help && <p className="text-[10px] text-gray-600">{f.help}</p>}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-700 hover:bg-emerald-600">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit for review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Helper: parse a required JSON string, throwing a friendly error. */
export function parseJsonField(raw: string, fallback: unknown = {}): unknown {
  const s = raw?.trim();
  if (!s) return fallback;
  try { return JSON.parse(s); } catch { throw new Error(`Invalid JSON: ${s.slice(0, 40)}…`); }
}
