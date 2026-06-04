import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Plus, Trash2, BookOpen, Layers, Sparkles, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Lecture, Concept,
  listLectures, listConcepts,
  createLecture, createConcept,
  deleteLecture, deleteConcept,
  updateConcept, updateLecture,
  recordCurriculumChange,
} from '@/lib/adaptive/curriculumGraph';

interface Subject { id: string; name: string; description: string | null }
interface Props { schoolId: string }

export function CurriculumGraphManager({ schoolId }: Props) {
  const { toast } = useToast();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedLecture, setSelectedLecture] = useState<string | null>(null);
  const [loadingSubjects, setLoadingSubjects] = useState(true);

  // create forms
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newLectureTitle, setNewLectureTitle] = useState('');
  const [newLectureDifficulty, setNewLectureDifficulty] = useState('0');
  const [newConceptName, setNewConceptName] = useState('');
  const [newConceptWeight, setNewConceptWeight] = useState('1.0');

  const fetchSubjects = useCallback(async () => {
    setLoadingSubjects(true);
    const { data, error } = await supabase
      .from('subjects').select('id,name,description')
      .eq('school_id', schoolId).order('name');
    if (!error) setSubjects((data || []) as Subject[]);
    setLoadingSubjects(false);
  }, [schoolId]);

  const fetchLectures = useCallback(async (subjectId: string) => {
    const ls = await listLectures(subjectId);
    setLectures(ls);
  }, []);

  const fetchConcepts = useCallback(async (lectureId: string) => {
    const cs = await listConcepts(lectureId);
    setConcepts(cs);
  }, []);

  useEffect(() => { fetchSubjects(); }, [fetchSubjects]);
  useEffect(() => {
    if (selectedSubject) { fetchLectures(selectedSubject); setSelectedLecture(null); setConcepts([]); }
    else { setLectures([]); setConcepts([]); }
  }, [selectedSubject, fetchLectures]);
  useEffect(() => {
    if (selectedLecture) fetchConcepts(selectedLecture);
    else setConcepts([]);
  }, [selectedLecture, fetchConcepts]);

  // -- mutations -----------------------------------------------------------
  const addSubject = async () => {
    if (!newSubjectName.trim()) return;
    const { data, error } = await supabase.from('subjects')
      .insert({ school_id: schoolId, name: newSubjectName.trim() })
      .select().maybeSingle();
    if (error) { toast({ variant: 'destructive', title: 'Could not create subject', description: error.message }); return; }
    setNewSubjectName('');
    fetchSubjects();
    await recordCurriculumChange(schoolId, { op: 'create_subject', subject: data?.name });
    toast({ title: 'Subject added' });
  };

  const removeSubject = async (id: string, name: string) => {
    if (!confirm(`Delete subject "${name}"? This removes all its lectures and concepts.`)) return;
    const { error } = await supabase.from('subjects').delete().eq('id', id);
    if (error) { toast({ variant: 'destructive', title: 'Delete failed', description: error.message }); return; }
    if (selectedSubject === id) setSelectedSubject(null);
    fetchSubjects();
    await recordCurriculumChange(schoolId, { op: 'delete_subject', subject: name });
  };

  const addLecture = async () => {
    if (!selectedSubject || !newLectureTitle.trim()) return;
    const created = await createLecture({
      school_id: schoolId,
      subject_id: selectedSubject,
      title: newLectureTitle.trim(),
      order_index: lectures.length,
      difficulty_level: Number(newLectureDifficulty) || 0,
    });
    if (!created) { toast({ variant: 'destructive', title: 'Could not create lecture' }); return; }
    setNewLectureTitle(''); setNewLectureDifficulty('0');
    fetchLectures(selectedSubject);
    await recordCurriculumChange(schoolId, { op: 'create_lecture', lecture: created.title });
    toast({ title: 'Lecture added' });
  };

  const removeLecture = async (id: string, title: string) => {
    if (!confirm(`Delete lecture "${title}"? This removes all its concepts.`)) return;
    const ok = await deleteLecture(id);
    if (!ok) { toast({ variant: 'destructive', title: 'Delete failed' }); return; }
    if (selectedLecture === id) setSelectedLecture(null);
    if (selectedSubject) fetchLectures(selectedSubject);
    await recordCurriculumChange(schoolId, { op: 'delete_lecture', lecture: title });
  };

  const addConcept = async () => {
    if (!selectedSubject || !selectedLecture || !newConceptName.trim()) return;
    const created = await createConcept({
      school_id: schoolId,
      subject_id: selectedSubject,
      lecture_id: selectedLecture,
      name: newConceptName.trim(),
      order_index: concepts.length,
      difficulty_weight: Number(newConceptWeight) || 1,
    });
    if (!created) { toast({ variant: 'destructive', title: 'Could not create concept' }); return; }
    setNewConceptName(''); setNewConceptWeight('1.0');
    fetchConcepts(selectedLecture);
    await recordCurriculumChange(schoolId, { op: 'create_concept', concept: created.name });
    toast({ title: 'Concept added' });
  };

  const removeConcept = async (id: string, name: string) => {
    if (!confirm(`Delete concept "${name}"?`)) return;
    const ok = await deleteConcept(id);
    if (!ok) { toast({ variant: 'destructive', title: 'Delete failed' }); return; }
    if (selectedLecture) fetchConcepts(selectedLecture);
    await recordCurriculumChange(schoolId, { op: 'delete_concept', concept: name });
  };

  // -- render --------------------------------------------------------------
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card/40 p-4">
        <h2 className="text-base font-semibold">Curriculum Graph</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Subject → Lecture → Concept. This hierarchy is what the adaptive engine uses to decide what to teach next.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Subjects */}
        <Column
          title="Subjects"
          icon={<BookOpen className="w-4 h-4" />}
          count={subjects.length}
        >
          <div className="flex gap-2 mb-3">
            <Input
              value={newSubjectName}
              onChange={(e) => setNewSubjectName(e.target.value)}
              placeholder="New subject name"
              onKeyDown={(e) => e.key === 'Enter' && addSubject()}
            />
            <Button size="sm" onClick={addSubject} disabled={!newSubjectName.trim()}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          {loadingSubjects ? (
            <Loader2 className="w-4 h-4 animate-spin mx-auto my-4" />
          ) : subjects.length === 0 ? (
            <EmptyHint text="No subjects yet. Add one to start the curriculum." />
          ) : (
            <ul className="space-y-1">
              {subjects.map(s => (
                <Row
                  key={s.id}
                  selected={selectedSubject === s.id}
                  onClick={() => setSelectedSubject(s.id)}
                  onDelete={() => removeSubject(s.id, s.name)}
                  label={s.name}
                />
              ))}
            </ul>
          )}
        </Column>

        {/* Lectures */}
        <Column
          title="Lectures"
          icon={<Layers className="w-4 h-4" />}
          count={lectures.length}
          disabled={!selectedSubject}
        >
          {!selectedSubject ? (
            <EmptyHint text="Pick a subject to view its lectures." />
          ) : (
            <>
              <div className="space-y-2 mb-3">
                <Input
                  value={newLectureTitle}
                  onChange={(e) => setNewLectureTitle(e.target.value)}
                  placeholder="New lecture title"
                  onKeyDown={(e) => e.key === 'Enter' && addLecture()}
                />
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Difficulty (−3 to 3)</Label>
                    <Input
                      type="number" step="0.1" min="-3" max="3"
                      value={newLectureDifficulty}
                      onChange={(e) => setNewLectureDifficulty(e.target.value)}
                    />
                  </div>
                  <Button size="sm" onClick={addLecture} disabled={!newLectureTitle.trim()} className="self-end">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {lectures.length === 0 ? (
                <EmptyHint text="No lectures yet for this subject." />
              ) : (
                <ul className="space-y-1">
                  {lectures.map(l => (
                    <Row
                      key={l.id}
                      selected={selectedLecture === l.id}
                      onClick={() => setSelectedLecture(l.id)}
                      onDelete={() => removeLecture(l.id, l.title)}
                      label={l.title}
                      sub={`b = ${Number(l.difficulty_level).toFixed(2)}`}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </Column>

        {/* Concepts */}
        <Column
          title="Concepts"
          icon={<Sparkles className="w-4 h-4" />}
          count={concepts.length}
          disabled={!selectedLecture}
        >
          {!selectedLecture ? (
            <EmptyHint text="Pick a lecture to view its concepts." />
          ) : (
            <>
              <div className="space-y-2 mb-3">
                <Input
                  value={newConceptName}
                  onChange={(e) => setNewConceptName(e.target.value)}
                  placeholder="New concept name"
                  onKeyDown={(e) => e.key === 'Enter' && addConcept()}
                />
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Difficulty weight (0–3)</Label>
                    <Input
                      type="number" step="0.1" min="0" max="3"
                      value={newConceptWeight}
                      onChange={(e) => setNewConceptWeight(e.target.value)}
                    />
                  </div>
                  <Button size="sm" onClick={addConcept} disabled={!newConceptName.trim()} className="self-end">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {concepts.length === 0 ? (
                <EmptyHint text="No concepts yet for this lecture." />
              ) : (
                <ul className="space-y-1">
                  {concepts.map(c => (
                    <Row
                      key={c.id}
                      onDelete={() => removeConcept(c.id, c.name)}
                      label={c.name}
                      sub={`w = ${Number(c.difficulty_weight).toFixed(2)}`}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </Column>
      </div>
    </div>
  );
}

function Column({ title, icon, count, disabled, children }: {
  title: string; icon: React.ReactNode; count: number; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={cn(
      "rounded-xl border border-border bg-card/40 p-4 flex flex-col min-h-[360px]",
      disabled && "opacity-60"
    )}>
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border/60">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
        </div>
        <span className="text-xs text-muted-foreground">{count}</span>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function Row({ label, sub, selected, onClick, onDelete }: {
  label: string; sub?: string; selected?: boolean; onClick?: () => void; onDelete?: () => void;
}) {
  return (
    <li className={cn(
      "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm group",
      onClick && "cursor-pointer hover:bg-muted/60",
      selected && "bg-muted"
    )} onClick={onClick}>
      {onClick && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
      <div className="flex-1 min-w-0">
        <div className="truncate">{label}</div>
        {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
      </div>
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </li>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground py-6 text-center">{text}</p>;
}
