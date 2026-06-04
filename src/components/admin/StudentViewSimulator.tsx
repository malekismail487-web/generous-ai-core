import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Play, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { deriveTeachingPolicy, TeachingPolicy } from '@/lib/adaptive/teachingPolicy';
import { listLectures, listConcepts, Concept } from '@/lib/adaptive/curriculumGraph';
import { useToast } from '@/hooks/use-toast';

interface StudentRow { id: string; full_name: string; grade_level: string | null }
interface SubjectRow { id: string; name: string }

export function StudentViewSimulator({ schoolId }: { schoolId: string }) {
  const { toast } = useToast();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);

  const [studentId, setStudentId] = useState<string>('');
  const [subjectId, setSubjectId] = useState<string>('');
  const [conceptId, setConceptId] = useState<string>('');

  const [policy, setPolicy] = useState<TeachingPolicy | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    (async () => {
      const [stuRes, subRes] = await Promise.all([
        supabase.from('profiles').select('id,full_name,grade_level')
          .eq('school_id', schoolId).eq('user_type', 'student').eq('is_active', true)
          .order('full_name').limit(500),
        supabase.from('subjects').select('id,name').eq('school_id', schoolId).order('name'),
      ]);
      setStudents((stuRes.data || []) as StudentRow[]);
      setSubjects((subRes.data || []) as SubjectRow[]);
    })();
  }, [schoolId]);

  useEffect(() => {
    if (!subjectId) { setConcepts([]); setConceptId(''); return; }
    (async () => {
      const lectures = await listLectures(subjectId);
      const all: Concept[] = [];
      for (const l of lectures) {
        const cs = await listConcepts(l.id);
        all.push(...cs);
      }
      setConcepts(all);
    })();
  }, [subjectId]);

  const run = async () => {
    if (!studentId || !conceptId) {
      toast({ variant: 'destructive', title: 'Pick a student and concept' });
      return;
    }
    setRunning(true);
    setPolicy(null);
    try {
      // Pull real adaptive state
      const subj = subjects.find(s => s.id === subjectId)?.name || '';
      const [abilityRes, masteryRes] = await Promise.all([
        supabase.from('ability_estimates').select('theta,standard_error')
          .eq('user_id', studentId).eq('subject', subj).maybeSingle(),
        supabase.from('concept_mastery').select('mastery_level')
          .eq('user_id', studentId).eq('concept_id', conceptId).maybeSingle(),
      ]);
      const concept = concepts.find(c => c.id === conceptId);
      const derived = deriveTeachingPolicy({
        theta: abilityRes.data?.theta ?? 0,
        standardError: abilityRes.data?.standard_error ?? 1,
        conceptMastery: masteryRes.data?.mastery_level ?? 0.5,
        lectureMastery: 0.5,
        conceptDifficulty: concept ? Number(concept.difficulty_weight) : 1.0,
        recentErrorCount: 0,
      });
      setPolicy(derived);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card/40 p-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Eye className="w-4 h-4" /> Student View Simulator
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Pick a student and a concept to see exactly what teaching policy the engine derives for them, right now.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card/40 p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <Picker label="Student" value={studentId} onChange={setStudentId}
          options={students.map(s => ({ value: s.id, label: `${s.full_name}${s.grade_level ? ` · ${s.grade_level}` : ''}` }))} />
        <Picker label="Subject" value={subjectId} onChange={setSubjectId}
          options={subjects.map(s => ({ value: s.id, label: s.name }))} />
        <Picker label="Concept" value={conceptId} onChange={setConceptId} disabled={!subjectId}
          options={concepts.map(c => ({ value: c.id, label: c.name }))} />
      </div>

      <Button onClick={run} disabled={running || !studentId || !conceptId}>
        {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
        Derive Policy
      </Button>

      {policy && (
        <div className="rounded-xl border border-border bg-card/40 p-4">
          <h3 className="text-sm font-semibold mb-3">Derived Teaching Policy</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Stat label="Difficulty" value={policy.difficulty} />
            <Stat label="Pacing" value={policy.pacing} />
            <Stat label="Strategy" value={policy.strategy} />
            <Stat label="Cognitive load" value={policy.cognitiveLoad.toFixed(2)} />
            <Stat label="Remediation" value={policy.remediationLevel.toFixed(2)} />
            <Stat label="Verification" value={policy.verificationFrequency.toFixed(2)} />
            <Stat label="Abstraction" value={policy.abstractionLevel.toFixed(2)} />
          </div>
        </div>
      )}
    </div>
  );
}

function Picker({ label, value, onChange, options, disabled }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; disabled?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger><SelectValue placeholder={`Select ${label.toLowerCase()}`} /></SelectTrigger>
        <SelectContent>
          {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-background/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-mono text-sm mt-0.5 capitalize">{value}</div>
    </div>
  );
}
