import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Plus, Trash2, GraduationCap, RefreshCw, Copy, Users, RotateCcw, Send, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useTeacherCategories, TeacherCategory } from '@/hooks/useTeacherCategories';

interface Props { schoolId: string }

interface TeacherRow {
  id: string;
  full_name: string;
  email: string | null;
  teacher_category_id: string | null;
}

const DEFAULT_COLOR = '#475569';

export function TeacherCategoriesManager({ schoolId }: Props) {
  const { toast } = useToast();
  const { categories, loading, refresh } = useTeacherCategories(schoolId);

  const [syncEnabled, setSyncEnabled] = useState(true);
  const [savingSync, setSavingSync] = useState(false);

  // Add form
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🎓');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [creating, setCreating] = useState(false);

  // Per-card UI
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [issuedSingleUseCodes, setIssuedSingleUseCodes] = useState<Record<string, string>>({});
  const [rotatingFor, setRotatingFor] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmoji, setEditEmoji] = useState('');
  const [editColor, setEditColor] = useState(DEFAULT_COLOR);

  // Teacher counts
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);

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
      .select('id,full_name,email,teacher_category_id')
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
    // permanent_invite_code is required by NOT NULL; we ask the DB to gen one via a temp value the
    // edge-side default won't fill — instead we call a one-off RPC. Easiest: insert with a
    // throwaway code that's immediately rotated by the DB function. But since we can't call
    // gen_teacher_category_code() from RLS, generate client-side and let DB unique constraint guard.
    const code = `${name.trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3) || 'TCH'}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { error } = await supabase
      .from('teacher_categories')
      .insert({ school_id: schoolId, name: name.trim(), emoji: emoji || '🎓', color, is_default: false, permanent_invite_code: code } as never);
    setCreating(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Could not add category', description: error.message });
      return;
    }
    setName('');
    setEmoji('🎓');
    toast({
      title: 'Teacher category added',
      description: syncEnabled
        ? 'A matching student subject tile was also created.'
        : 'Sync is OFF — only the teacher category was created.',
    });
    refresh();
    fetchTeachers();
  };

  const removeCategory = async (c: TeacherCategory) => {
    const warn = syncEnabled
      ? `Delete "${c.name}"? Sync is ON — this also removes the matching subject tile, unused invites, and unassigns teachers in this category.`
      : `Delete "${c.name}"? Sync is OFF — only the teacher category is removed.`;
    if (!confirm(warn)) return;
    const { error } = await supabase.from('teacher_categories').delete().eq('id', c.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Delete failed', description: error.message });
      return;
    }
    toast({ title: 'Category deleted' });
    refresh();
    fetchTeachers();
  };

  const startEdit = (c: TeacherCategory) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditEmoji(c.emoji || '');
    setEditColor(c.color || DEFAULT_COLOR);
  };

  const saveEdit = async (c: TeacherCategory) => {
    if (!editName.trim()) return;
    const { error } = await supabase
      .from('teacher_categories')
      .update({ name: editName.trim(), emoji: editEmoji || '🎓', color: editColor } as never)
      .eq('id', c.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Save failed', description: error.message });
      return;
    }
    setEditingId(null);
    refresh();
  };

  const rotateCode = async (c: TeacherCategory) => {
    if (!confirm(`Rotate "${c.name}" invite code? Anyone holding the old code can no longer use it.`)) return;
    setRotatingFor(c.id);
    const { data, error } = await supabase.rpc('rotate_teacher_category_code', { p_category_id: c.id });
    setRotatingFor(null);
    if (error) {
      toast({ variant: 'destructive', title: 'Failed', description: error.message });
      return;
    }
    toast({ title: 'Invite code rotated', description: data as string });
    refresh();
  };

  const generateSingleUse = async (c: TeacherCategory) => {
    setGeneratingFor(c.id);
    const { data, error } = await supabase.functions.invoke('invite-codes', {
      body: { role: 'teacher', teacher_category_id: c.id },
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
    setIssuedSingleUseCodes((p) => ({ ...p, [c.id]: result.invite_code!.code }));
    toast({ title: `${c.name} one-off code issued`, description: result.invite_code.code });
  };

  const copy = (s: string) => {
    navigator.clipboard.writeText(s);
    toast({ title: 'Copied' });
  };

  const teachersIn = (id: string) => teachers.filter((t) => t.teacher_category_id === id);
  const unassignedTeachers = teachers.filter((t) => !t.teacher_category_id);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-border bg-card/40 p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold flex items-center gap-2"><GraduationCap className="w-4 h-4" /> Teacher Categories</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Each category has its own permanent invite code. A teacher who signs up with that code is locked to that category — they can only upload materials and assignments in that subject. Categories are <strong>not</strong> student subject tiles; toggle Sync Mode below to keep the two lists aligned.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <Label className="text-xs">Sync Mode</Label>
            <p className="text-[10px] text-muted-foreground max-w-[200px]">
              ON → adding/removing a category also adds/removes the matching student subject tile.
            </p>
          </div>
          <Switch checked={syncEnabled} onCheckedChange={toggleSync} disabled={savingSync} />
        </div>
      </div>

      {/* Add new category */}
      <div className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
        <h3 className="text-sm font-semibold">Add a teacher category</h3>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[180px]">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Music, Robotics, Drama" onKeyDown={(e) => e.key === 'Enter' && addCategory()} />
          </div>
          <div className="w-24">
            <Label className="text-xs">Emoji / icon</Label>
            <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="🎵" className="text-center text-lg" />
          </div>
          <div className="w-20">
            <Label className="text-xs">Color</Label>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-full rounded border border-border bg-background" />
          </div>
          <Button onClick={addCategory} disabled={creating || !name.trim()} className="gap-2">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          The emoji field accepts any character from your keyboard. The color sets the accent for the category card and the teacher's dashboard label.
        </p>
      </div>

      {/* Card grid */}
      <div className="rounded-xl border border-border bg-card/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Categories ({categories.length})</h3>
          <Button variant="ghost" size="sm" onClick={() => { refresh(); fetchTeachers(); }}><RefreshCw className="w-4 h-4" /></Button>
        </div>
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin mx-auto my-6" />
        ) : categories.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">No categories yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {categories.map((c) => {
              const issued = issuedSingleUseCodes[c.id];
              const count = teachersIn(c.id).length;
              const accent = c.color || DEFAULT_COLOR;
              const isEditing = editingId === c.id;
              return (
                <div key={c.id} className="rounded-xl border border-border bg-background/60 p-4 flex flex-col gap-3 relative overflow-hidden">
                  <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accent }} />

                  {/* Title row */}
                  <div className="flex items-start gap-3">
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl shrink-0"
                      style={{ backgroundColor: `${accent}22`, border: `1px solid ${accent}55` }}
                    >
                      {isEditing ? (
                        <Input value={editEmoji} onChange={(e) => setEditEmoji(e.target.value)} className="text-center text-lg p-0 h-8 border-0 bg-transparent" />
                      ) : (c.emoji || '🎓')}
                    </div>
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 text-sm" />
                      ) : (
                        <>
                          <div className="text-sm font-semibold truncate">{c.name} Teacher</div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                            {c.is_default && <span className="bg-muted px-1.5 rounded">Default</span>}
                            {c.subject_id && <span>Linked to subject ✓</span>}
                          </div>
                        </>
                      )}
                    </div>
                    {isEditing ? (
                      <input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)} className="h-8 w-8 rounded border border-border bg-background" />
                    ) : null}
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{count} teacher{count === 1 ? '' : 's'}</span>
                  </div>

                  {/* Permanent invite code */}
                  <div className="rounded-lg bg-muted/50 border border-border/60 p-2">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Always-on invite code</div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-sm font-mono font-semibold truncate" style={{ color: accent }}>{c.permanent_invite_code}</code>
                      <button onClick={() => copy(c.permanent_invite_code)} className="text-muted-foreground hover:text-foreground" title="Copy"><Copy className="w-4 h-4" /></button>
                      <button onClick={() => rotateCode(c)} className="text-muted-foreground hover:text-foreground" title="Rotate code" disabled={rotatingFor === c.id}>
                        {rotatingFor === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">Share this code — teachers signing up with it become {c.name} teachers automatically.</p>
                  </div>

                  {/* One-off code */}
                  {issued && (
                    <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-2 text-xs">
                      One-off code: <code className="font-mono">{issued}</code> <button onClick={() => copy(issued)} className="ml-1 text-muted-foreground hover:text-foreground"><Copy className="w-3 h-3 inline" /></button>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-auto">
                    {isEditing ? (
                      <>
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => saveEdit(c)}><Check className="w-3 h-3" /> Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="w-3 h-3" /></Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" className="gap-1 flex-1" onClick={() => generateSingleUse(c)} disabled={generatingFor === c.id}>
                          {generatingFor === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                          One-off code
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => startEdit(c)}><Pencil className="w-4 h-4" /></Button>
                        <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => removeCategory(c)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Unassigned teachers (legacy) */}
      {unassignedTeachers.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <h3 className="text-sm font-semibold mb-1">Unassigned teachers ({unassignedTeachers.length})</h3>
          <p className="text-[11px] text-muted-foreground mb-3">These teachers were added before categories existed. They can currently upload to any subject. Either delete and re-invite them with a category code above, or assign manually:</p>
          <ul className="space-y-1.5">
            {unassignedTeachers.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 min-w-0 truncate">{t.full_name} <span className="text-[10px] text-muted-foreground">{t.email}</span></span>
                <select
                  className="bg-background border border-border rounded px-2 py-1 text-xs"
                  defaultValue=""
                  onChange={async (e) => {
                    if (!e.target.value) return;
                    const { error } = await supabase
                      .from('profiles')
                      .update({ teacher_category_id: e.target.value } as never)
                      .eq('id', t.id);
                    if (error) toast({ variant: 'destructive', title: 'Failed', description: error.message });
                    else { toast({ title: 'Assigned' }); fetchTeachers(); }
                  }}
                >
                  <option value="">Assign category…</option>
                  {categories.map((c) => (<option key={c.id} value={c.id}>{c.emoji} {c.name}</option>))}
                </select>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
