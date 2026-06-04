/**
 * Curriculum Graph helpers
 * ------------------------
 * Thin client around the lectures + concepts tables. School-scoped via RLS.
 * school_id is passed explicitly so inserts succeed even if triggers are absent.
 */
import { supabase } from '@/integrations/supabase/client';

export interface Lecture {
  id: string;
  subject_id: string;
  school_id: string;
  title: string;
  description: string | null;
  order_index: number;
  difficulty_level: number;
  is_active: boolean;
}

export interface Concept {
  id: string;
  lecture_id: string;
  subject_id: string;
  school_id: string;
  name: string;
  description: string | null;
  difficulty_weight: number;
  order_index: number;
  is_active: boolean;
}

export interface CurriculumVersion {
  id: string;
  school_id: string;
  version_label: string | null;
  changes: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

export async function listLectures(subjectId: string): Promise<Lecture[]> {
  const { data, error } = await supabase
    .from('lectures' as any)
    .select('*')
    .eq('subject_id', subjectId)
    .order('order_index', { ascending: true });
  if (error) { console.warn('[curriculum] listLectures', error.message); return []; }
  return (data || []) as unknown as Lecture[];
}

export async function listConcepts(lectureId: string): Promise<Concept[]> {
  const { data, error } = await supabase
    .from('concepts' as any)
    .select('*')
    .eq('lecture_id', lectureId)
    .order('order_index', { ascending: true });
  if (error) { console.warn('[curriculum] listConcepts', error.message); return []; }
  return (data || []) as unknown as Concept[];
}

export async function createLecture(input: {
  school_id: string; subject_id: string; title: string; description?: string;
  order_index?: number; difficulty_level?: number;
}): Promise<Lecture | null> {
  const { data, error } = await supabase
    .from('lectures' as any)
    .insert({
      school_id: input.school_id,
      subject_id: input.subject_id,
      title: input.title,
      description: input.description ?? null,
      order_index: input.order_index ?? 0,
      difficulty_level: input.difficulty_level ?? 0,
    })
    .select()
    .maybeSingle();
  if (error) { console.warn('[curriculum] createLecture', error.message); return null; }
  return (data as unknown as Lecture) ?? null;
}

export async function createConcept(input: {
  school_id: string; subject_id: string; lecture_id: string; name: string;
  description?: string; difficulty_weight?: number; order_index?: number;
}): Promise<Concept | null> {
  const { data, error } = await supabase
    .from('concepts' as any)
    .insert({
      school_id: input.school_id,
      subject_id: input.subject_id,
      lecture_id: input.lecture_id,
      name: input.name,
      description: input.description ?? null,
      difficulty_weight: input.difficulty_weight ?? 1.0,
      order_index: input.order_index ?? 0,
    })
    .select()
    .maybeSingle();
  if (error) { console.warn('[curriculum] createConcept', error.message); return null; }
  return (data as unknown as Concept) ?? null;
}

export async function updateLecture(id: string, patch: Partial<Lecture>): Promise<boolean> {
  const { error } = await supabase.from('lectures' as any).update(patch).eq('id', id);
  if (error) { console.warn('[curriculum] updateLecture', error.message); return false; }
  return true;
}

export async function updateConcept(id: string, patch: Partial<Concept>): Promise<boolean> {
  const { error } = await supabase.from('concepts' as any).update(patch).eq('id', id);
  if (error) { console.warn('[curriculum] updateConcept', error.message); return false; }
  return true;
}

export async function deleteLecture(id: string): Promise<boolean> {
  const { error } = await supabase.from('lectures' as any).delete().eq('id', id);
  return !error;
}

export async function deleteConcept(id: string): Promise<boolean> {
  const { error } = await supabase.from('concepts' as any).delete().eq('id', id);
  return !error;
}

export async function listCurriculumVersions(schoolId: string): Promise<CurriculumVersion[]> {
  const { data, error } = await supabase
    .from('curriculum_versions' as any)
    .select('*')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false });
  if (error) { console.warn('[curriculum] listVersions', error.message); return []; }
  return (data || []) as unknown as CurriculumVersion[];
}

export async function recordCurriculumChange(
  schoolId: string,
  changes: Record<string, unknown>,
  versionLabel?: string,
): Promise<void> {
  const { error } = await supabase.from('curriculum_versions' as any).insert({
    school_id: schoolId,
    version_label: versionLabel ?? null,
    changes,
    is_active: true,
  });
  if (error) console.warn('[curriculum] recordCurriculumChange', error.message);
}
