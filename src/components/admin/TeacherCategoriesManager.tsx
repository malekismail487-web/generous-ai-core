import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Plus, Trash2, GraduationCap, RefreshCw, Send, Copy, Users } from 'lucide-react';
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

interface TeacherRow {
  id: string;
  full_name: string;
  email: string | null;
  teacher_subject_id: string | null;
}

/**
 * Teacher Categories management. Categories share the per-school `subjects` table
 * so changes here also appear under the Subjects tab (and vice-versa) when Sync
 * Mode is ON. This is the same source-of-truth the student Subjects tab and the
 * teacher upload guard read from.
 */
export function TeacherCategoriesManager({ schoolId }: Props) {
  const { toast } = useToast();
  const { subjects, loading, refresh } = useSchoolSubjects(schoolId);

  const [syncEnabled, setSyncEnabled] = useState(true);
  const [savingSync, setSavingSync] = useState(false);

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('📘');
  const [color, setColor] = useState(COLOR_PRESETS[0]);
  const [creating, setCreating] = useState(false);

  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [issuedCodes, setIssuedCodes] = useState<Record<string, string>>({});

  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [savingTeacher, setSavingTeacher] = useState<string | null>(null);

  const fetchSyncFlag = useCallback(async () => {
    const { data } = await supabase
      .from('schools')
      .select('subjects_sync_enabled')
      .eq('id', schoolId)
      .maybeSingle();
    if (data) setSyncEnabled(Boolean((data as { subjects_sync_enabled?: boolean }).subjects_sync_enabled ?? true));
  }, [schoolId]);

  const fetchTeachers = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id,full_name,email,teacher_subject_id')
      .eq('school_id', schoolId)
      .eq('user_type', 'teacher')
      .eq('is_active', true);
    setTeachers((data as TeacherRow[]) || []);
  }, [schoolId]);

  useEffect(() => { fetchSyncFlag(); fetchTeachers(); }, [fetchSyncFlag, fetchTeachers]);

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

  const addCategory = async () => {
    if (!name.trim()) return;
    setCreating(true);
    const slug = slugify(name);
    const { error } = await supabase
      .from('subjects')
      .insert({ school_id: schoolId, name: name.trim(), slug, emoji, color, is_default: false } as never);
    setCreating(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Could not add category', description: error.message });
      return;
    }
    setName('');
    toast({
      title: 'Teacher category added',
      description: syncEnabled
        ? 'Also appears as a subject tile for students.'
        : 'Sync is OFF — category created; subject tile may be hidden until you enable sync.',
    });
    refresh();
  };

  const removeCategory = async (s: SchoolSubject) => {
    const warn = syncEnabled
      ? `Delete "${s.name}"? Sync is ON — this also removes the subject tile and any unused teacher invites for this category, and unassigns teachers in it.`
      : `Delete "${s.name}"? Sync is OFF — only the category record is removed.`;
    if (!confirm(warn)) return;
    const { error } = await supabase.from('subjects').delete().eq('id', s.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Delete failed', description: error.message });
      return;
    }
    toast({ title: 'Category deleted' });
    refresh();
    fetchTeachers();
  };

  const generateInvite = async (s: SchoolSubject) => {
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
    toast({ title: `${s.name} invite generated`, description: result.invite_code.code });
  };

  const assignTeacher = async (teacherId: string, subjectId: string | null) => {
    setSavingTeacher(teacherId);
    const { error } = await supabase
      .from('profiles')
      .update({ teacher_subject_id: subjectId } as never)
      .eq('id', teacherId);
    setSavingTeacher(null);
    if (error) {
      toast({ variant: 'destructive', title: 'Failed', description: error.message });
      return;
    }
    toast({ title: 'Teacher category updated' });
    fetchTeachers();
  };

  const teachersByCat = (catId: string) => teachers.filter((t) => t.teacher_subject_id === catId);
  const unassigned = teachers.filter((t) => !t.teacher_subject_id);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card/40 p-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2"><GraduationCap className="w-4 h-4" /> Teacher Categories</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            A teacher category determines which subject a teacher can upload to. Categories and subject tiles share one list — when <strong>Sync Mode</strong> is ON, adding or removing in either tab reflects in the other (and unused invites + teacher assignments cascade on delete). An Arabic teacher cannot upload Biology material; the upload UI locks them to their category.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <Label className="text-xs">Sync Mode</Label>
            <p className="text-[10px] text-muted-foreground max-w-[180px]">Keep Subjects and Teacher Categories aligned.</p>
          </div>
          <Switch checked={syncEnabled} onCheckedChange={toggleSync} disabled={savingSync} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
        <h3 className="text-sm font-semibold">Add a teacher category</h3>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[180px]">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Music teacher" onKeyDown={(e) => e.key === 'Enter' && addCategory()} />
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
          <Button onClick={addCategory} disabled={creating || !name.trim()} className="gap-2">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Categories ({subjects.length})</h3>
          <Button variant="ghost" size="sm" onClick={() => { refresh(); fetchTeachers(); }}><RefreshCw className="w-4 h-4" /></Button>
        </div>
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin mx-auto my-6" />
        ) : subjects.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">No categories yet.</p>
        ) : (
          <ul className="space-y-2">
            {subjects.map((s) => {
              const issued = issuedCodes[s.id];
              const assigned = teachersByCat(s.id);
              return (
                <li key={s.id} className="p-2 rounded-lg border border-border/60 bg-background/40">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-md bg-gradient-to-br ${s.color} flex items-center justify-center text-lg shrink-0`}>{s.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{s.name}</div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                        <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{assigned.length} teacher{assigned.length === 1 ? '' : 's'}</span>
                        {issued && (
                          <span className="inline-flex items-center gap-1">
                            · invite: <code className="bg-muted px-1.5 rounded font-mono">{issued}</code>
                            <button onClick={() => { navigator.clipboard.writeText(issued); toast({ title: 'Copied' }); }} className="hover:text-foreground"><Copy className="w-3 h-3" /></button>
                          </span>
                        )}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => generateInvite(s)} disabled={generatingFor === s.id}>
                      {generatingFor === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      Invite code
                    </Button>
                    <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => removeCategory(s)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  {assigned.length > 0 && (
                    <div className="mt-2 ml-12 flex flex-wrap gap-1.5">
                      {assigned.map((t) => (
                        <span key={t.id} className="text-[11px] bg-muted/60 rounded px-2 py-0.5 inline-flex items-center gap-1">
                          {t.full_name}
                          <button onClick={() => assignTeacher(t.id, null)} className="opacity-60 hover:opacity-100" disabled={savingTeacher === t.id}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Unassigned teachers — let admin set their category */}
      <div className="rounded-xl border border-border bg-card/40 p-4">
        <h3 className="text-sm font-semibold mb-2">Unassigned teachers ({unassigned.length})</h3>
        <p className="text-[11px] text-muted-foreground mb-3">These teachers can currently upload to any subject. Assign them a category to lock them in.</p>
        {unassigned.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">All teachers have a category.</p>
        ) : (
          <ul className="space-y-1.5">
            {unassigned.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 min-w-0 truncate">{t.full_name} <span className="text-[10px] text-muted-foreground">{t.email}</span></span>
                <select
                  className="bg-background border border-border rounded px-2 py-1 text-xs"
                  value=""
                  disabled={savingTeacher === t.id}
                  onChange={(e) => e.target.value && assignTeacher(t.id, e.target.value)}
                >
                  <option value="">Assign category…</option>
                  {subjects.map((s) => (<option key={s.id} value={s.id}>{s.emoji} {s.name}</option>))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
