import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  FileText, Loader2, Building2, Users, GraduationCap,
  TrendingUp, Clock, Brain, Download
} from 'lucide-react';
import { LuminaLogo } from '@/components/LuminaLogo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ReportData {
  totalSchools: number;
  activeSchools: number;
  totalStudents: number;
  totalTeachers: number;
  totalAssignments: number;
  copilotAssignments: number;
  totalMaterials: number;
  globalAvgAccuracy: number;
  timeSavedHours: number;
  productivityValue: number;
  topSubjects: { subject: string; questions: number; accuracy: number }[];
  learningStyleDist: { style: string; pct: number }[] | null;
}

export function MinistryReadinessReport() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [
      { data: schools },
      { data: profiles },
      { data: assignments },
      { data: materials },
      { data: learning },
      { data: styles },
    ] = await Promise.all([
      supabase.from('schools').select('id, status'),
      supabase.from('profiles').select('id, user_type, is_active'),
      supabase.from('assignments').select('id, source'),
      supabase.from('course_materials').select('id'),
      supabase.from('student_learning_profiles').select('subject, total_questions_answered, correct_answers'),
      supabase.from('learning_style_profiles').select('visual_score, logical_score, verbal_score, kinesthetic_score, conceptual_score, total_interactions'),
    ]);

    const allSchools = schools || [];
    const allProfiles = profiles || [];
    const allAssignments = assignments || [];
    const allLearning = learning || [];
    const allStyles = (styles || []).filter(s => (s.total_interactions || 0) >= 20);

    const students = allProfiles.filter(p => p.user_type === 'student' && p.is_active);
    const teachers = allProfiles.filter(p => p.user_type === 'teacher' && p.is_active);
    const copilot = allAssignments.filter((a: any) => a.source === 'copilot').length;
    const totalQ = allLearning.reduce((s, d) => s + (d.total_questions_answered || 0), 0);
    const totalC = allLearning.reduce((s, d) => s + (d.correct_answers || 0), 0);
    const accuracy = totalQ > 0 ? Math.round((totalC / totalQ) * 100) : 0;
    const timeSaved = Math.round(copilot * 18 / 60);

    // Top subjects
    const subjMap = new Map<string, { q: number; c: number }>();
    for (const d of allLearning) {
      const cur = subjMap.get(d.subject) || { q: 0, c: 0 };
      cur.q += d.total_questions_answered || 0;
      cur.c += d.correct_answers || 0;
      subjMap.set(d.subject, cur);
    }
    const topSubjects = Array.from(subjMap.entries())
      .map(([subject, v]) => ({ subject, questions: v.q, accuracy: v.q > 0 ? Math.round((v.c / v.q) * 100) : 0 }))
      .sort((a, b) => b.questions - a.questions)
      .slice(0, 5);

    // Learning style distribution
    let learningStyleDist = null;
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
      learningStyleDist = Object.entries(totals).map(([style, val]) => ({
        style,
        pct: Math.round(val / n),
      }));
    }

    setData({
      totalSchools: allSchools.length,
      activeSchools: allSchools.filter(s => s.status === 'active').length,
      totalStudents: students.length,
      totalTeachers: teachers.length,
      totalAssignments: allAssignments.length,
      copilotAssignments: copilot,
      totalMaterials: (materials || []).length,
      globalAvgAccuracy: accuracy,
      timeSavedHours: timeSaved,
      productivityValue: timeSaved * 30,
      topSubjects,
      learningStyleDist,
    });
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const exportReport = () => {
    if (!data) return;
    const report = `
LUMINA EDUCATIONAL IMPACT REPORT
Generated: ${new Date().toLocaleDateString()}
================================================

DEPLOYMENT OVERVIEW
- Schools Deployed: ${data.totalSchools} (${data.activeSchools} active)
- Total Students: ${data.totalStudents}
- Total Teachers: ${data.totalTeachers}

STUDENT OUTCOMES
- Global Average Accuracy: ${data.globalAvgAccuracy}%
- Total Questions Answered: ${data.topSubjects.reduce((s, t) => s + t.questions, 0).toLocaleString()}
- Top Subject: ${data.topSubjects[0]?.subject || 'N/A'} (${data.topSubjects[0]?.accuracy || 0}% accuracy)

TEACHER PRODUCTIVITY
- Total Assignments Created: ${data.totalAssignments}
- AI-Generated (Copilot): ${data.copilotAssignments}
- Course Materials Uploaded: ${data.totalMaterials}
- Teacher Hours Saved: ${data.timeSavedHours}h
- Estimated Productivity Value: $${data.productivityValue.toLocaleString()}/month

${data.learningStyleDist ? `LEARNING STYLE DISTRIBUTION
${data.learningStyleDist.map(l => `- ${l.style}: ${l.pct}%`).join('\n')}` : ''}

COMPETITIVE ADVANTAGE
- Only adaptive learning system with learning style personalization
- Only system with teacher AI Copilot
- Local device storage (privacy-first approach)

RECOMMENDATION
- Proceed with Ministry pilot (50-100 schools)
- Measure outcomes over 6 months
- Rollout nationwide based on pilot results
================================================
    `.trim();

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Lumina_Ministry_Report_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="glass-effect rounded-xl p-5 bg-gradient-to-r from-primary/10 to-violet-500/10 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Ministry Readiness Report
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Auto-generated impact report for government presentations
          </p>
        </div>
        <Button onClick={exportReport} className="gap-2">
          <Download className="w-4 h-4" />
          Export Report
        </Button>
      </div>

      {/* Deployment */}
      <div className="glass-effect rounded-xl p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-blue-500" />
          Deployment Overview
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold">{data.activeSchools}</p>
            <p className="text-xs text-muted-foreground">Active Schools</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-blue-500">{data.totalStudents.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Students</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-violet-500">{data.totalTeachers}</p>
            <p className="text-xs text-muted-foreground">Teachers</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-500">{data.globalAvgAccuracy}%</p>
            <p className="text-xs text-muted-foreground">Avg Accuracy</p>
          </div>
        </div>
      </div>

      {/* Productivity */}
      <div className="glass-effect rounded-xl p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-green-500" />
          Teacher Productivity Impact
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold">{data.totalAssignments}</p>
            <p className="text-xs text-muted-foreground">Total Assignments</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-violet-500">{data.copilotAssignments}</p>
            <p className="text-xs text-muted-foreground">AI-Generated</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-500">{data.timeSavedHours}h</p>
            <p className="text-xs text-muted-foreground">Hours Saved</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-amber-500">${data.productivityValue.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Monthly Value</p>
          </div>
        </div>
      </div>

      {/* Top Subjects */}
      {data.topSubjects.length > 0 && (
        <div className="glass-effect rounded-xl p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            Subject Performance
          </h3>
          <div className="space-y-3">
            {data.topSubjects.map(s => (
              <div key={s.subject} className="flex items-center gap-3">
                <span className="text-sm font-medium capitalize w-24">{s.subject}</span>
                <div className="flex-1">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full",
                        s.accuracy >= 70 ? "bg-green-500" : s.accuracy >= 50 ? "bg-amber-500" : "bg-red-500"
                      )}
                      style={{ width: `${s.accuracy}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs font-bold w-10 text-right">{s.accuracy}%</span>
                <span className="text-[10px] text-muted-foreground w-20 text-right">
                  {s.questions.toLocaleString()} Q
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Learning Style */}
      {data.learningStyleDist && (
        <div className="glass-effect rounded-xl p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Brain className="w-4 h-4 text-violet-500" />
            Global Learning Style Distribution
          </h3>
          <div className="grid grid-cols-5 gap-3 text-center">
            {data.learningStyleDist.map(l => (
              <div key={l.style}>
                <p className="text-xl font-bold">{l.pct}%</p>
                <p className="text-[10px] text-muted-foreground capitalize">{l.style}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
