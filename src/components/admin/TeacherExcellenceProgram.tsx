import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Trophy, Users, Loader2, FileText, BookOpen,
  Star, Award, TrendingUp
} from 'lucide-react';
import { LuminaLogo } from '@/components/LuminaLogo';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface TeacherMetric {
  id: string;
  name: string;
  schoolName: string;
  totalAssignments: number;
  copilotAssignments: number;
  totalMaterials: number;
  totalSubmissions: number;
  avgStudentGrade: number;
  aiAdoptionRate: number;
  score: number;
}

export function TeacherExcellenceProgram() {
  const [teachers, setTeachers] = useState<TeacherMetric[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTeachers = useCallback(async () => {
    setLoading(true);

    const [
      { data: profiles },
      { data: assignments },
      { data: materials },
      { data: submissions },
      { data: schools },
    ] = await Promise.all([
      supabase.from('profiles').select('id, full_name, school_id, user_type, is_active')
        .eq('user_type', 'teacher').eq('is_active', true),
      supabase.from('assignments').select('id, teacher_id, school_id, source'),
      supabase.from('course_materials').select('id, uploaded_by'),
      supabase.from('submissions').select('id, assignment_id, grade'),
      supabase.from('schools').select('id, name'),
    ]);

    const teacherProfiles = profiles || [];
    const allAssignments = assignments || [];
    const allMaterials = materials || [];
    const allSubmissions = submissions || [];
    const schoolMap = new Map((schools || []).map(s => [s.id, s.name]));

    const teacherMetrics: TeacherMetric[] = teacherProfiles.map(teacher => {
      const tAssignments = allAssignments.filter(a => a.teacher_id === teacher.id);
      const copilot = tAssignments.filter(a => a.source === 'copilot').length;
      const tMaterials = allMaterials.filter(m => m.uploaded_by === teacher.id);
      const tAssignmentIds = tAssignments.map(a => a.id);
      const tSubmissions = allSubmissions.filter(s => tAssignmentIds.includes(s.assignment_id));
      const gradedSubs = tSubmissions.filter(s => s.grade !== null);
      const avgGrade = gradedSubs.length > 0
        ? Math.round(gradedSubs.reduce((sum, s) => sum + (s.grade || 0), 0) / gradedSubs.length)
        : 0;
      const aiAdoption = tAssignments.length > 0 ? Math.round((copilot / tAssignments.length) * 100) : 0;

      // Excellence score: weighted combo
      const score = (tAssignments.length * 2) + (copilot * 3) + (tMaterials.length * 2) + (tSubmissions.length * 1) + (avgGrade * 0.5);

      return {
        id: teacher.id,
        name: teacher.full_name,
        schoolName: schoolMap.get(teacher.school_id) || 'Unknown',
        totalAssignments: tAssignments.length,
        copilotAssignments: copilot,
        totalMaterials: tMaterials.length,
        totalSubmissions: tSubmissions.length,
        avgStudentGrade: avgGrade,
        aiAdoptionRate: aiAdoption,
        score: Math.round(score),
      };
    }).sort((a, b) => b.score - a.score);

    setTeachers(teacherMetrics);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTeachers(); }, [fetchTeachers]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const topTeachers = teachers.slice(0, 10);
  const medalColors = ['text-amber-400', 'text-slate-400', 'text-amber-600'];

  return (
    <div className="space-y-6">
      <div className="glass-effect rounded-xl p-5 bg-gradient-to-r from-amber-500/10 to-orange-500/10">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-500" />
          Teacher Excellence Program
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Top-performing teachers across all schools
        </p>
      </div>

      {topTeachers.length === 0 ? (
        <div className="glass-effect rounded-xl p-8 text-center">
          <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">No teacher data available yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {topTeachers.map((teacher, idx) => (
            <div key={teacher.id} className="glass-effect rounded-xl p-4 flex items-center gap-4">
              <div className="shrink-0 text-center w-10">
                {idx < 3 ? (
                  <Award className={cn("w-6 h-6 mx-auto", medalColors[idx])} />
                ) : (
                  <span className="text-lg font-bold text-muted-foreground">#{idx + 1}</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{teacher.name}</p>
                <p className="text-xs text-muted-foreground">{teacher.schoolName}</p>
              </div>

              <div className="flex gap-3 shrink-0 text-center">
                <div>
                  <p className="text-sm font-bold">{teacher.totalAssignments}</p>
                  <p className="text-[10px] text-muted-foreground">Assignments</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-violet-500">{teacher.copilotAssignments}</p>
                  <p className="text-[10px] text-muted-foreground">AI</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-blue-500">{teacher.totalMaterials}</p>
                  <p className="text-[10px] text-muted-foreground">Materials</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-green-500">{teacher.totalSubmissions}</p>
                  <p className="text-[10px] text-muted-foreground">Submissions</p>
                </div>
              </div>

              <Badge variant="secondary" className="shrink-0 gap-1">
                <Star className="w-3 h-3 text-amber-500" />
                {teacher.score}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
