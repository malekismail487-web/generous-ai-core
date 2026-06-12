import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Plus, Trash2, BookOpen, RefreshCw, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useSchoolSubjects, SchoolSubject } from '@/hooks/useSchoolSubjects';

interface Props { schoolId: string }

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

const DEFAULT_COLOR = '#475569';

export function SubjectsManager({ schoolId }: Props) {
  const { toast } = useToast();
  const { subjects, loading, refresh } = useSchoolSubjects(schoolId);

  const [syncEnabled, setSyncEnabled] = useState(true);
  const [savingSync, setSavingSync] = useState(false);

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('📘');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmoji, setEditEmoji] = useState('');
  const [editColor, setEditColor] = useState(DEFAULT_COLOR);

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
      .insert({ school_id: schoolId, name: name.trim(), slug, emoji: emoji || '📘', color, is_default: false } as never);
    setCreating(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Could not add subject', description: error.message });
      return;
    }
    setName('');
    setEmoji('📘');
    toast({
      title: 'Subject added',
      description: syncEnabled
        ? 'Tile appears for students. A matching teacher category was also created.'
        : 'Sync is OFF — tile appears for students only.',
    });
    refresh();
  };

  const removeSubject = async (s: SchoolSubject) => {
    const warn = syncEnabled
      ? `Delete "${s.name}"? Sync is ON — this also removes the matching teacher category and any unused teacher invites for it.`
      : `Delete "${s.name}"? Sync is OFF — only the student subject tile is removed.`;
    if (!confirm(warn)) return;
    const { error } = await supabase.from('subjects').delete().eq('id', s.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Delete failed', description: error.message });
      return;
    }
    toast({ title: 'Subject deleted' });
    refresh();
  };

  const startEdit = (s: SchoolSubject) => {
    setEditingId(s.id);
    setEditName(s.name);
    setEditEmoji(s.emoji || '');
    setEditColor((s.color && s.color.startsWith('#')) ? s.color : DEFAULT_COLOR);
  };

  const saveEdit = async (s: SchoolSubject) => {
    if (!editName.trim()) return;
    const { error } = await supabase
      .from('subjects')
      .update({ name: editName.trim(), emoji: editEmoji || '📘', color: editColor } as never)
      .eq('id', s.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Save failed', description: error.message });
      return;
    }
    setEditingId(null);
    refresh();
  };

  const isHexColor = (c: string | null | undefined) => !!c && /^#[0-9a-f]{3,8}$/i.test(c);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card/40 p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold flex items-center gap-2"><BookOpen className="w-4 h-4" /> Subjects</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            These are the student-facing subject tiles. Each subject gets its own lecture studio. To manage teacher upload categories and invite codes, switch to the <strong>Teacher Categories</strong> tab.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <Label className="text-xs">Sync Mode</Label>
            <p className="text-[10px] text-muted-foreground max-w-[200px]">
              ON → adding/removing a subject also adds/removes its matching teacher category.
            </p>
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
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Music, Astronomy" onKeyDown={(e) => e.key === 'Enter' && addSubject()} />
          </div>
          <div className="w-24">
            <Label className="text-xs">Emoji / icon</Label>
            <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="📘" className="text-center text-lg" />
          </div>
          <div className="w-20">
            <Label className="text-xs">Color</Label>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-full rounded border border-border bg-background" />
          </div>
          <Button onClick={addSubject} disabled={creating || !name.trim()} className="gap-2">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Emoji field accepts any character from your keyboard.
        </p>
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
              const isEditing = editingId === s.id;
              const accent = isHexColor(s.color) ? s.color! : DEFAULT_COLOR;
              return (
                <li key={s.id} className="flex items-center gap-3 p-2 rounded-lg border border-border/60 bg-background/40">
                  <div
                    className="w-10 h-10 rounded-md flex items-center justify-center text-lg shrink-0"
                    style={isHexColor(s.color)
                      ? { backgroundColor: `${accent}22`, border: `1px solid ${accent}55` }
                      : undefined}
                  >
                    {!isHexColor(s.color) ? (
                      <span className={`w-full h-full rounded-md bg-gradient-to-br ${s.color} flex items-center justify-center`}>{isEditing ? (
                        <Input value={editEmoji} onChange={(e) => setEditEmoji(e.target.value)} className="text-center text-lg p-0 h-8 border-0 bg-transparent" />
                      ) : s.emoji}</span>
                    ) : (
                      isEditing ? (
                        <Input value={editEmoji} onChange={(e) => setEditEmoji(e.target.value)} className="text-center text-lg p-0 h-8 border-0 bg-transparent" />
                      ) : s.emoji
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 text-sm" />
                    ) : (
                      <>
                        <div className="text-sm font-medium truncate">{s.name}</div>
                        <div className="text-[10px] text-muted-foreground">{s.is_default ? 'Default tile · ' : ''}{s.slug || '—'}</div>
                      </>
                    )}
                  </div>
                  {isEditing ? (
                    <>
                      <input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)} className="h-8 w-8 rounded border border-border bg-background" />
                      <Button size="sm" variant="outline" onClick={() => saveEdit(s)}><Check className="w-3 h-3" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="w-3 h-3" /></Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => startEdit(s)}><Pencil className="w-4 h-4" /></Button>
                      <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => removeSubject(s)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
