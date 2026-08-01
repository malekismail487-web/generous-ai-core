import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Shield, LogOut, Building2, Users, GraduationCap, ChartBar as BarChart3, TriangleAlert as AlertTriangle, FileText, TrendingUp, BookOpen, Award, ClipboardList, LayoutDashboard, Radar } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { DashboardShell, NavItem } from '@/components/DashboardShell';
import { LuminaAtom } from '@/components/LuminaAtom';
import { ControlCenterShell } from '@/components/ministry/control/ControlCenterShell';
import { IntelligenceShell } from '@/components/ministry/intelligence/IntelligenceShell';

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

type Workspace = 'dashboard' | 'control' | 'intelligence';
type TabId = 'overview' | 'schools' | 'compliance' | 'atrisk' | 'moderators';

const SESSION_KEY = 'ministry_session_token';
const WORKSPACE_KEY = 'ministry_workspace';
const SESSION_MS = 15 * 60 * 1000;

function getStoredWorkspace(): Workspace {
  if (typeof window === 'undefined') return 'dashboard';
  const v = sessionStorage.getItem(WORKSPACE_KEY) as Workspace | null;
  return v === 'control' || v === 'intelligence' ? v : 'dashboard';
}

export default function MinistryDashboard() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [sessionValid, setSessionValid] = useState(false);
  const [schoolStats, setSchoolStats] = useState<SchoolStats[]>([]);
  const [nationalStats, setNationalStats] = useState<NationalStats | null>(null);

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [workspace, setWorkspace] = useState<Workspace>(getStoredWorkspace);
  useEffect(() => { sessionStorage.setItem(WORKSPACE_KEY, workspace); }, [workspace]);

  const [modRequests, setModRequests] = useState<any[]>([]);
  const [generatingModCode, setGeneratingModCode] = useState(false);
  const [latestModCode, setLatestModCode] = useState<string | null>(null);
  const [modActionLoading, setModActionLoading] = useState<string | null>(null);

  const [lastActivity, setLastActivity] = useState(Date.now());
  const [timeLeft, setTimeLeft] = useState(900);

  // ── Session validation ──
  useEffect(() => {
    const token = sessionStorage.getItem(SESSION_KEY);
    if (!token) { navigate('/ministry'); return; }

    const validate = async () => {
      const { data } = await supabase.rpc('check_ministry_session', { p_session_token: token });
      const result = data as { valid: boolean } | null;
      if (!result?.valid) {
        sessionStorage.removeItem(SESSION_KEY);
        navigate('/ministry');
      } else {
        setSessionValid(true);
        setLoading(false);
      }
    };
    validate();
  }, [navigate]);

  // ── 15-minute timeout with countdown ──
  useEffect(() => {
    if (!sessionValid) return;

    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastActivity) / 1000);
      const remaining = 900 - elapsed;
      setTimeLeft(Math.max(0, remaining));
      if (remaining <= 0) {
        sessionStorage.removeItem(SESSION_KEY);
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

  // ── Refresh session on activity ──
  useEffect(() => {
    if (!sessionValid) return;
    const token = sessionStorage.getItem(SESSION_KEY);
    if (token) supabase.rpc('check_ministry_session', { p_session_token: token });
  }, [lastActivity, sessionValid]);

  // ── Fetch real data via security definer function (bypasses RLS) ──
  const fetchData = useCallback(async () => {
    try {
      const token = sessionStorage.getItem(SESSION_KEY);
      if (!token) return;

      const { data, error } = await supabase.rpc('get_ministry_dashboard_data', {
        p_session_token: token,
      });

      if (error) {
        console.error('Ministry data fetch error:', error);
      }
      if (!data || (data as any).error) {
        console.warn('Ministry data empty or error:', (data as any)?.error);
        setSchoolStats([]);
        setNationalStats({
          totalSchools: 0, totalStudents: 0, totalTeachers: 0,
          totalAssignments: 0, totalSubmissions: 0, avgCompletionRate: 0, totalMaterials: 0,
        });
        return;
      }

      const { schools, profiles, assignments, submissions, materials, learningProfiles } = data as any;

      const stats: SchoolStats[] = (schools as any[]).map((school) => {
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
    } catch (e) {
      console.error('Ministry dashboard data processing error:', e);
      setSchoolStats([]);
      setNationalStats({
        totalSchools: 0, totalStudents: 0, totalTeachers: 0,
        totalAssignments: 0, totalSubmissions: 0, avgCompletionRate: 0, totalMaterials: 0,
      });
    }
  }, []);

  const fetchModRequests = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase.from('moderator_requests').select('*').order('created_at', { ascending: false });
    setModRequests(data || []);
  }, []);

  useEffect(() => { if (sessionValid) fetchData(); }, [sessionValid, fetchData]);
  useEffect(() => { if (sessionValid) fetchModRequests(); }, [sessionValid, fetchModRequests]);

  // ── Actions ──
  const handleLogout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    navigate('/ministry');
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const generateModeratorCode = async () => {
    setGeneratingModCode(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data, error } = await supabase.rpc('generate_moderator_invite_code');
      const result = data as { success: boolean; code?: string; error?: string } | null;
      if (error || !result?.success) {
        console.error('Error generating moderator code:', result?.error || error?.message);
      } else {
        setLatestModCode(result.code || null);
      }
    } finally {
      setGeneratingModCode(false);
    }
  };

  const handleModRequest = async (requestId: string, action: 'approve' | 'deny') => {
    const token = sessionStorage.getItem(SESSION_KEY);
    if (!token) {
      toast({ variant: 'destructive', title: 'Session expired. Please log in again.' });
      navigate('/ministry');
      return;
    }

    setModActionLoading(requestId);
    try {
      const rpcName = action === 'approve' ? 'approve_moderator_request' : 'deny_moderator_request';
      const { data, error } = await supabase.rpc(rpcName, {
        p_request_id: requestId,
        p_session_token: token,
      });
      const result = data as { success: boolean; error?: string } | null;

      if (error || !result?.success) {
        toast({ variant: 'destructive', title: result?.error || error?.message || `Failed to ${action} request` });
      } else {
        toast({ title: action === 'approve' ? '✅ Moderator approved' : '❌ Request denied' });
        fetchModRequests();
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: e.message || 'Unexpected error' });
    } finally {
      setModActionLoading(null);
    }
  };

  // ── Nav items ──
  const navItems: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 size={18} /> },
    { id: 'schools', label: 'Schools', icon: <Building2 size={18} /> },
    { id: 'compliance', label: 'Compliance', icon: <FileText size={18} /> },
    { id: 'atrisk', label: 'At-Risk', icon: <AlertTriangle size={18} /> },
    { id: 'moderators', label: 'Moderators', icon: <Shield size={18} /> },
  ];

  // ── Workspace switch (sidebarBottom) ──
  const workspaces: { id: Workspace; label: string; icon: typeof LayoutDashboard; hint: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, hint: 'Observe' },
    { id: 'control', label: 'Control', icon: ClipboardList, hint: 'Govern' },
    { id: 'intelligence', label: 'Intel', icon: Radar, hint: 'Analyze' },
  ];

  const sidebarBottom = (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/20 px-1 mb-1">Workspace</div>
      <div className="grid grid-cols-3 gap-1.5">
        {workspaces.map((ws) => {
          const isActive = workspace === ws.id;
          return (
            <button
              key={ws.id}
              onClick={() => setWorkspace(ws.id)}
              title={ws.hint}
              className={[
                'lumina-btn flex flex-col items-center gap-1 py-2 px-1 text-[10px] rounded-lg',
                isActive ? 'opacity-100' : 'opacity-45 hover:opacity-80',
              ].join(' ')}
            >
              <ws.icon size={15} className={isActive ? 'text-white' : 'text-white/60'} />
              <span className="font-medium tracking-wide">{ws.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  // ── Header right: session timer + logout ──
  const headerRight = (
    <div className="flex items-center gap-2 md:gap-3">
      <div
        className={[
          'text-xs font-mono px-3 py-1 rounded-full border',
          timeLeft < 120
            ? 'border-red-500/40 text-red-400 bg-red-500/10'
            : 'border-white/15 text-white/60 bg-white/[0.04]',
        ].join(' ')}
      >
        ⏱ {formatTime(timeLeft)}
      </div>
      <button onClick={handleLogout} className="lumina-btn text-xs px-3 py-1.5 flex items-center gap-1.5">
        <LogOut size={13} />
        <span className="hidden sm:inline">End Session</span>
      </button>
    </div>
  );

  // ── Loading state ──
  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <LuminaAtom size={48} animate />
      </div>
    );
  }

  // ── Workspace delegates ──
  if (workspace === 'control') {
    return (
      <DashboardShell
        role="Ministry"
        navItems={navItems}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as TabId)}
        headerRight={headerRight}
        sidebarBottom={sidebarBottom}
      >
        <div className="tab-enter">
          <ControlCenterShell />
        </div>
      </DashboardShell>
    );
  }
  if (workspace === 'intelligence') {
    return (
      <DashboardShell
        role="Ministry"
        navItems={navItems}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as TabId)}
        headerRight={headerRight}
        sidebarBottom={sidebarBottom}
      >
        <div className="tab-enter">
          <IntelligenceShell />
        </div>
      </DashboardShell>
    );
  }

  // ── Dashboard workspace ──
  return (
    <DashboardShell
      role="Ministry"
      navItems={navItems}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as TabId)}
      headerRight={headerRight}
      sidebarBottom={sidebarBottom}
    >
      {/* ───────────────────── Overview ───────────────────── */}
      {activeTab === 'overview' && (
        <div className="tab-enter px-4 md:px-8 py-8 max-w-7xl mx-auto space-y-8">
          {/* Hero with LuminaAtom */}
          <div className="lumina-card p-6 md:p-8 flex flex-col md:flex-row items-center gap-6 fade-up">
            <div className="lumina-icon-tile !w-20 !h-20 shrink-0">
              <LuminaAtom size={56} animate glow />
            </div>
            <div className="flex-1 text-center md:text-left">
              <h2 className="lumina-text text-2xl md:text-3xl font-bold">National Education Overview</h2>
              <p className="text-sm text-white/40 mt-1">
                Live ecosystem telemetry across all registered schools.
              </p>
            </div>
            <div className="text-right hidden md:block">
              <div className="text-[10px] uppercase tracking-[0.25em] text-white/25">Session</div>
              <div className="text-sm font-mono text-white/60">Active</div>
            </div>
          </div>

          {!nationalStats ? (
            <div className="flex items-center justify-center py-16">
              <LuminaAtom size={48} animate />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Schools', value: nationalStats.totalSchools, icon: Building2 },
                { label: 'Total Students', value: nationalStats.totalStudents, icon: GraduationCap },
                { label: 'Total Teachers', value: nationalStats.totalTeachers, icon: Users },
                { label: 'Total Assignments', value: nationalStats.totalAssignments, icon: BookOpen },
                { label: 'Total Submissions', value: nationalStats.totalSubmissions, icon: FileText },
                { label: 'Avg Completion', value: `${nationalStats.avgCompletionRate}%`, icon: TrendingUp },
                { label: 'Total Materials', value: nationalStats.totalMaterials, icon: BookOpen },
                {
                  label: 'Teacher : Student',
                  value: nationalStats.totalTeachers > 0
                    ? `1 : ${Math.round(nationalStats.totalStudents / nationalStats.totalTeachers)}`
                    : 'N/A',
                  icon: Users,
                },
              ].map((stat, i) => (
                <div key={i} className={`lumina-stat p-4 space-y-3 fade-up fade-up-delay-${Math.min(i + 1, 6)}`}>
                  <div className="lumina-icon-tile !w-9 !h-9">
                    <stat.icon size={16} className="text-white/70" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white/90">{stat.value}</div>
                    <div className="text-xs text-white/40 mt-0.5">{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ───────────────────── Schools ───────────────────── */}
      {activeTab === 'schools' && (
        <div className="tab-enter px-4 md:px-8 py-8 max-w-7xl mx-auto space-y-6">
          <div className="flex items-center gap-3 fade-up">
            <div className="lumina-icon-tile">
              <Building2 size={18} className="text-white/70" />
            </div>
            <h2 className="lumina-text text-xl font-bold">School Performance Rankings</h2>
          </div>

          <div className="lumina-card overflow-hidden fade-up fade-up-delay-1">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="text-white/40">Rank</TableHead>
                  <TableHead className="text-white/40">School</TableHead>
                  <TableHead className="text-white/40">Students</TableHead>
                  <TableHead className="text-white/40">Teachers</TableHead>
                  <TableHead className="text-white/40">Assignments</TableHead>
                  <TableHead className="text-white/40">Completion</TableHead>
                  <TableHead className="text-white/40">Avg Accuracy</TableHead>
                  <TableHead className="text-white/40">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...schoolStats]
                  .sort((a, b) => b.completionRate - a.completionRate)
                  .map((school, i) => (
                    <TableRow key={school.id} className="border-white/[0.04]">
                      <TableCell className="font-mono text-white/70">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                      </TableCell>
                      <TableCell className="font-medium text-white/90">{school.name}</TableCell>
                      <TableCell className="text-white/60">{school.studentCount}</TableCell>
                      <TableCell className="text-white/60">{school.teacherCount}</TableCell>
                      <TableCell className="text-white/60">{school.assignmentCount}</TableCell>
                      <TableCell>
                        <span className={school.completionRate >= 50 ? 'text-white/90' : 'text-red-400'}>
                          {school.completionRate}%
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={school.avgAccuracy >= 60 ? 'text-white/90' : 'text-amber-400'}>
                          {school.avgAccuracy}%
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={[
                            'px-2 py-0.5 rounded-full text-xs border',
                            school.status === 'active'
                              ? 'bg-white/[0.06] text-white/70 border-white/15'
                              : 'bg-red-500/10 text-red-400 border-red-500/30',
                          ].join(' ')}
                        >
                          {school.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                {schoolStats.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-white/40 py-8">
                      No schools registered in the system
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ───────────────────── Compliance ───────────────────── */}
      {activeTab === 'compliance' && (
        <div className="tab-enter px-4 md:px-8 py-8 max-w-7xl mx-auto space-y-6">
          <div className="flex items-center gap-3 fade-up">
            <div className="lumina-icon-tile">
              <FileText size={18} className="text-white/70" />
            </div>
            <h2 className="lumina-text text-xl font-bold">Compliance &amp; Readiness Reports</h2>
          </div>

          <div className="grid gap-4">
            {schoolStats.map((school, i) => {
              const hasTeachers = school.teacherCount > 0;
              const hasMaterials = school.materialCount > 0;
              const hasAssignments = school.assignmentCount > 0;
              const goodRatio = school.teacherCount > 0 && (school.studentCount / school.teacherCount) <= 25;
              const score = [hasTeachers, hasMaterials, hasAssignments, goodRatio].filter(Boolean).length;

              const scoreClass =
                score >= 4 ? 'bg-white/[0.06] text-white/80 border-white/20' :
                score >= 2 ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                'bg-red-500/10 text-red-400 border-red-500/30';

              return (
                <div key={school.id} className={`lumina-card p-5 space-y-4 fade-up fade-up-delay-${Math.min(i + 1, 6)}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-white/90">{school.name}</h3>
                      <p className="text-xs text-white/40 mt-0.5">
                        {school.studentCount} students · {school.teacherCount} teachers
                      </p>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-bold border ${scoreClass}`}>
                      {score}/4 Compliant
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {[
                      { label: 'Teachers Assigned', ok: hasTeachers },
                      { label: 'Materials Uploaded', ok: hasMaterials },
                      { label: 'Assignments Created', ok: hasAssignments },
                      { label: 'Student:Teacher ≤ 25:1', ok: goodRatio },
                    ].map((item, j) => (
                      <div
                        key={j}
                        className={[
                          'flex items-center gap-2 px-3 py-2 rounded-lg text-xs border',
                          item.ok
                            ? 'bg-white/[0.04] text-white/70 border-white/10'
                            : 'bg-red-500/10 text-red-400 border-red-500/20',
                        ].join(' ')}
                      >
                        <span>{item.ok ? '✅' : '❌'}</span>
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {schoolStats.length === 0 && (
              <div className="lumina-card p-8 text-center text-white/40">No schools to evaluate.</div>
            )}
          </div>
        </div>
      )}

      {/* ───────────────────── At-Risk ───────────────────── */}
      {activeTab === 'atrisk' && sessionValid && (
        <AtRiskTab sessionToken={sessionStorage.getItem(SESSION_KEY) || ''} />
      )}

      {/* ───────────────────── Moderators ───────────────────── */}
      {activeTab === 'moderators' && (
        <div className="tab-enter px-4 md:px-8 py-8 max-w-7xl mx-auto space-y-6">
          <div className="flex items-center gap-3 fade-up">
            <div className="lumina-icon-tile">
              <Shield size={18} className="text-white/70" />
            </div>
            <h2 className="lumina-text text-xl font-bold">Moderator Management</h2>
          </div>

          {/* Generate Code */}
          <div className="lumina-card p-5 space-y-4 fade-up fade-up-delay-1">
            <div className="flex items-center gap-3">
              <div className="lumina-icon-tile !w-9 !h-9">
                <Shield size={15} className="text-white/70" />
              </div>
              <div>
                <h3 className="font-semibold text-white/90">Generate Moderator Invite Code</h3>
                <p className="text-xs text-white/40 mt-0.5">
                  Generate a code for a new content moderator. Codes expire in 48 hours.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={generateModeratorCode}
                disabled={generatingModCode}
                className="lumina-btn text-sm px-4 py-2 flex items-center gap-2 disabled:opacity-50"
              >
                {generatingModCode ? '⏳ Generating...' : '🔑 Generate Code'}
              </button>
              {latestModCode && (
                <div className="flex items-center gap-2">
                  <code className="bg-white/[0.06] px-4 py-2 rounded-lg text-white/90 font-mono text-lg tracking-wider border border-white/15">
                    {latestModCode}
                  </code>
                  <button
                    onClick={() => navigator.clipboard.writeText(latestModCode)}
                    className="text-xs text-white/40 hover:text-white/70 transition-colors"
                  >
                    📋 Copy
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Pending Requests */}
          <div className="lumina-card p-5 space-y-4 fade-up fade-up-delay-2">
            <h3 className="font-semibold text-white/90">Moderator Requests</h3>
            {modRequests.length === 0 ? (
              <p className="text-sm text-white/40">No moderator requests</p>
            ) : (
              <div className="space-y-3">
                {modRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.08]"
                  >
                    <div>
                      <p className="text-sm text-white/90 font-medium">{req.name}</p>
                      <p className="text-xs text-white/40">{req.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {req.status === 'pending' ? (
                        <>
                          <button
                            onClick={() => handleModRequest(req.id, 'approve')}
                            disabled={modActionLoading === req.id}
                            className="lumina-btn text-xs px-3 py-1.5 disabled:opacity-50"
                          >
                            {modActionLoading === req.id ? '…' : '✅ Approve'}
                          </button>
                          <button
                            onClick={() => handleModRequest(req.id, 'deny')}
                            disabled={modActionLoading === req.id}
                            className="text-xs px-3 py-1.5 rounded bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                          >
                            {modActionLoading === req.id ? '…' : '❌ Deny'}
                          </button>
                        </>
                      ) : (
                        <span
                          className={[
                            'text-xs px-2 py-0.5 rounded-full border',
                            req.status === 'approved'
                              ? 'bg-white/[0.06] text-white/70 border-white/15'
                              : 'bg-red-500/10 text-red-400 border-red-500/30',
                          ].join(' ')}
                        >
                          {req.status}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

/* ─────────────────────────────────────────────────────────────
   At-Risk tab — fetches learning profiles, flags students with
   < 40% recent accuracy after 5+ answered questions.
   ───────────────────────────────────────────────────────────── */
function AtRiskTab({ sessionToken }: { sessionToken: string }) {
  const [loading, setLoading] = useState(true);
  const [atRiskStudents, setAtRiskStudents] = useState<any[]>([]);

  useEffect(() => {
    const fetchAtRisk = async () => {
      const { data, error } = await supabase.rpc('get_ministry_dashboard_data', {
        p_session_token: sessionToken,
      });
      if (error || !data || (data as any).error) { setLoading(false); return; }

      const { learningProfiles, profiles, schools } = data as any;

      const atRiskLPs = (learningProfiles || []).filter(
        (lp: any) => (lp.recent_accuracy || 0) < 40 && (lp.total_questions_answered || 0) > 5,
      );

      if (atRiskLPs.length === 0) { setLoading(false); return; }

      const schoolMap = new Map((schools || []).map((s: any) => [s.id, s.name]));
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      const atRisk = atRiskLPs
        .map((lp: any) => {
          const profile = profileMap.get(lp.user_id) as any;
          return {
            ...lp,
            studentName: profile?.full_name || 'Unknown',
            schoolName: schoolMap.get(profile?.school_id) || 'Unknown',
            gradeLevel: profile?.grade_level || 'N/A',
          };
        })
        .sort((a: any, b: any) => (a.recent_accuracy || 0) - (b.recent_accuracy || 0));

      setAtRiskStudents(atRisk);
      setLoading(false);
    };
    fetchAtRisk();
  }, [sessionToken]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LuminaAtom size={48} animate />
      </div>
    );
  }

  return (
    <div className="tab-enter px-4 md:px-8 py-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3 fade-up">
        <div className="lumina-icon-tile">
          <AlertTriangle size={18} className="text-white/70" />
        </div>
        <div>
          <h2 className="lumina-text text-xl font-bold">At-Risk Student Alerts</h2>
          <p className="text-sm text-white/40 mt-0.5">
            Students with less than 40% accuracy after 5+ questions answered. Data sourced from adaptive learning profiles.
          </p>
        </div>
      </div>

      {atRiskStudents.length === 0 ? (
        <div className="lumina-card p-8 text-center fade-up fade-up-delay-1">
          <div className="lumina-icon-tile mx-auto mb-3">
            <Award size={20} className="text-white/70" />
          </div>
          <p className="text-white/50">No at-risk students detected. All students are performing adequately.</p>
        </div>
      ) : (
        <div className="lumina-card overflow-hidden fade-up fade-up-delay-1">
          <Table>
            <TableHeader>
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="text-white/40">Student</TableHead>
                <TableHead className="text-white/40">School</TableHead>
                <TableHead className="text-white/40">Grade</TableHead>
                <TableHead className="text-white/40">Subject</TableHead>
                <TableHead className="text-white/40">Accuracy</TableHead>
                <TableHead className="text-white/40">Questions</TableHead>
                <TableHead className="text-white/40">Level</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {atRiskStudents.map((student, i) => (
                <TableRow key={i} className="border-white/[0.04]">
                  <TableCell className="font-medium text-white/90">{student.studentName}</TableCell>
                  <TableCell className="text-white/60">{student.schoolName}</TableCell>
                  <TableCell className="text-white/60">{student.gradeLevel}</TableCell>
                  <TableCell className="text-white/60">{student.subject}</TableCell>
                  <TableCell>
                    <span className="text-red-400 font-mono">
                      {Math.round(student.recent_accuracy || 0)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-white/60">{student.total_questions_answered}</TableCell>
                  <TableCell>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/10 text-red-400 border border-red-500/25">
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
