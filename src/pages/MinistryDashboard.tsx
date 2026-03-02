import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { 
  Shield, LogOut, Loader2, Building2, Users, GraduationCap, 
  BarChart3, AlertTriangle, FileText, TrendingUp, TrendingDown,
  BookOpen, Award
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';

type SchoolStats = {
  id: string;
  name: string;
  status: string;
  studentCount: number;
  teacherCount: number;
  assignmentCount: number;
  submissionCount: number;
  avgAccuracy: number;
  materialCount: number;
  completionRate: number;
};

type NationalStats = {
  totalSchools: number;
  totalStudents: number;
  totalTeachers: number;
  totalAssignments: number;
  totalSubmissions: number;
  avgCompletionRate: number;
  totalMaterials: number;
};

export default function MinistryDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [sessionValid, setSessionValid] = useState(false);
  const [schoolStats, setSchoolStats] = useState<SchoolStats[]>([]);
  const [nationalStats, setNationalStats] = useState<NationalStats | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'schools' | 'compliance' | 'atrisk'>('overview');
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [timeLeft, setTimeLeft] = useState(900); // 15 min in seconds

  // Session validation
  useEffect(() => {
    const token = sessionStorage.getItem('ministry_session_token');
    if (!token) {
      navigate('/ministry');
      return;
    }

    const validate = async () => {
      const { data } = await supabase.rpc('check_ministry_session', { p_session_token: token });
      const result = data as { valid: boolean } | null;
      if (!result?.valid) {
        sessionStorage.removeItem('ministry_session_token');
        navigate('/ministry');
      } else {
        setSessionValid(true);
        setLoading(false);
      }
    };
    validate();
  }, [navigate]);

  // 15-minute timeout with countdown
  useEffect(() => {
    if (!sessionValid) return;

    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastActivity) / 1000);
      const remaining = 900 - elapsed;
      setTimeLeft(Math.max(0, remaining));
      
      if (remaining <= 0) {
        sessionStorage.removeItem('ministry_session_token');
        navigate('/ministry');
      }
    }, 1000);

    const resetTimer = () => setLastActivity(Date.now());
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('click', resetTimer);

    return () => {
      clearInterval(timer);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('click', resetTimer);
    };
  }, [sessionValid, lastActivity, navigate]);

  // Refresh session on activity
  useEffect(() => {
    if (!sessionValid) return;
    const token = sessionStorage.getItem('ministry_session_token');
    if (token) {
      supabase.rpc('check_ministry_session', { p_session_token: token });
    }
  }, [lastActivity, sessionValid]);

  // Fetch real data via security definer function (bypasses RLS)
  const fetchData = useCallback(async () => {
    const token = sessionStorage.getItem('ministry_session_token');
    if (!token) return;

    const { data, error } = await supabase.rpc('get_ministry_dashboard_data', {
      p_session_token: token
    });

    if (error || !data || (data as any).error) return;

    const { schools, profiles, assignments, submissions, materials, learningProfiles } = data as any;

    // Build per-school stats
    const stats: SchoolStats[] = (schools as any[]).map(school => {
      const schoolProfiles = (profiles || []).filter((p: any) => p.school_id === school.id && p.is_active);
      const students = schoolProfiles.filter((p: any) => p.user_type === 'student');
      const teachers = schoolProfiles.filter((p: any) => p.user_type === 'teacher');
      const schoolAssignments = (assignments || []).filter((a: any) => a.school_id === school.id);
      const schoolMaterials = (materials || []).filter((m: any) => m.school_id === school.id);
      
      const assignmentIds = new Set(schoolAssignments.map((a: any) => a.id));
      const schoolSubmissions = (submissions || []).filter((s: any) => assignmentIds.has(s.assignment_id));
      
      const totalPossible = students.length * schoolAssignments.length;
      const completionRate = totalPossible > 0 ? (schoolSubmissions.length / totalPossible) * 100 : 0;

      const studentIds = new Set(students.map((s: any) => s.id));
      const studentLearning = (learningProfiles || []).filter((lp: any) => studentIds.has(lp.user_id));
      const totalCorrect = studentLearning.reduce((sum: number, lp: any) => sum + (lp.correct_answers || 0), 0);
      const totalQ = studentLearning.reduce((sum: number, lp: any) => sum + (lp.total_questions_answered || 0), 0);
      const avgAccuracy = totalQ > 0 ? (totalCorrect / totalQ) * 100 : 0;

      return {
        id: school.id,
        name: school.name,
        status: school.status,
        studentCount: students.length,
        teacherCount: teachers.length,
        assignmentCount: schoolAssignments.length,
        submissionCount: schoolSubmissions.length,
        avgAccuracy: Math.round(avgAccuracy * 10) / 10,
        materialCount: schoolMaterials.length,
        completionRate: Math.round(completionRate * 10) / 10,
      };
    });

    setSchoolStats(stats);

    const totalStudents = stats.reduce((s, sc) => s + sc.studentCount, 0);
    const totalTeachers = stats.reduce((s, sc) => s + sc.teacherCount, 0);
    const totalAssign = stats.reduce((s, sc) => s + sc.assignmentCount, 0);
    const totalSubs = stats.reduce((s, sc) => s + sc.submissionCount, 0);
    const totalMats = stats.reduce((s, sc) => s + sc.materialCount, 0);
    const avgCompletion = stats.length > 0
      ? stats.reduce((s, sc) => s + sc.completionRate, 0) / stats.length
      : 0;

    setNationalStats({
      totalSchools: stats.length,
      totalStudents,
      totalTeachers,
      totalAssignments: totalAssign,
      totalSubmissions: totalSubs,
      avgCompletionRate: Math.round(avgCompletion * 10) / 10,
      totalMaterials: totalMats,
    });
  }, []);

  useEffect(() => {
    if (sessionValid) fetchData();
  }, [sessionValid, fetchData]);

  const handleLogout = () => {
    sessionStorage.removeItem('ministry_session_token');
    navigate('/ministry');
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  const tabs = [
    { id: 'overview' as const, label: 'National Overview', icon: BarChart3 },
    { id: 'schools' as const, label: 'School Rankings', icon: Building2 },
    { id: 'compliance' as const, label: 'Compliance Reports', icon: FileText },
    { id: 'atrisk' as const, label: 'At-Risk Alerts', icon: AlertTriangle },
  ];

  return (
    <div className="min-h-screen bg-black text-gray-200">
      {/* Header */}
      <header className="border-b border-emerald-900/30 bg-black/90 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-900/30 border border-emerald-700/30 flex items-center justify-center">
              <Shield className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-emerald-400">Ministry of Education</h1>
              <p className="text-[10px] text-gray-600 font-mono">CLASSIFIED ACCESS • SESSION ACTIVE</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className={`text-xs font-mono px-3 py-1 rounded-full border ${
              timeLeft < 120 ? 'border-red-700 text-red-400 bg-red-950/30' : 'border-emerald-700/30 text-emerald-500 bg-emerald-950/20'
            }`}>
              ⏱ {formatTime(timeLeft)}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleLogout}
              className="border-red-800/50 text-red-400 hover:bg-red-950/50 gap-1"
            >
              <LogOut className="w-3 h-3" />
              End Session
            </Button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-gray-900">
        <div className="max-w-7xl mx-auto px-6 flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-gray-600 hover:text-gray-400'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'overview' && nationalStats && (
          <div className="space-y-8">
            <h2 className="text-xl font-bold text-emerald-400">🏛️ National Education Overview</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Schools', value: nationalStats.totalSchools, icon: Building2, color: 'emerald' },
                { label: 'Total Students', value: nationalStats.totalStudents, icon: GraduationCap, color: 'blue' },
                { label: 'Total Teachers', value: nationalStats.totalTeachers, icon: Users, color: 'purple' },
                { label: 'Total Assignments', value: nationalStats.totalAssignments, icon: BookOpen, color: 'amber' },
                { label: 'Total Submissions', value: nationalStats.totalSubmissions, icon: FileText, color: 'cyan' },
                { label: 'Avg Completion', value: `${nationalStats.avgCompletionRate}%`, icon: TrendingUp, color: 'green' },
                { label: 'Total Materials', value: nationalStats.totalMaterials, icon: BookOpen, color: 'orange' },
                { label: 'Teacher:Student Ratio', value: nationalStats.totalTeachers > 0 ? `1:${Math.round(nationalStats.totalStudents / nationalStats.totalTeachers)}` : 'N/A', icon: Users, color: 'pink' },
              ].map((stat, i) => (
                <div key={i} className="bg-gray-950 border border-gray-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <stat.icon className={`w-4 h-4 text-${stat.color}-500`} />
                    <span className="text-xs text-gray-500">{stat.label}</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-200">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'schools' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-emerald-400">🏫 School Performance Rankings</h2>
            <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800 hover:bg-transparent">
                    <TableHead className="text-gray-500">Rank</TableHead>
                    <TableHead className="text-gray-500">School</TableHead>
                    <TableHead className="text-gray-500">Students</TableHead>
                    <TableHead className="text-gray-500">Teachers</TableHead>
                    <TableHead className="text-gray-500">Assignments</TableHead>
                    <TableHead className="text-gray-500">Completion Rate</TableHead>
                    <TableHead className="text-gray-500">Avg Accuracy</TableHead>
                    <TableHead className="text-gray-500">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...schoolStats]
                    .sort((a, b) => b.completionRate - a.completionRate)
                    .map((school, i) => (
                    <TableRow key={school.id} className="border-gray-800/50">
                      <TableCell className="font-mono text-emerald-500">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                      </TableCell>
                      <TableCell className="font-medium text-gray-200">{school.name}</TableCell>
                      <TableCell>{school.studentCount}</TableCell>
                      <TableCell>{school.teacherCount}</TableCell>
                      <TableCell>{school.assignmentCount}</TableCell>
                      <TableCell>
                        <span className={school.completionRate >= 50 ? 'text-emerald-400' : 'text-red-400'}>
                          {school.completionRate}%
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={school.avgAccuracy >= 60 ? 'text-emerald-400' : 'text-amber-400'}>
                          {school.avgAccuracy}%
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          school.status === 'active' 
                            ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-700/30' 
                            : 'bg-red-950/50 text-red-400 border border-red-700/30'
                        }`}>
                          {school.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {schoolStats.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-gray-600 py-8">
                        No schools registered in the system
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {activeTab === 'compliance' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-emerald-400">📋 Compliance & Readiness Reports</h2>
            <div className="grid gap-4">
              {schoolStats.map(school => {
                const hasTeachers = school.teacherCount > 0;
                const hasMaterials = school.materialCount > 0;
                const hasAssignments = school.assignmentCount > 0;
                const goodRatio = school.teacherCount > 0 && (school.studentCount / school.teacherCount) <= 25;
                const score = [hasTeachers, hasMaterials, hasAssignments, goodRatio].filter(Boolean).length;
                
                return (
                  <div key={school.id} className="bg-gray-950 border border-gray-800 rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-200">{school.name}</h3>
                        <p className="text-xs text-gray-600">{school.studentCount} students, {school.teacherCount} teachers</p>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                        score >= 4 ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-700/30' :
                        score >= 2 ? 'bg-amber-950/50 text-amber-400 border border-amber-700/30' :
                        'bg-red-950/50 text-red-400 border border-red-700/30'
                      }`}>
                        {score}/4 Compliant
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {[
                        { label: 'Teachers Assigned', ok: hasTeachers },
                        { label: 'Materials Uploaded', ok: hasMaterials },
                        { label: 'Assignments Created', ok: hasAssignments },
                        { label: 'Student:Teacher ≤ 25:1', ok: goodRatio },
                      ].map((item, i) => (
                        <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                          item.ok ? 'bg-emerald-950/20 text-emerald-400' : 'bg-red-950/20 text-red-400'
                        }`}>
                          {item.ok ? '✅' : '❌'} {item.label}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'atrisk' && sessionValid && (
          <AtRiskTab sessionToken={sessionStorage.getItem('ministry_session_token') || ''} />
        )}
      </main>
    </div>
  );
}

function AtRiskTab({ sessionToken }: { sessionToken: string }) {
  const [loading, setLoading] = useState(true);
  const [atRiskStudents, setAtRiskStudents] = useState<any[]>([]);

  useEffect(() => {
    const fetchAtRisk = async () => {
      const { data, error } = await supabase.rpc('get_ministry_dashboard_data', {
        p_session_token: sessionToken
      });

      if (error || !data || (data as any).error) { setLoading(false); return; }

      const { learningProfiles, profiles, schools } = data as any;

      // Filter at-risk: accuracy < 40%, questions > 5
      const atRiskLPs = (learningProfiles || []).filter(
        (lp: any) => (lp.recent_accuracy || 0) < 40 && (lp.total_questions_answered || 0) > 5
      );

      if (atRiskLPs.length === 0) { setLoading(false); return; }

      const schoolMap = new Map((schools || []).map((s: any) => [s.id, s.name]));
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      const atRisk = atRiskLPs.map((lp: any) => {
        const profile = profileMap.get(lp.user_id) as any;
        return {
          ...lp,
          studentName: profile?.full_name || 'Unknown',
          schoolName: schoolMap.get(profile?.school_id) || 'Unknown',
          gradeLevel: profile?.grade_level || 'N/A',
        };
      }).sort((a: any, b: any) => (a.recent_accuracy || 0) - (b.recent_accuracy || 0));

      setAtRiskStudents(atRisk);
      setLoading(false);
    };
    fetchAtRisk();
  }, [sessionToken]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-emerald-400">🚨 At-Risk Student Alerts</h2>
      <p className="text-sm text-gray-500">
        Students with less than 40% accuracy after 5+ questions answered. Data sourced from adaptive learning profiles.
      </p>

      {atRiskStudents.length === 0 ? (
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-8 text-center">
          <Award className="w-10 h-10 mx-auto mb-3 text-emerald-500" />
          <p className="text-gray-400">No at-risk students detected. All students are performing adequately.</p>
        </div>
      ) : (
        <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-800 hover:bg-transparent">
                <TableHead className="text-gray-500">Student</TableHead>
                <TableHead className="text-gray-500">School</TableHead>
                <TableHead className="text-gray-500">Grade</TableHead>
                <TableHead className="text-gray-500">Subject</TableHead>
                <TableHead className="text-gray-500">Accuracy</TableHead>
                <TableHead className="text-gray-500">Questions</TableHead>
                <TableHead className="text-gray-500">Level</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {atRiskStudents.map((student, i) => (
                <TableRow key={i} className="border-gray-800/50">
                  <TableCell className="font-medium text-gray-200">{student.studentName}</TableCell>
                  <TableCell className="text-gray-400">{student.schoolName}</TableCell>
                  <TableCell>{student.gradeLevel}</TableCell>
                  <TableCell>{student.subject}</TableCell>
                  <TableCell>
                    <span className="text-red-400 font-mono">
                      {Math.round(student.recent_accuracy || 0)}%
                    </span>
                  </TableCell>
                  <TableCell>{student.total_questions_answered}</TableCell>
                  <TableCell>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-red-950/50 text-red-400 border border-red-700/30">
                      {student.difficulty_level}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
