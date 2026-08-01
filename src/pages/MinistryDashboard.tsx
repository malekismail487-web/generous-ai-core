import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Shield, LogOut, Building2, Users, GraduationCap, ChartBar as BarChart3, TriangleAlert as AlertTriangle, FileText, TrendingUp, BookOpen, Award, ClipboardList, LayoutDashboard, Radar, Terminal, Activity, Lock } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { DashboardShell, NavItem } from '@/components/DashboardShell';
import { LuminaAtom } from '@/components/LuminaAtom';
import { ControlCenterShell } from '@/components/ministry/control/ControlCenterShell';
import { IntelligenceShell } from '@/components/ministry/intelligence/IntelligenceShell';
import { cn } from '@/lib/utils';

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

/** Zero-pad a number to 3 digits for terminal readouts. */
const pad3 = (n: number) => Math.max(0, Math.round(n)).toString().padStart(3, '0');

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

  // ── Derived terminal readouts ──
  const activeSchoolCount = schoolStats.filter((s) => s.status === 'active').length;
  const alertCount = schoolStats.filter((s) => s.completionRate < 50).length;
  const tickerSchools = [...schoolStats].sort((a, b) => b.completionRate - a.completionRate).slice(0, 8);

  const terminalStats = nationalStats ? [
    { field: 'SCHOOLS', value: pad3(nationalStats.totalSchools), sub: 'registered nodes', icon: Building2 },
    { field: 'STUDENTS', value: nationalStats.totalStudents.toLocaleString(), sub: 'enrolled subjects', icon: GraduationCap },
    { field: 'TEACHERS', value: nationalStats.totalTeachers.toLocaleString(), sub: 'active instructors', icon: Users },
    { field: 'ASSIGNMENTS', value: nationalStats.totalAssignments.toLocaleString(), sub: 'deployed tasks', icon: BookOpen },
    { field: 'SUBMISSIONS', value: nationalStats.totalSubmissions.toLocaleString(), sub: 'packets received', icon: FileText },
    { field: 'COMPLETION', value: `${nationalStats.avgCompletionRate}%`, sub: 'avg compliance', icon: TrendingUp },
    { field: 'MATERIALS', value: nationalStats.totalMaterials.toLocaleString(), sub: 'resource files', icon: BookOpen },
    {
      field: 'RATIO',
      value: nationalStats.totalTeachers > 0
        ? `1:${Math.round(nationalStats.totalStudents / nationalStats.totalTeachers)}`
        : 'N/A',
      sub: 'teacher:student',
      icon: Users,
    },
  ] : [];

  // ── Nav items ──
  const navItems: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 size={18} /> },
    { id: 'schools', label: 'Schools', icon: <Building2 size={18} /> },
    { id: 'compliance', label: 'Compliance', icon: <FileText size={18} /> },
    { id: 'atrisk', label: 'At-Risk', icon: <AlertTriangle size={18} />, badge: alertCount || undefined },
    { id: 'moderators', label: 'Moderators', icon: <Shield size={18} /> },
  ];

  // ── Workspace switch (sidebarBottom) — small icon buttons ──
  const workspaces: { id: Workspace; label: string; icon: typeof LayoutDashboard; hint: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, hint: 'Observe' },
    { id: 'control', label: 'Control', icon: ClipboardList, hint: 'Govern' },
    { id: 'intelligence', label: 'Intel', icon: Radar, hint: 'Analyze' },
  ];

  const sidebarBottom = (
    <div className="flex flex-col items-center gap-1.5 w-full">
      <div className="text-[9px] uppercase tracking-[0.25em] text-white/25 font-mono mb-0.5">WS</div>
      {workspaces.map((ws) => {
        const isActive = workspace === ws.id;
        return (
          <button
            key={ws.id}
            onClick={() => setWorkspace(ws.id)}
            title={`${ws.label} — ${ws.hint}`}
            className={cn('lumina-btn-icon w-9 h-9', isActive && 'active')}
          >
            <ws.icon size={15} className={isActive ? 'text-white' : 'text-white/55'} />
          </button>
        );
      })}
    </div>
  );

  // ── Header right: session timer + logout ──
  const headerRight = (
    <div className="flex items-center gap-2 md:gap-3">
      <div
        className={cn(
          'text-xs font-mono px-3 py-1 rounded-full border tabular-nums flex items-center gap-1.5',
          timeLeft < 120
            ? 'border-red-500/40 text-red-400 bg-red-500/10'
            : 'border-white/15 text-white/60 bg-white/[0.04]',
        )}
      >
        <span className="text-white/30 hidden sm:inline">SESSION</span>
        <span>{formatTime(timeLeft)}</span>
      </div>
      <button onClick={handleLogout} className="lumina-btn-glass text-xs px-3 py-1.5 flex items-center gap-1.5">
        <LogOut size={13} />
        <span className="hidden sm:inline">END</span>
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
        roleAccent="rgba(232,232,232,0.4)"
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
        roleAccent="rgba(232,232,232,0.4)"
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
      roleAccent="rgba(232,232,232,0.4)"
      navItems={navItems}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as TabId)}
      headerRight={headerRight}
      sidebarBottom={sidebarBottom}
    >
      {/* ───────────────────── Overview — Classified Terminal ───────────────────── */}
      {activeTab === 'overview' && (
        <div className="relative tab-enter px-4 md:px-8 py-8 max-w-7xl mx-auto">
          {/* Scanline overlay — classified terminal */}
          <div className="scanline-overlay pointer-events-none absolute inset-0 z-0" />

          {/* Terminal blink + cursor keyframes (scoped to this view) */}
          <style>{`
            @keyframes terminal-blink { 0%,49% { opacity: 1; } 50%,100% { opacity: 0.12; } }
            .terminal-blink { animation: terminal-blink 1.1s steps(1,end) infinite; }
            @keyframes cursor-blink { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
            .terminal-cursor { animation: cursor-blink 1s steps(1,end) infinite; margin-left: 2px; }
          `}</style>

          <div className="relative z-10 space-y-8">
            {/* Classification banner */}
            <div className="lumina-card px-4 py-2.5 fade-up flex items-center justify-between">
              <div className="flex items-center gap-2 font-mono text-[10px] md:text-[11px] tracking-[0.25em] text-white/60">
                <Lock size={12} className="text-amber-400/80" />
                <span>CLASSIFIED</span>
                <span className="text-white/20">//</span>
                <span className="hidden sm:inline">MINISTRY OF EDUCATION</span>
                <span className="text-white/20 hidden sm:inline">//</span>
                <span>EYES ONLY</span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[10px] text-white/40">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/60 animate-ping" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                </span>
                <span className="hidden sm:inline">LINK ACTIVE</span>
              </div>
            </div>

            {/* Terminal hero */}
            <div className="lumina-card p-6 md:p-8 flex flex-col md:flex-row items-center gap-6 fade-up fade-up-delay-1">
              <LuminaAtom size={100} animate glow />
              <div className="flex-1 text-center md:text-left">
                <div className="font-mono text-[11px] tracking-[0.25em] text-white/35 uppercase">
                  &gt; National Intelligence Terminal
                </div>
                <h2 className="lumina-text text-2xl md:text-3xl font-bold font-mono mt-1">
                  EDUCATION_OVERVIEW
                </h2>
                <p className="text-sm text-white/40 mt-1 font-mono">
                  // Live ecosystem telemetry across all registered schools
                </p>
              </div>
              <div className="text-right hidden md:block font-mono">
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/25">UPLINK</div>
                <div className="text-sm text-emerald-400/80 mt-0.5">
                  <span className="terminal-blink">●</span> SECURE
                </div>
              </div>
            </div>

            {!nationalStats ? (
              <div className="flex items-center justify-center py-16">
                <LuminaAtom size={48} animate />
              </div>
            ) : (
              <>
                {/* System readout line */}
                <div className="lumina-card p-4 fade-up fade-up-delay-2">
                  <div className="flex items-center gap-2 text-[11px] text-white/35 mb-2 font-mono uppercase tracking-[0.2em]">
                    <Terminal size={13} /> <span>SYSTEM_READOUT</span>
                  </div>
                  <div className="text-sm md:text-base text-white/85 tracking-wide font-mono break-all">
                    SCHOOLS_ONLINE: <span className="text-emerald-400/90">{pad3(activeSchoolCount)}</span>
                    <span className="text-white/20"> | </span>
                    COMPLIANCE: <span className="text-white/90">{nationalStats.avgCompletionRate}%</span>
                    <span className="text-white/20"> | </span>
                    ALERTS:{' '}
                    <span className={alertCount > 0 ? 'text-red-400' : 'text-white/90'}>
                      {pad3(alertCount)}
                    </span>
                    <span className="terminal-cursor text-emerald-400/80">█</span>
                  </div>
                </div>

                {/* National stats grid — terminal readouts */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {terminalStats.map((stat, i) => (
                    <div key={i} className={`lumina-card p-4 space-y-2 fade-up fade-up-delay-${Math.min(i + 1, 6)}`}>
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/35 font-mono">
                        <stat.icon size={13} /> {stat.field}
                      </div>
                      <div className="text-2xl font-bold text-white/90 font-mono tabular-nums">
                        {stat.value}
                      </div>
                      <div className="text-[10px] text-white/30 font-mono">// {stat.sub}</div>
                    </div>
                  ))}
                </div>

                <div className="lumina-divider" />

                {/* Live compliance ticker */}
                <div className="lumina-card p-5 fade-up fade-up-delay-3">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.2em] uppercase text-white/50">
                      <Activity size={14} /> Compliance Ticker
                    </div>
                    <div className="font-mono text-[10px] text-white/30 flex items-center gap-1.5">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/50 animate-ping" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400/80" />
                      </span>
                      LIVE_FEED
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {tickerSchools.length === 0 && (
                      <div className="font-mono text-xs text-white/30 py-4 text-center">
                        // NO_NODES_ONLINE — awaiting uplink
                      </div>
                    )}
                    {tickerSchools.map((s, i) => {
                      const pct = s.completionRate;
                      const barColor =
                        pct >= 75 ? 'bg-emerald-400/70' : pct >= 50 ? 'bg-amber-400/70' : 'bg-red-400/70';
                      const isActive = s.status === 'active';
                      return (
                        <div key={s.id} className="flex items-center gap-2 md:gap-3 font-mono text-xs">
                          <span className="text-white/30 w-12 shrink-0">SCH_{pad3(i + 1)}</span>
                          <span className="text-white/70 w-32 md:w-52 shrink-0 truncate">{s.name}</span>
                          <span className="flex-1 h-2.5 rounded-sm bg-white/[0.06] overflow-hidden border border-white/10">
                            <span
                              className={cn('block h-full rounded-sm transition-all duration-500', barColor)}
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </span>
                          <span
                            className={cn(
                              'w-14 text-right tabular-nums',
                              pct >= 50 ? 'text-white/85' : 'text-red-400',
                            )}
                          >
                            {pct}%
                          </span>
                          <span className="flex items-center gap-1.5 w-24 shrink-0 justify-end">
                            <span className={cn('relative flex h-2 w-2', isActive && 'terminal-blink')}>
                              {isActive ? (
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                              ) : (
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-400/70" />
                              )}
                            </span>
                            <span className={cn('text-[10px]', isActive ? 'text-emerald-400/80' : 'text-red-400/80')}>
                              {isActive ? 'ONLINE' : 'OFFLINE'}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ───────────────────── Schools — Terminal Registry ───────────────────── */}
      {activeTab === 'schools' && (
        <div className="tab-enter px-4 md:px-8 py-8 max-w-7xl mx-auto space-y-6">
          <div className="flex items-center gap-3 fade-up">
            <div className="lumina-icon-tile">
              <Building2 size={18} className="text-white/70" />
            </div>
            <div>
              <h2 className="lumina-text text-xl font-bold font-mono">SCHOOL_REGISTRY</h2>
              <p className="text-xs text-white/40 mt-0.5 font-mono">// Performance rankings by completion rate</p>
            </div>
          </div>

          <div className="lumina-card overflow-hidden fade-up fade-up-delay-1">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="text-white/40 font-mono text-xs uppercase tracking-wider">Rank</TableHead>
                  <TableHead className="text-white/40 font-mono text-xs uppercase tracking-wider">School</TableHead>
                  <TableHead className="text-white/40 font-mono text-xs uppercase tracking-wider">Students</TableHead>
                  <TableHead className="text-white/40 font-mono text-xs uppercase tracking-wider">Teachers</TableHead>
                  <TableHead className="text-white/40 font-mono text-xs uppercase tracking-wider">Assignments</TableHead>
                  <TableHead className="text-white/40 font-mono text-xs uppercase tracking-wider">Completion</TableHead>
                  <TableHead className="text-white/40 font-mono text-xs uppercase tracking-wider">Accuracy</TableHead>
                  <TableHead className="text-white/40 font-mono text-xs uppercase tracking-wider">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...schoolStats]
                  .sort((a, b) => b.completionRate - a.completionRate)
                  .map((school, i) => {
                    const isActive = school.status === 'active';
                    return (
                      <TableRow key={school.id} className="border-white/[0.04]">
                        <TableCell className="font-mono text-white/70 tabular-nums">
                          {i === 0 ? '01*' : String(i + 1).padStart(2, '0')}
                        </TableCell>
                        <TableCell className="font-mono font-medium text-white/90">{school.name}</TableCell>
                        <TableCell className="font-mono text-white/60 tabular-nums">{school.studentCount}</TableCell>
                        <TableCell className="font-mono text-white/60 tabular-nums">{school.teacherCount}</TableCell>
                        <TableCell className="font-mono text-white/60 tabular-nums">{school.assignmentCount}</TableCell>
                        <TableCell className="font-mono">
                          <span className={school.completionRate >= 50 ? 'text-white/90' : 'text-red-400'}>
                            {school.completionRate}%
                          </span>
                        </TableCell>
                        <TableCell className="font-mono">
                          <span className={school.avgAccuracy >= 60 ? 'text-white/90' : 'text-amber-400'}>
                            {school.avgAccuracy}%
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-2 font-mono text-xs">
                            <span className={cn('relative flex h-2 w-2', isActive && 'terminal-blink')}>
                              {isActive ? (
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                              ) : (
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-400/70" />
                              )}
                            </span>
                            <span className={isActive ? 'text-emerald-400/80' : 'text-red-400/80'}>
                              {school.status}
                            </span>
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                {schoolStats.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-white/40 py-8 font-mono">
                      // NO_SCHOOLS_REGISTERED
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ───────────────────── Compliance — Readiness Matrix ───────────────────── */}
      {activeTab === 'compliance' && (
        <div className="tab-enter px-4 md:px-8 py-8 max-w-7xl mx-auto space-y-6">
          <div className="flex items-center gap-3 fade-up">
            <div className="lumina-icon-tile">
              <FileText size={18} className="text-white/70" />
            </div>
            <div>
              <h2 className="lumina-text text-xl font-bold font-mono">COMPLIANCE_REPORT</h2>
              <p className="text-xs text-white/40 mt-0.5 font-mono">
                // Readiness evaluation per registered node
              </p>
            </div>
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
                      <h3 className="lumina-text font-semibold font-mono">{school.name}</h3>
                      <p className="text-xs text-white/40 mt-0.5 font-mono">
                        {school.studentCount} students · {school.teacherCount} teachers
                      </p>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-bold border font-mono ${scoreClass}`}>
                      {score}/4 COMPLIANT
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {[
                      { label: 'TEACHERS_ASSIGNED', ok: hasTeachers },
                      { label: 'MATERIALS_UPLOADED', ok: hasMaterials },
                      { label: 'ASSIGNMENTS_LIVE', ok: hasAssignments },
                      { label: 'RATIO_LE_25:1', ok: goodRatio },
                    ].map((item, j) => (
                      <div
                        key={j}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 rounded-lg text-xs border font-mono',
                          item.ok
                            ? 'bg-white/[0.04] text-white/70 border-white/10'
                            : 'bg-red-500/10 text-red-400 border-red-500/20',
                        )}
                      >
                        <span className={item.ok ? 'text-emerald-400/80' : 'text-red-400'}>
                          {item.ok ? '[✓]' : '[✗]'}
                        </span>
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {schoolStats.length === 0 && (
              <div className="lumina-card p-8 text-center text-white/40 font-mono">
                // NO_NODES_TO_EVALUATE
              </div>
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
            <div>
              <h2 className="lumina-text text-xl font-bold font-mono">MODERATOR_CONTROL</h2>
              <p className="text-xs text-white/40 mt-0.5 font-mono">// Invite codes &amp; pending access requests</p>
            </div>
          </div>

          {/* Generate Code */}
          <div className="lumina-card p-5 space-y-4 fade-up fade-up-delay-1">
            <div className="flex items-center gap-3">
              <div className="lumina-icon-tile !w-9 !h-9">
                <Shield size={15} className="text-white/70" />
              </div>
              <div>
                <h3 className="lumina-text font-semibold font-mono">GENERATE_INVITE_CODE</h3>
                <p className="text-xs text-white/40 mt-0.5 font-mono">
                  // Generate a code for a new content moderator. Codes expire in 48h.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={generateModeratorCode}
                disabled={generatingModCode}
                className="lumina-btn-glass text-sm px-4 py-2 flex items-center gap-2 font-mono disabled:opacity-50"
              >
                {generatingModCode ? '// GENERATING...' : '> GENERATE CODE'}
              </button>
              {latestModCode && (
                <div className="flex items-center gap-2">
                  <code className="bg-white/[0.06] px-4 py-2 rounded-lg text-white/90 font-mono text-lg tracking-wider border border-white/15">
                    {latestModCode}
                  </code>
                  <button
                    onClick={() => navigator.clipboard.writeText(latestModCode)}
                    className="lumina-btn-glass text-xs px-2.5 py-1.5 font-mono"
                  >
                    COPY
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Pending Requests */}
          <div className="lumina-card p-5 space-y-4 fade-up fade-up-delay-2">
            <h3 className="lumina-text font-semibold font-mono">ACCESS_REQUESTS</h3>
            {modRequests.length === 0 ? (
              <p className="text-sm text-white/40 font-mono">// No pending moderator requests</p>
            ) : (
              <div className="space-y-3">
                {modRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.08]"
                  >
                    <div className="font-mono">
                      <p className="text-sm text-white/90 font-medium">{req.name}</p>
                      <p className="text-xs text-white/40">{req.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {req.status === 'pending' ? (
                        <>
                          <button
                            onClick={() => handleModRequest(req.id, 'approve')}
                            disabled={modActionLoading === req.id}
                            className="lumina-btn-glass text-xs px-3 py-1.5 font-mono disabled:opacity-50"
                          >
                            {modActionLoading === req.id ? '…' : '✓ APPROVE'}
                          </button>
                          <button
                            onClick={() => handleModRequest(req.id, 'deny')}
                            disabled={modActionLoading === req.id}
                            className="lumina-btn-glass text-xs px-3 py-1.5 font-mono text-red-400 hover:bg-red-500/15 disabled:opacity-50"
                          >
                            {modActionLoading === req.id ? '…' : '✗ DENY'}
                          </button>
                        </>
                      ) : (
                        <span
                          className={cn(
                            'text-xs px-2 py-0.5 rounded-full border font-mono',
                            req.status === 'approved'
                              ? 'bg-white/[0.06] text-white/70 border-white/15'
                              : 'bg-red-500/10 text-red-400 border-red-500/30',
                          )}
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
   Terminal aesthetic with monospace data + blinking alert indicators.
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
      <style>{`
        @keyframes alert-blink { 0%,49% { opacity: 1; } 50%,100% { opacity: 0.2; } }
        .alert-blink { animation: alert-blink 1.05s steps(1,end) infinite; }
      `}</style>

      <div className="flex items-center gap-3 fade-up">
        <div className="lumina-icon-tile">
          <AlertTriangle size={18} className="text-white/70" />
        </div>
        <div>
          <h2 className="lumina-text text-xl font-bold font-mono">AT_RISK_ALERTS</h2>
          <p className="text-sm text-white/40 mt-0.5 font-mono">
            // Students with &lt;40% accuracy after 5+ questions. Sourced from adaptive learning profiles.
          </p>
        </div>
      </div>

      {atRiskStudents.length === 0 ? (
        <div className="lumina-card p-8 text-center fade-up fade-up-delay-1">
          <div className="lumina-icon-tile mx-auto mb-3">
            <Award size={20} className="text-white/70" />
          </div>
          <p className="text-white/50 font-mono">// NO_THREATS_DETECTED — all students performing adequately</p>
        </div>
      ) : (
        <div className="lumina-card overflow-hidden fade-up fade-up-delay-1">
          <Table>
            <TableHeader>
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="text-white/40 font-mono text-xs uppercase tracking-wider">Student</TableHead>
                <TableHead className="text-white/40 font-mono text-xs uppercase tracking-wider">School</TableHead>
                <TableHead className="text-white/40 font-mono text-xs uppercase tracking-wider">Grade</TableHead>
                <TableHead className="text-white/40 font-mono text-xs uppercase tracking-wider">Subject</TableHead>
                <TableHead className="text-white/40 font-mono text-xs uppercase tracking-wider">Accuracy</TableHead>
                <TableHead className="text-white/40 font-mono text-xs uppercase tracking-wider">Questions</TableHead>
                <TableHead className="text-white/40 font-mono text-xs uppercase tracking-wider">Level</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {atRiskStudents.map((student, i) => (
                <TableRow key={i} className="border-white/[0.04]">
                  <TableCell className="font-mono font-medium text-white/90">
                    <span className="flex items-center gap-2">
                      <span className="alert-blink text-red-400">●</span>
                      {student.studentName}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-white/60">{student.schoolName}</TableCell>
                  <TableCell className="font-mono text-white/60">{student.gradeLevel}</TableCell>
                  <TableCell className="font-mono text-white/60">{student.subject}</TableCell>
                  <TableCell className="font-mono">
                    <span className="text-red-400 tabular-nums">
                      {Math.round(student.recent_accuracy || 0)}%
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-white/60 tabular-nums">
                    {student.total_questions_answered}
                  </TableCell>
                  <TableCell>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/10 text-red-400 border border-red-500/25 font-mono">
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
