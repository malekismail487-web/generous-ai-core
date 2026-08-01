import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useAuth } from '@/hooks/useAuth';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { tr } from '@/lib/translations';
import { Navigate, Link } from 'react-router-dom';
import { Upload, ClipboardList, FileText, Megaphone, Settings, ChartBar as BarChart3, Bot, Radio, Globe, Users, Clock, Sparkles, X, Check, ChevronRight, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { TeacherMaterials } from '@/components/teacher/TeacherMaterials';
import { TeacherAssignments } from '@/components/teacher/TeacherAssignments';
import { AssignmentPerformanceAnalytics } from '@/components/teacher/AssignmentPerformanceAnalytics';
import { TeacherCopilot } from '@/components/teacher/TeacherCopilot';
import { TeacherLearningStyleReports } from '@/components/teacher/TeacherLearningStyleReports';
import { SubjectsSection } from '@/components/SubjectsSection';
import { TenantExtensionsSection } from '@/components/extensions/TenantExtensionsSection';
import { DashboardShell, NavItem } from '@/components/DashboardShell';
import { LuminaAtom } from '@/components/LuminaAtom';

/* ───────────────────────── Types ───────────────────────── */
interface CourseMaterial {
  id: string; title: string; subject: string;
  content: string | null; file_url: string | null;
  grade_level: string | null; created_at: string;
}
interface Assignment {
  id: string; title: string; description: string | null; subject: string;
  grade_level: string; due_date: string | null; points: number;
  created_at: string; questions_json?: any;
}
interface Submission {
  id: string; assignment_id: string; student_id: string;
  content: string | null; submitted_at: string;
  grade: number | null; feedback: string | null;
}
interface Announcement { id: string; title: string; body: string; created_at: string; }

/* ───────────────────── Timeline item type ───────────────────── */
type TimelineKind = 'submission' | 'announcement' | 'activity';
interface TimelineItem {
  id: string;
  kind: TimelineKind;
  title: string;
  detail: string;
  timestamp: string;
  pending?: boolean;
}

/* ════════════════════════════════════════════════════════════
   TeacherDashboard — Enterprise v2 Split-Pane Redesign
   ════════════════════════════════════════════════════════════ */
export default function TeacherDashboard() {
  const { isTeacher, school, profile, loading } = useRoleGuard();
  const { user } = useAuth();
  const { toast } = useToast();
  const { language, setLanguage } = useThemeLanguage();

  /* ── Data state ── */
  const [courseMaterials, setCourseMaterials] = useState<CourseMaterial[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [categoryLabel, setCategoryLabel] = useState<{ name: string; emoji: string } | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  /* ── Grading state ── */
  const [gradingDialogOpen, setGradingDialogOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [gradeValue, setGradeValue] = useState('');
  const [feedbackValue, setFeedbackValue] = useState('');

  /* ── Floating grading dock state ── */
  const [gradingDockOpen, setGradingDockOpen] = useState(false);

  /* ═══════════════════════ Data fetching ═══════════════════════ */
  const fetchData = useCallback(async () => {
    if (!school || !profile || !user) return;
    setLoadingData(true);
    const authUserId = user.id;

    const { data: materialsData } = await supabase
      .from('course_materials').select('*')
      .eq('uploaded_by', authUserId)
      .order('created_at', { ascending: false });
    setCourseMaterials((materialsData || []) as CourseMaterial[]);

    const { data: assignmentsData } = await supabase
      .from('assignments').select('*')
      .eq('teacher_id', authUserId)
      .order('created_at', { ascending: false });
    setAssignments((assignmentsData || []) as Assignment[]);

    if (assignmentsData && assignmentsData.length > 0) {
      const { data: submissionsData } = await supabase
        .from('submissions').select('*')
        .in('assignment_id', assignmentsData.map(a => a.id));
      setSubmissions((submissionsData || []) as Submission[]);
    } else {
      setSubmissions([]);
    }

    const { data: announcementsData } = await supabase
      .from('announcements').select('*')
      .eq('school_id', school.id)
      .order('created_at', { ascending: false });
    setAnnouncements((announcementsData || []) as Announcement[]);

    setLoadingData(false);
  }, [school, profile, user]);

  useEffect(() => {
    if (isTeacher && school && profile) fetchData();
  }, [isTeacher, school, profile, fetchData]);

  /* ── Category label loading ── */
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: prof } = await supabase
        .from('profiles').select('teacher_category_id')
        .eq('id', user.id).maybeSingle();
      const tid = (prof as { teacher_category_id?: string | null } | null)?.teacher_category_id;
      if (!tid) { if (!cancelled) setCategoryLabel(null); return; }
      const { data: cat } = await supabase
        .from('teacher_categories').select('name,emoji')
        .eq('id', tid).maybeSingle();
      const c = cat as { name?: string; emoji?: string | null } | null;
      if (!cancelled && c?.name) setCategoryLabel({ name: c.name, emoji: c.emoji || '🎓' });
    })();
    return () => { cancelled = true; };
  }, [user]);

  /* ═══════════════════════ Grading flow ═══════════════════════ */
  const gradeSubmission = async () => {
    if (!selectedSubmission || !user) return;
    const { error } = await supabase
      .from('submissions')
      .update({
        grade: parseInt(gradeValue) || null,
        feedback: feedbackValue || null,
        graded_at: new Date().toISOString(),
        graded_by: user.id,
      })
      .eq('id', selectedSubmission.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Error saving grade' });
    } else {
      toast({ title: 'Grade saved!' });
      setGradingDialogOpen(false);
      setSelectedSubmission(null);
      setGradeValue('');
      setFeedbackValue('');
      fetchData();
    }
  };

  const openGradingDialog = (submission: Submission) => {
    setSelectedSubmission(submission);
    setGradingDialogOpen(true);
    setGradingDockOpen(false);
  };

  /* ═══════════════════════ Guards ═══════════════════════ */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <LuminaAtom size={48} animate />
      </div>
    );
  }
  if (!user || !isTeacher || !school || !profile?.is_active) {
    return <Navigate to="/" replace />;
  }

  /* ═══════════════════════ Derived data ═══════════════════════ */
  const pendingGrading = submissions.filter(s => s.grade === null).length;
  const ungraded = submissions.filter(s => s.grade === null);

  /* ── Build the activity-feed timeline ── */
  const timeline: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = [];

    // Submissions (recent first)
    [...submissions]
      .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
      .slice(0, 8)
      .forEach((s) => {
        const assignment = assignments.find(a => a.id === s.assignment_id);
        items.push({
          id: `sub-${s.id}`,
          kind: 'submission',
          title: assignment?.title || 'Submission',
          detail: s.grade === null ? 'Awaiting grade' : `Graded · ${s.grade}`,
          timestamp: s.submitted_at,
          pending: s.grade === null,
        });
      });

    // Announcements
    announcements.slice(0, 4).forEach((a) => {
      items.push({
        id: `ann-${a.id}`,
        kind: 'announcement',
        title: a.title,
        detail: a.body.slice(0, 80) + (a.body.length > 80 ? '…' : ''),
        timestamp: a.created_at,
      });
    });

    // Activity (recently created assignments)
    assignments.slice(0, 3).forEach((a) => {
      items.push({
        id: `act-${a.id}`,
        kind: 'activity',
        title: a.title,
        detail: `Assignment created · ${a.points} pts`,
        timestamp: a.created_at,
      });
    });

    // Sort all by timestamp desc
    return items
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 14);
  }, [submissions, announcements, assignments]);

  /* ═══════════════════════ Nav items ═══════════════════════ */
  const navItems: NavItem[] = [
    { id: 'overview',    icon: <BarChart3 size={18} />,       label: 'Overview' },
    { id: 'materials',   icon: <Upload size={18} />,          label: tr('materials', language) },
    { id: 'assignments', icon: <ClipboardList size={18} />,  label: tr('assign', language) },
    { id: 'analytics',   icon: <BarChart3 size={18} />,       label: 'Analytics' },
    { id: 'lectures',    icon: <Bot size={18} />,             label: 'Lectures' },
    { id: 'grading',     icon: <FileText size={18} />,        label: tr('gradeVerb', language), badge: pendingGrading },
    { id: 'insights',    icon: <Users size={18} />,          label: tr('insights', language) },
    { id: 'news',        icon: <Megaphone size={18} />,       label: tr('news', language) },
    { id: 'settings',    icon: <Settings size={18} />,        label: tr('settings', language) },
  ];

  /* ═══════════════════════ Timeline helpers ═══════════════════════ */
  const timelineIcon = (kind: TimelineKind) => {
    switch (kind) {
      case 'submission':  return <FileText size={14} />;
      case 'announcement': return <Megaphone size={14} />;
      case 'activity':     return <Activity size={14} />;
    }
  };

  const timelineAccent = (kind: TimelineKind, pending?: boolean) => {
    if (pending) return 'text-amber-400';
    switch (kind) {
      case 'submission':  return 'text-sky-400';
      case 'announcement': return 'text-violet-400';
      case 'activity':     return 'text-emerald-400';
    }
  };

  const relativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  };

  /* ═══════════════════════ Floating grading dock ═══════════════════════ */
  const floatingActions = (
    <>
      {/* Quick-access grading panel */}
      {gradingDockOpen && (
        <div className="lumina-card p-5 w-80 max-w-[calc(100vw-3rem)] scale-in">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="lumina-text text-sm font-bold tracking-wide">GRADING QUEUE</h3>
              <p className="text-[11px] text-white/30 font-mono mt-0.5">
                {ungraded.length} ungraded · {submissions.length - ungraded.length} graded
              </p>
            </div>
            <button
              className="lumina-btn-icon w-8 h-8"
              onClick={() => setGradingDockOpen(false)}
              aria-label="Close grading dock"
            >
              <X size={14} />
            </button>
          </div>

          <div className="lumina-divider mb-4" />

          {ungraded.length === 0 ? (
            <div className="py-8 text-center">
              <Check size={28} className="mx-auto mb-3 text-emerald-400/60" />
              <p className="text-sm text-white/50 font-medium">{tr('allCaughtUp', language)}</p>
              <p className="text-xs text-white/25 mt-1">{tr('noSubmissionsWaiting', language)}</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {ungraded.map((s, i) => {
                const assignment = assignments.find(a => a.id === s.assignment_id);
                return (
                  <button
                    key={s.id}
                    onClick={() => openGradingDialog(s)}
                    className="w-full text-left p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/15 hover:bg-white/[0.06] transition-all group fade-up"
                    style={{ animationDelay: `${0.05 + i * 0.04}s` }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="lumina-icon-tile w-8 h-8 flex-shrink-0">
                        <FileText size={12} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white/85 truncate">
                          {assignment?.title || 'Submission'}
                        </p>
                        <p className="text-[11px] text-white/30 font-mono mt-0.5">
                          {relativeTime(s.submitted_at)} ago
                        </p>
                      </div>
                      <ChevronRight size={14} className="text-white/20 group-hover:text-white/50 mt-2 transition-colors" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {ungraded.length > 0 && (
            <>
              <div className="lumina-divider my-4" />
              <button
                className="lumina-btn-primary w-full py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
                onClick={() => { setActiveTab('grading'); setGradingDockOpen(false); }}
              >
                Open full grading view <ChevronRight size={14} />
              </button>
            </>
          )}
        </div>
      )}

      {/* Circular FAB */}
      <button
        onClick={() => setGradingDockOpen(o => !o)}
        className="relative w-14 h-14 rounded-full lumina-btn-primary flex items-center justify-center shadow-[0_0_30px_-4px_rgba(232,232,232,0.4)] hover:scale-105 active:scale-95 transition-transform"
        aria-label="Grading quick access"
      >
        <FileText size={22} />
        {pendingGrading > 0 && (
          <span className="absolute -top-1 -right-1 text-[10px] font-bold bg-amber-500 text-black rounded-full px-1.5 min-w-[20px] h-5 flex items-center justify-center font-mono">
            {pendingGrading}
          </span>
        )}
        {gradingDockOpen && (
          <span className="absolute inset-0 rounded-full border border-white/30 animate-ping" />
        )}
      </button>
    </>
  );

  /* ═══════════════════════ Sidebar bottom (language toggle) ═══════════════════════ */
  const sidebarBottom = (
    <button
      onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
      className="lumina-nav-pill"
      aria-label="Toggle language"
    >
      <Globe size={18} />
    </button>
  );

  /* ═══════════════════════ RENDER ═══════════════════════ */
  return (
    <DashboardShell
      role="Teacher"
      name={categoryLabel ? `${categoryLabel.emoji} ${categoryLabel.name}` : profile.full_name}
      org={school.name}
      navItems={navItems}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      headerRight={
        <>
          <TeacherCopilot schoolId={school.id} authUserId={user.id} onSuccess={fetchData} />
          <Button asChild size="sm" className="lumina-btn-glass gap-2">
            <Link to="/teacher/live"><Radio size={14} className="text-red-400" /> Live</Link>
          </Button>
        </>
      }
      floatingActions={floatingActions}
      sidebarBottom={sidebarBottom}
    >
      {/* ═══════════════════════ SPLIT-PANE LAYOUT ═══════════════════════ */}
      <div className="flex h-full">
        {/* ──────────────────────────────────────────────
           LEFT PANEL — Activity Feed Timeline (40%)
           ────────────────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col w-[40%] max-w-[440px] border-r border-white/[0.06] flex-shrink-0">
          <div className="p-6 pb-4 flex-shrink-0">
            <div className="flex items-center gap-3 mb-1">
              <div className="lumina-icon-tile w-9 h-9">
                <Activity size={16} />
              </div>
              <div>
                <h2 className="lumina-text text-lg font-bold tracking-tight">Activity Feed</h2>
                <p className="text-[11px] text-white/30 font-mono">REAL-TIME · LIVE</p>
              </div>
            </div>
          </div>

          <div className="lumina-divider mx-6" />

          {/* Timeline scroll area */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {loadingData ? (
              <div className="flex items-center justify-center py-20">
                <LuminaAtom size={48} animate />
              </div>
            ) : timeline.length === 0 ? (
              <div className="py-20 text-center">
                <Sparkles size={28} className="mx-auto mb-3 text-white/15" />
                <p className="text-sm text-white/40 font-medium">No recent activity</p>
                <p className="text-xs text-white/20 mt-1">Submissions and announcements will appear here</p>
              </div>
            ) : (
              <div className="relative">
                {/* Vertical timeline rail */}
                <div className="absolute left-[15px] top-2 bottom-2 w-px bg-gradient-to-b from-white/20 via-white/[0.08] to-transparent" />

                <div className="space-y-5">
                  {timeline.map((item, i) => (
                    <div
                      key={item.id}
                      className="relative pl-12 fade-up"
                      style={{ animationDelay: `${0.05 + i * 0.06}s` }}
                    >
                      {/* Animated dot */}
                      <div className="absolute left-0 top-1">
                        <div className={`relative w-8 h-8 rounded-full lumina-icon-tile ${item.pending ? 'ring-2 ring-amber-400/30' : ''}`}>
                          <span className={timelineAccent(item.kind, item.pending)}>
                            {timelineIcon(item.kind)}
                          </span>
                          {item.pending && (
                            <span className="absolute inset-0 rounded-full bg-amber-400/20 animate-ping" />
                          )}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="lumina-card p-4">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <h4 className="text-sm font-semibold text-white/85 leading-tight line-clamp-1">
                            {item.title}
                          </h4>
                          <span className="text-[10px] text-white/30 font-mono whitespace-nowrap flex-shrink-0">
                            {relativeTime(item.timestamp)}
                          </span>
                        </div>
                        <p className="text-xs text-white/40 leading-relaxed line-clamp-2">
                          {item.detail}
                        </p>
                        <div className="flex items-center gap-2 mt-2.5">
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${timelineAccent(item.kind, item.pending)}`}>
                            {item.kind}
                          </span>
                          {item.pending && (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400/80 flex items-center gap-1">
                              <Clock size={9} /> pending
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer summary */}
          <div className="p-6 pt-4 flex-shrink-0">
            <div className="lumina-divider mb-4" />
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-2xl font-extrabold font-mono text-white">{submissions.length}</p>
                <p className="text-[10px] text-white/30 uppercase tracking-wider mt-1">Subs</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-extrabold font-mono text-amber-400">{pendingGrading}</p>
                <p className="text-[10px] text-white/30 uppercase tracking-wider mt-1">Pending</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-extrabold font-mono text-white">{announcements.length}</p>
                <p className="text-[10px] text-white/30 uppercase tracking-wider mt-1">Posts</p>
              </div>
            </div>
          </div>
        </aside>

        {/* ──────────────────────────────────────────────
           RIGHT PANEL — Main Content (60%)
           ────────────────────────────────────────────── */}
        <section className="flex-1 min-w-0 overflow-y-auto">
          <div className="p-4 md:p-8 max-w-5xl mx-auto">

            {/* ═════════════ OVERVIEW ═════════════ */}
            {activeTab === 'overview' && (
              <div className="space-y-6 tab-enter">
                {/* Hero with LuminaAtom behind glass */}
                <div className="lumina-card p-8 fade-up relative overflow-hidden min-h-[220px]">
                  <div className="absolute top-1/2 right-8 -translate-y-1/2 opacity-40 pointer-events-none">
                    <LuminaAtom size={160} animate glow />
                  </div>
                  <div className="relative z-10 max-w-lg">
                    <div className="text-[11px] font-semibold tracking-[0.25em] uppercase text-white/30 mb-2">
                      {tr('teacherDashboard', language)}
                    </div>
                    <h1 className="text-3xl md:text-4xl font-extrabold lumina-text mb-3">
                      {profile.full_name}
                    </h1>
                    <p className="text-white/40 text-sm mb-6 font-mono">{school.name}</p>
                    {pendingGrading > 0 && (
                      <div className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 text-sm fade-up fade-up-delay-1">
                        <Clock size={16} />
                        <span className="font-mono">{pendingGrading}</span>
                        <span>submissions waiting for grading</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Stat cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: tr('courseMaterials', language), value: courseMaterials.length, icon: <Upload size={20} />, delay: 'fade-up-delay-1' },
                    { label: tr('assignments', language),     value: assignments.length,      icon: <ClipboardList size={20} />, delay: 'fade-up-delay-2' },
                    { label: tr('pendingGrading', language),  value: pendingGrading,          icon: <FileText size={20} />, delay: 'fade-up-delay-3', accent: 'text-amber-400' },
                    { label: tr('announcementsLabel', language), value: announcements.length, icon: <Megaphone size={20} />, delay: 'fade-up-delay-4' },
                  ].map((stat) => (
                    <div key={stat.label} className={`lumina-card p-5 space-y-3 fade-up ${stat.delay}`}>
                      <div className="lumina-icon-tile w-10 h-10">{stat.icon}</div>
                      <p className={`text-4xl font-extrabold font-mono ${stat.accent || 'text-white'}`}>
                        {stat.value}
                      </p>
                      <p className="text-xs text-white/35 font-medium">{stat.label}</p>
                    </div>
                  ))}
                </div>

                <div className="lumina-divider" />

                {/* Tenant extensions */}
                <div className="fade-up fade-up-delay-2">
                  <TenantExtensionsSection />
                </div>
              </div>
            )}

            {/* ═════════════ MATERIALS ═════════════ */}
            {activeTab === 'materials' && (
              <div className="space-y-6 tab-enter">
                <div className="flex items-center gap-3 fade-up">
                  <div className="lumina-icon-tile w-10 h-10"><Upload size={18} /></div>
                  <div>
                    <h2 className="text-2xl font-bold lumina-text">{tr('materials', language)}</h2>
                    <p className="text-xs text-white/30 font-mono mt-0.5">{courseMaterials.length} items</p>
                  </div>
                </div>
                <div className="lumina-divider" />
                {loadingData ? (
                  <div className="flex items-center justify-center py-16"><LuminaAtom size={48} animate /></div>
                ) : (
                  <div className="fade-up fade-up-delay-1">
                    <TeacherMaterials
                      materials={courseMaterials}
                      schoolId={school.id}
                      authUserId={user.id}
                      onRefresh={fetchData}
                    />
                  </div>
                )}
              </div>
            )}

            {/* ═════════════ ASSIGNMENTS ═════════════ */}
            {activeTab === 'assignments' && (
              <div className="space-y-6 tab-enter">
                <div className="flex items-center gap-3 fade-up">
                  <div className="lumina-icon-tile w-10 h-10"><ClipboardList size={18} /></div>
                  <div>
                    <h2 className="text-2xl font-bold lumina-text">{tr('assign', language)}</h2>
                    <p className="text-xs text-white/30 font-mono mt-0.5">{assignments.length} assignments</p>
                  </div>
                </div>
                <div className="lumina-divider" />
                {loadingData ? (
                  <div className="flex items-center justify-center py-16"><LuminaAtom size={48} animate /></div>
                ) : (
                  <div className="fade-up fade-up-delay-1">
                    <TeacherAssignments
                      assignments={assignments}
                      submissions={submissions}
                      schoolId={school.id}
                      authUserId={user.id}
                      onRefresh={fetchData}
                    />
                  </div>
                )}
              </div>
            )}

            {/* ═════════════ ANALYTICS ═════════════ */}
            {activeTab === 'analytics' && (
              <div className="space-y-6 tab-enter">
                <div className="flex items-center gap-3 fade-up">
                  <div className="lumina-icon-tile w-10 h-10"><BarChart3 size={18} /></div>
                  <div>
                    <h2 className="text-2xl font-bold lumina-text">Analytics</h2>
                    <p className="text-xs text-white/30 font-mono mt-0.5">Performance insights</p>
                  </div>
                </div>
                <div className="lumina-divider" />
                <div className="fade-up fade-up-delay-1">
                  <AssignmentPerformanceAnalytics schoolId={school.id} teacherId={user.id} />
                </div>
              </div>
            )}

            {/* ═════════════ LECTURES ═════════════ */}
            {activeTab === 'lectures' && (
              <div className="space-y-6 tab-enter">
                <div className="flex items-center gap-3 fade-up">
                  <div className="lumina-icon-tile w-10 h-10"><Bot size={18} /></div>
                  <div>
                    <h2 className="text-2xl font-bold lumina-text">AI Lectures</h2>
                    <p className="text-xs text-white/30 font-mono mt-0.5">Subject library</p>
                  </div>
                </div>
                <div className="lumina-divider" />
                <div className="fade-up fade-up-delay-1">
                  <SubjectsSection embedded />
                </div>
              </div>
            )}

            {/* ═════════════ GRADING ═════════════ */}
            {activeTab === 'grading' && (
              <div className="space-y-6 tab-enter">
                <div className="flex items-center gap-3 fade-up">
                  <div className="lumina-icon-tile w-10 h-10"><FileText size={18} /></div>
                  <div>
                    <h2 className="text-2xl font-bold lumina-text">{tr('gradeSubmissions', language)}</h2>
                    <p className="text-xs text-white/30 font-mono mt-0.5">
                      {ungraded.length} ungraded / {submissions.length} total
                    </p>
                  </div>
                </div>
                <div className="lumina-divider" />

                {ungraded.length === 0 ? (
                  <div className="lumina-card p-12 text-center fade-up fade-up-delay-1">
                    <div className="lumina-icon-tile w-16 h-16 mx-auto mb-4">
                      <Check size={28} />
                    </div>
                    <h3 className="font-semibold text-white/50 mb-2 lumina-text">
                      {tr('allCaughtUp', language)}
                    </h3>
                    <p className="text-sm text-white/25">{tr('noSubmissionsWaiting', language)}</p>
                  </div>
                ) : (
                  <div className="lumina-card overflow-hidden fade-up fade-up-delay-1">
                    <table className="w-full">
                      <thead className="bg-white/[0.03]">
                        <tr>
                          <th className="text-left p-4 text-xs font-semibold text-white/35 uppercase tracking-wider">
                            {tr('assignment', language)}
                          </th>
                          <th className="text-left p-4 text-xs font-semibold text-white/35 uppercase tracking-wider">
                            {tr('studentLabel', language)}
                          </th>
                          <th className="text-left p-4 text-xs font-semibold text-white/35 uppercase tracking-wider">
                            {tr('submittedAt', language)}
                          </th>
                          <th className="text-right p-4 text-xs font-semibold text-white/35 uppercase tracking-wider">
                            {tr('action', language)}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {ungraded.map((submission, i) => {
                          const assignment = assignments.find(a => a.id === submission.assignment_id);
                          return (
                            <tr
                              key={submission.id}
                              className="border-t border-white/[0.05] hover:bg-white/[0.02] transition-colors fade-up"
                              style={{ animationDelay: `${0.1 + i * 0.05}s` }}
                            >
                              <td className="p-4 font-medium text-white/90">{assignment?.title || 'Unknown'}</td>
                              <td className="p-4 text-white/40 text-sm">Student</td>
                              <td className="p-4 text-white/40 text-sm font-mono">
                                {new Date(submission.submitted_at).toLocaleDateString()}
                              </td>
                              <td className="p-4 text-right">
                                <button
                                  className="lumina-btn-primary px-4 py-2 text-sm font-semibold"
                                  onClick={() => openGradingDialog(submission)}
                                >
                                  Grade
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ═════════════ INSIGHTS ═════════════ */}
            {activeTab === 'insights' && (
              <div className="space-y-6 tab-enter">
                <div className="flex items-center gap-3 fade-up">
                  <div className="lumina-icon-tile w-10 h-10"><Users size={18} /></div>
                  <div>
                    <h2 className="text-2xl font-bold lumina-text">{tr('insights', language)}</h2>
                    <p className="text-xs text-white/30 font-mono mt-0.5">Learning style reports</p>
                  </div>
                </div>
                <div className="lumina-divider" />
                <div className="fade-up fade-up-delay-1">
                  <TeacherLearningStyleReports schoolId={school.id} />
                </div>
              </div>
            )}

            {/* ═════════════ NEWS / ANNOUNCEMENTS ═════════════ */}
            {activeTab === 'news' && (
              <div className="space-y-6 tab-enter">
                <div className="flex items-center gap-3 fade-up">
                  <div className="lumina-icon-tile w-10 h-10"><Megaphone size={18} /></div>
                  <div>
                    <h2 className="text-2xl font-bold lumina-text">{tr('schoolAnnouncements', language)}</h2>
                    <p className="text-xs text-white/30 font-mono mt-0.5">{announcements.length} posts</p>
                  </div>
                </div>
                <div className="lumina-divider" />

                {announcements.length === 0 ? (
                  <div className="lumina-card p-12 text-center fade-up fade-up-delay-1">
                    <div className="lumina-icon-tile w-16 h-16 mx-auto mb-4">
                      <Megaphone size={28} />
                    </div>
                    <h3 className="font-semibold text-white/50 mb-2 lumina-text">
                      {tr('noAnnouncements', language)}
                    </h3>
                    <p className="text-sm text-white/25">{tr('announcementsWillAppear', language)}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {announcements.map((ann, i) => (
                      <div
                        key={ann.id}
                        className="lumina-card p-5 fade-up"
                        style={{ animationDelay: `${0.1 + i * 0.08}s` }}
                      >
                        <div className="flex items-start gap-3">
                          <div className="lumina-icon-tile w-10 h-10 flex-shrink-0">
                            <Megaphone size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-white/90 mb-1 lumina-text">{ann.title}</h3>
                            <p className="text-xs text-white/30 mb-3 font-mono">
                              {new Date(ann.created_at).toLocaleString()}
                            </p>
                            <p className="text-white/50 text-sm whitespace-pre-wrap">{ann.body}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ═════════════ SETTINGS ═════════════ */}
            {activeTab === 'settings' && (
              <div className="space-y-6 tab-enter">
                <div className="flex items-center gap-3 fade-up">
                  <div className="lumina-icon-tile w-10 h-10"><Settings size={18} /></div>
                  <div>
                    <h2 className="text-2xl font-bold lumina-text">{tr('settings', language)}</h2>
                    <p className="text-xs text-white/30 font-mono mt-0.5">Preferences</p>
                  </div>
                </div>
                <div className="lumina-divider" />

                <div className="lumina-card p-6 space-y-6 max-w-lg fade-up fade-up-delay-1">
                  <div>
                    <h3 className="font-semibold text-white/70 mb-3 flex items-center gap-2 lumina-text">
                      <Globe size={16} className="text-white/40" />
                      {language === 'ar' ? 'اللغة' : 'Language'}
                    </h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setLanguage('en')}
                        className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all border ${
                          language === 'en'
                            ? 'lumina-btn-primary'
                            : 'bg-white/[0.03] text-white/40 border-white/10 hover:border-white/20'
                        }`}
                      >
                        English
                      </button>
                      <button
                        onClick={() => setLanguage('ar')}
                        className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all border ${
                          language === 'ar'
                            ? 'lumina-btn-primary'
                            : 'bg-white/[0.03] text-white/40 border-white/10 hover:border-white/20'
                        }`}
                      >
                        العربية
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </section>
      </div>

      {/* ═════════════ Grading Dialog ═════════════ */}
      {gradingDialogOpen && selectedSubmission && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="lumina-card p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto scale-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold lumina-text">{tr('gradeSubmission', language)}</h2>
              <button
                className="lumina-btn-icon w-8 h-8"
                onClick={() => {
                  setGradingDialogOpen(false);
                  setSelectedSubmission(null);
                  setGradeValue('');
                  setFeedbackValue('');
                }}
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>

            <div className="lumina-divider mb-4" />

            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-white/70 mb-2 text-sm">
                  {tr('studentAnswer', language)}
                </h4>
                <div className="p-4 rounded-lg bg-white/[0.03] border border-white/[0.06] whitespace-pre-wrap text-sm text-white/60 max-h-40 overflow-y-auto">
                  {selectedSubmission.content || tr('noContentSubmitted', language)}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-white/70">{tr('grade', language)}</label>
                <input
                  type="number"
                  value={gradeValue}
                  onChange={(e) => setGradeValue(e.target.value)}
                  placeholder={tr('enterGrade', language)}
                  className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white/90 focus:border-white/30 outline-none transition-colors font-mono"
                  min="0"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-white/70">{tr('feedback', language)}</label>
                <textarea
                  value={feedbackValue}
                  onChange={(e) => setFeedbackValue(e.target.value)}
                  placeholder={tr('enterFeedback', language)}
                  className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white/90 focus:border-white/30 outline-none transition-colors"
                  rows={4}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  className="lumina-btn-glass flex-1 py-2.5 text-sm font-semibold"
                  onClick={() => {
                    setGradingDialogOpen(false);
                    setSelectedSubmission(null);
                    setGradeValue('');
                    setFeedbackValue('');
                  }}
                >
                  {tr('cancel', language)}
                </button>
                <button
                  className="lumina-btn-primary flex-1 py-2.5 text-sm font-semibold"
                  onClick={gradeSubmission}
                >
                  {tr('saveGrade', language)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
