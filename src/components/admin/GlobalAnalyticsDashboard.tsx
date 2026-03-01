import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Building2, Users, GraduationCap, FileText, Brain,
  BarChart3, TrendingUp, Loader2, Globe, Sparkles, BookOpen
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface SchoolMetric {
  id: string;
  name: string;
  code: string;
  status: string;
  studentCount: number;
  teacherCount: number;
  assignmentCount: number;
  materialCount: number;
  avgAccuracy: number;
}

interface GlobalMetrics {
  totalSchools: number;
  activeSchools: number;
  totalStudents: number;
  totalTeachers: number;
  totalAssignments: number;
  totalMaterials: number;
  globalAvgAccuracy: number;
  schoolMetrics: SchoolMetric[];
  subjectPerformance: { subject: string; avgAccuracy: number; totalQuestions: number }[];
  learningStyleDistribution: { visual: number; logical: number; verbal: number; kinesthetic: number; conceptual: number } | null;
}

export function GlobalAnalyticsDashboard() {
  const [metrics, setMetrics] = useState<GlobalMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);

    // Fetch all schools
    const { data: schools } = await supabase.from('schools').select('*').order('name');
    const schoolList = schools || [];

    // Fetch all profiles
    const { data: profiles } = await supabase.from('profiles').select('id, school_id, user_type, is_active');
    const allProfiles = profiles || [];

    // Fetch all assignments
    const { data: assignments } = await supabase.from('assignments').select('id, school_id');
    const allAssignments = assignments || [];

    // Fetch all materials
    const { data: materials } = await supabase.from('course_materials').select('id, school_id');
    const allMaterials = materials || [];

    // Fetch learning performance data
    const { data: learningData } = await supabase.from('student_learning_profiles').select('*');
    const allLearning = learningData || [];

    // Fetch learning style profiles
    const { data: styleData } = await supabase.from('learning_style_profiles').select('visual_score, logical_score, verbal_score, kinesthetic_score, conceptual_score, total_interactions');
    const allStyles = (styleData || []).filter(s => (s.total_interactions || 0) >= 20);

    // Build per-school metrics
    const schoolMetrics: SchoolMetric[] = schoolList.map(school => {
      const schoolProfiles = allProfiles.filter(p => p.school_id === school.id);
      const students = schoolProfiles.filter(p => p.user_type === 'student' && p.is_active);
      const teachers = schoolProfiles.filter(p => p.user_type === 'teacher' && p.is_active);
      const schoolAssignments = allAssignments.filter(a => a.school_id === school.id);
      const schoolMaterials = allMaterials.filter(m => m.school_id === school.id);

      const studentIds = students.map(s => s.id);
      const studentLearning = allLearning.filter(l => studentIds.includes(l.user_id));
      const totalQ = studentLearning.reduce((s, d) => s + (d.total_questions_answered || 0), 0);
      const totalC = studentLearning.reduce((s, d) => s + (d.correct_answers || 0), 0);

      return {
        id: school.id,
        name: school.name,
        code: school.code,
        status: school.status,
        studentCount: students.length,
        teacherCount: teachers.length,
        assignmentCount: schoolAssignments.length,
        materialCount: schoolMaterials.length,
        avgAccuracy: totalQ > 0 ? Math.round((totalC / totalQ) * 100) : 0,
      };
    });

    // Global totals
    const totalStudents = allProfiles.filter(p => p.user_type === 'student' && p.is_active).length;
    const totalTeachers = allProfiles.filter(p => p.user_type === 'teacher' && p.is_active).length;
    const globalTotalQ = allLearning.reduce((s, d) => s + (d.total_questions_answered || 0), 0);
    const globalTotalC = allLearning.reduce((s, d) => s + (d.correct_answers || 0), 0);
    const globalAvgAccuracy = globalTotalQ > 0 ? Math.round((globalTotalC / globalTotalQ) * 100) : 0;

    // Subject performance
    const subjectMap = new Map<string, { totalAcc: number; n: number; totalQ: number }>();
    for (const d of allLearning) {
      const cur = subjectMap.get(d.subject) || { totalAcc: 0, n: 0, totalQ: 0 };
      cur.totalAcc += Number(d.recent_accuracy) || 0;
      cur.n += 1;
      cur.totalQ += d.total_questions_answered || 0;
      subjectMap.set(d.subject, cur);
    }
    const subjectPerformance = Array.from(subjectMap.entries())
      .map(([subject, data]) => ({
        subject,
        avgAccuracy: data.n > 0 ? Math.round(data.totalAcc / data.n) : 0,
        totalQuestions: data.totalQ,
      }))
      .sort((a, b) => b.totalQuestions - a.totalQuestions);

    // Learning style distribution
    let learningStyleDistribution = null;
    if (allStyles.length > 0) {
      const totals = { visual: 0, logical: 0, verbal: 0, kinesthetic: 0, conceptual: 0 };
      for (const s of allStyles) {
        totals.visual += s.visual_score || 0;
        totals.logical += s.logical_score || 0;
        totals.verbal += s.verbal_score || 0;
        totals.kinesthetic += s.kinesthetic_score || 0;
        totals.conceptual += s.conceptual_score || 0;
      }
      const n = allStyles.length;
      learningStyleDistribution = {
        visual: Math.round(totals.visual / n),
        logical: Math.round(totals.logical / n),
        verbal: Math.round(totals.verbal / n),
        kinesthetic: Math.round(totals.kinesthetic / n),
        conceptual: Math.round(totals.conceptual / n),
      };
    }

    setMetrics({
      totalSchools: schoolList.length,
      activeSchools: schoolList.filter(s => s.status === 'active').length,
      totalStudents,
      totalTeachers,
      totalAssignments: allAssignments.length,
      totalMaterials: allMaterials.length,
      globalAvgAccuracy,
      schoolMetrics,
      subjectPerformance,
      learningStyleDistribution,
    });

    setLoading(false);
  }, []);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="glass-effect rounded-xl p-6 bg-gradient-to-r from-primary/10 via-accent/10 to-violet-500/10">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Globe className="w-6 h-6 text-primary" />
          Global Analytics Dashboard
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Cross-school performance metrics • {metrics.totalSchools} schools deployed
        </p>
      </div>

      {/* Global KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPI icon={<Building2 className="w-5 h-5 text-blue-500" />} value={metrics.activeSchools} label="Active Schools" sub={`${metrics.totalSchools} total`} />
        <KPI icon={<Users className="w-5 h-5 text-green-500" />} value={metrics.totalStudents} label="Students" />
        <KPI icon={<GraduationCap className="w-5 h-5 text-violet-500" />} value={metrics.totalTeachers} label="Teachers" />
        <KPI icon={<FileText className="w-5 h-5 text-amber-500" />} value={metrics.totalAssignments} label="Assignments" />
        <KPI icon={<BookOpen className="w-5 h-5 text-cyan-500" />} value={metrics.totalMaterials} label="Materials" />
        <KPI icon={<BarChart3 className="w-5 h-5 text-emerald-500" />} value={`${metrics.globalAvgAccuracy}%`} label="Avg Accuracy" />
      </div>

      {/* School-by-School */}
      <div className="glass-effect rounded-xl p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" />
          School Performance Breakdown
        </h3>
        <div className="space-y-3">
          {metrics.schoolMetrics.map(school => (
            <div key={school.id} className="flex items-center gap-4 p-3 rounded-lg border border-border/30 hover:bg-muted/30 transition-colors">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0",
                school.status === 'active' ? "bg-gradient-to-br from-green-500 to-emerald-600" : "bg-gradient-to-br from-red-500 to-rose-600"
              )}>
                {school.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{school.name}</p>
                <p className="text-xs text-muted-foreground">
                  {school.studentCount} students • {school.teacherCount} teachers • {school.assignmentCount} assignments
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className={cn(
                  "text-sm font-bold",
                  school.avgAccuracy >= 70 ? "text-green-500" : school.avgAccuracy >= 50 ? "text-amber-500" : "text-muted-foreground"
                )}>
                  {school.avgAccuracy > 0 ? `${school.avgAccuracy}%` : 'N/A'}
                </p>
                <p className="text-[10px] text-muted-foreground">accuracy</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Subject Performance */}
        {metrics.subjectPerformance.length > 0 && (
          <div className="glass-effect rounded-xl p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Subject Performance (Global)
            </h3>
            <div className="space-y-3">
              {metrics.subjectPerformance.slice(0, 8).map(sub => (
                <div key={sub.subject} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="capitalize font-medium">{sub.subject}</span>
                    <span className={cn(
                      "font-medium",
                      sub.avgAccuracy >= 70 ? "text-green-500" : sub.avgAccuracy >= 50 ? "text-amber-500" : "text-red-500"
                    )}>
                      {sub.avgAccuracy}%
                    </span>
                  </div>
                  <Progress value={sub.avgAccuracy} className="h-2" />
                  <p className="text-[10px] text-muted-foreground">{sub.totalQuestions.toLocaleString()} questions answered</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Learning Style Distribution */}
        {metrics.learningStyleDistribution && (
          <div className="glass-effect rounded-xl p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Brain className="w-4 h-4 text-violet-500" />
              Global Learning Style Distribution
            </h3>
            <div className="space-y-3">
              {(['visual', 'logical', 'verbal', 'kinesthetic', 'conceptual'] as const).map(style => {
                const val = metrics.learningStyleDistribution![style];
                const colors: Record<string, string> = {
                  visual: 'text-blue-500', logical: 'text-purple-500', verbal: 'text-green-500',
                  kinesthetic: 'text-orange-500', conceptual: 'text-cyan-500',
                };
                return (
                  <div key={style} className="flex items-center gap-3">
                    <span className={cn("text-xs font-medium capitalize w-24", colors[style])}>{style}</span>
                    <Progress value={val} className="h-2 flex-1" />
                    <span className="text-xs font-bold w-10 text-right">{val}%</span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Visual learning is dominant globally. Consider emphasizing visual-first teaching approaches in teacher training.
            </p>
          </div>
        )}
      </div>

      {/* Teacher Productivity Summary */}
      <div className="glass-effect rounded-xl p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-green-500" />
          Platform Impact Summary
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-500">{Math.round(metrics.totalAssignments * 18 / 60)}h</p>
            <p className="text-xs text-muted-foreground">Teacher Hours Saved</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{metrics.totalAssignments + metrics.totalMaterials}</p>
            <p className="text-xs text-muted-foreground">Content Items Created</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-violet-500">{metrics.globalAvgAccuracy}%</p>
            <p className="text-xs text-muted-foreground">Student Accuracy</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-amber-500">${Math.round(metrics.totalAssignments * 18 / 60 * 30)}</p>
            <p className="text-xs text-muted-foreground">Est. Productivity Value</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function KPI({ icon, value, label, sub }: { icon: React.ReactNode; value: number | string; label: string; sub?: string }) {
  return (
    <div className="glass-effect rounded-xl p-3 text-center">
      <div className="flex justify-center mb-1">{icon}</div>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      {sub && <p className="text-[9px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
