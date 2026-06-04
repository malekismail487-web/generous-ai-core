import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Plus, Trash2, BookOpen, RefreshCw, Send, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useSchoolSubjects, SchoolSubject } from '@/hooks/useSchoolSubjects';

interface Props { schoolId: string }

const EMOJI_PRESETS = ['📘', '🧬', '⚛️', '📐', '🧪', '📚', '🌍', '💻', '🕌', '☪️', '🏛️', '🎨', '💼', '🎵', '⚽', '🗺️'];
const COLOR_PRESETS = [
  'from-slate-500 to-zinc-600',
  'from-emerald-500 to-green-600',
  'from-blue-500 to-cyan-600',
  'from-violet-500 to-purple-600',
  'from-orange-500 to-amber-600',
  'from-rose-500 to-pink-600',
  'from-teal-500 to-emerald-600',
  'from-indigo-500 to-blue-600',
];

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function SubjectsManager({ schoolId }: Props) {
  const { toast } = useToast();
  const { subjects, loading, refresh } = useSchoolSubjects(schoolId);

  const [syncEnabled, setSyncEnabled] = useState(true);
  const [savingSync, setSavingSync] = useState(false);

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(EMOJI_PRESETS[0]);
  const [color, setColor] = useState(COLOR_PRESETS[0]);
  const [creating, setCreating] = useState(false);

  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [issuedCodes, setIssuedCodes] = useState<Record<string, string>>({});

  const fetchSyncFlag = useCallback(async () => {
    const { data } = await supabase
      .from('schools')
      .select('subjects_sync_enabled')
      .eq('id', schoolId)
      .maybeSingle();
    if (data) setSyncEnabled(Boolean((data as { subjects_sync_enabled?: boolean }).subjects_sync_enabled ?? true));
  }, [schoolId]);

  useEffect(() => { fetchSyncFlag(); }, [fetchSyncFlag]);

  const toggleSync = async (value: boolean) => {
    setSavingSync(true);
    const { error } = await supabase
      .from('schools')
      .update({ subjects_sync_enabled: value } as never)
      .eq('id', schoolId);
    setSavingSync(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Could not update sync', description: error.message });
      return;
    }
    setSyncEnabled(value);
    toast({ title: value ? 'Sync mode enabled' : 'Sync mode disabled' });
  };

  const addSubject = async () => {
    if (!name.trim()) return;
    setCreating(true);
    const slug = slugify(name);
    const { error } = await supabase
      .from('subjects')
      .insert({ school_id: schoolId, name: name.trim(), slug, emoji, color, is_default: false } as never);
    setCreating(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Could not add subject', description: error.message });
      return;
    }
    setName('');
    toast({ title: 'Subject added', description: 'Visible to all students and teachers in your school.' });
    refresh();
  };

  const removeSubject = async (s: SchoolSubject) => {
    const warn = syncEnabled
      ? `Delete "${s.name}"? Sync is ON — this also removes the matching teacher category and any unused teacher invites for this subject.`
      : `Delete "${s.name}"? Sync is OFF — only the subject tile is removed.`;
    if (!confirm(warn)) return;
    const { error } = await supabase.from('subjects').delete().eq('id', s.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Delete failed', description: error.message });
      return;
    }
    toast({ title: 'Subject deleted' });
    refresh();
  };

  const generateTeacherInvite = async (s: SchoolSubject) => {
    setGeneratingFor(s.id);
    const { data, error } = await supabase.functions.invoke('invite-codes', {
      body: { role: 'teacher', subject_id: s.id },
    });
    setGeneratingFor(null);
    if (error) {
      toast({ variant: 'destructive', title: 'Failed', description: error.message });
      return;
    }
    const result = data as { success?: boolean; invite_code?: { code: string }; error?: string };
    if (!result?.success || !result.invite_code) {
      toast({ variant: 'destructive', title: 'Failed', description: result?.error || 'Unknown' });
      return;
    }
    setIssuedCodes((p) => ({ ...p, [s.id]: result.invite_code!.code }));
    toast({ title: `${s.name} teacher invite generated`, description: result.invite_code.code });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card/40 p-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2"><BookOpen className="w-4 h-4" /> Subjects &amp; Teacher Categories</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            One list drives three things in your school: the student Subjects tab tiles, the teacher upload categories, and the teacher invite pool. Changes you make here appear for every student and teacher in your school.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <Label className="text-xs">Sync Mode</Label>
            <p className="text-[10px] text-muted-foreground max-w-[180px]">When ON, deleting a subject also clears its teacher category and unused invites.</p>
          </div>
          <Switch checked={syncEnabled} onCheckedChange={toggleSync} disabled={savingSync} />
        </div>
      </div>

      {/* Add new subject */}
      <div className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
        <h3 className="text-sm font-semibold">Add a subject</h3>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[180px]">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Music" onKeyDown={(e) => e.key === 'Enter' && addSubject()} />
          </div>
          <div>
            <Label className="text-xs">Emoji</Label>
            <div className="flex gap-1 flex-wrap max-w-[260px]">
              {EMOJI_PRESETS.map((e) => (
                <button key={e} onClick={() => setEmoji(e)} className={`text-lg w-8 h-8 rounded border ${emoji === e ? 'border-primary bg-muted' : 'border-border'}`}>{e}</button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Color</Label>
            <div className="flex gap-1 flex-wrap max-w-[260px]">
              {COLOR_PRESETS.map((c) => (
                <button key={c} onClick={() => setColor(c)} className={`w-8 h-8 rounded bg-gradient-to-br ${c} ${color === c ? 'ring-2 ring-primary' : ''}`} />
              ))}
            </div>
          </div>
          <Button onClick={addSubject} disabled={creating || !name.trim()} className="gap-2">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="rounded-xl border border-border bg-card/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Subjects in your school ({subjects.length})</h3>
          <Button variant="ghost" size="sm" onClick={refresh}><RefreshCw className="w-4 h-4" /></Button>
        </div>
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin mx-auto my-6" />
        ) : subjects.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">No subjects yet.</p>
        ) : (
          <ul className="space-y-2">
            {subjects.map((s) => {
              const issued = issuedCodes[s.id];
              return (
                <li key={s.id} className="flex items-center gap-3 p-2 rounded-lg border border-border/60 bg-background/40">
                  <div className={`w-10 h-10 rounded-md bg-gradient-to-br ${s.color} flex items-center justify-center text-lg shrink-0`}>{s.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{s.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {s.is_default ? 'Default tile · ' : ''}{s.slug || '—'}
                      {issued && (
                        <span className="ml-2 inline-flex items-center gap-1">
                          · invite: <code className="bg-muted px-1.5 rounded font-mono">{issued}</code>
                          <button onClick={() => { navigator.clipboard.writeText(issued); toast({ title: 'Copied' }); }} className="hover:text-foreground"><Copy className="w-3 h-3" /></button>
                        </span>
                      )}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => generateTeacherInvite(s)} disabled={generatingFor === s.id}>
                    {generatingFor === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    Teacher invite
                  </Button>
                  <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => removeSubject(s)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
