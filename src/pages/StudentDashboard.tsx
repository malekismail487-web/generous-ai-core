import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { tr, getGradeName } from '@/lib/translations';
import { Navigate } from 'react-router-dom';
import { BookOpen, FileText, Megaphone, Clock, CircleAlert as AlertCircle, Star, Settings, Bell, Brain, TrendingUp, Award, Flame, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { StudentAssignments } from '@/components/student/StudentAssignments';
import { StudentReportCards } from '@/components/student/StudentReportCards';
import { CalibrationCurve } from '@/components/student/CalibrationCurve';
import { DecayDashboardCard } from '@/components/student/DecayDashboardCard';
import { TenantExtensionsSection } from '@/components/extensions/TenantExtensionsSection';
import { LearningModesHub } from '@/components/student/learning-modes/LearningModesHub';
import { MasteryMap } from '@/components/student/MasteryMap';
import { DashboardShell, NavItem } from '@/components/DashboardShell';
import { LuminaAtom } from '@/components/LuminaAtom';

interface CourseMaterial { id: string; title: string; subject: string; content: string | null; file_url: string | null; grade_level: string | null; created_at: string; uploaded_by: string; }
interface TeacherProfile { id: string; full_name: string; }
interface Assignment { id: string; title: string; description: string | null; subject: string; subject_id: string | null; grade_level: string; due_date: string | null; points: number; created_at: string; }
interface Submission { id: string; assignment_id: string; content: string | null; submitted_at: string; grade: number | null; feedback: string | null; }
interface Announcement { id: string; title: string; body: string; created_at: string; }
interface Award { id: string; type: string; title: string; description: string | null; created_at: string; }

export default function StudentDashboard() {
  const { isStudent, school, profile, loading } = useRoleGuard();
  const { language } = useThemeLanguage();
  const tl = (key: Parameters<typeof tr>[0]) => tr(key, language);

  const [materials, setMaterials] = useState<CourseMaterial[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [awards, setAwards] = useState<Award[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  const fetchData = useCallback(async () => {
    if (!school || !profile) return;
    setLoadingData(true);
    const { data: materialsData } = await supabase.from('course_materials').select('*').eq('school_id', school.id).order('created_at', { ascending: false });
    let filteredMaterials = (materialsData || []) as CourseMaterial[];
    if (profile.grade_level) filteredMaterials = filteredMaterials.filter(m => !m.grade_level || m.grade_level === 'All' || m.grade_level === profile.grade_level);
    setMaterials(filteredMaterials);

    const { data: assignmentsData } = await supabase.from('assignments').select('*').eq('school_id', school.id).order('due_date', { ascending: true });
    let filteredAssignments = (assignmentsData || []) as Assignment[];
    if (profile.grade_level) filteredAssignments = filteredAssignments.filter(a => !a.grade_level || a.grade_level === 'All' || a.grade_level === profile.grade_level);
    setAssignments(filteredAssignments);

    const { data: submissionsData } = await supabase.from('submissions').select('*').eq('student_id', profile.id);
    setSubmissions((submissionsData || []) as Submission[]);

    const { data: announcementsData } = await supabase.from('announcements').select('*').eq('school_id', school.id).order('created_at', { ascending: false });
    setAnnouncements((announcementsData || []) as Announcement[]);

    const { data: awardsData } = await supabase.from('awards').select('*').eq('student_id', profile.id).order('created_at', { ascending: false });
    setAwards((awardsData || []) as Award[]);
    setLoadingData(false);
  }, [school, profile]);

  useEffect(() => { if (isStudent && school && profile) fetchData(); }, [isStudent, school, profile, fetchData]);

  const getOverdue = () => assignments.filter(a => { if (!a.due_date) return false; const d = new Date(a.due_date); const s = submissions.find(s => s.assignment_id === a.id); return d < new Date() && !s; });

  if (loading) return <div className="flex items-center justify-center h-screen bg-black"><LuminaAtom size={64} animate glow /></div>;
  if (!isStudent || !school || !profile?.is_active) return <Navigate to="/" replace />;

  const overdue = getOverdue();
  const gradedCount = submissions.filter(s => s.grade !== null).length;

  const navItems: NavItem[] = [
    { id: 'overview',    icon: <TrendingUp size={18} />, label: 'Overview' },
    { id: 'assignments', icon: <FileText size={18} />,   label: tl('work'), badge: overdue.length },
    { id: 'modes',       icon: <Brain size={18} />,      label: 'AI Modes' },
    { id: 'reports',     icon: <BookOpen size={18} />,   label: tl('reports') },
    { id: 'grades',      icon: <Star size={18} />,       label: tl('grades') },
    { id: 'news',        icon: <Megaphone size={18} />,  label: tl('news') },
    { id: 'settings',    icon: <Settings size={18} />,   label: tl('settings') },
  ];

  return (
    <DashboardShell
      role="Student"
      name={profile.full_name}
      org={school.name}
      navItems={navItems}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      headerRight={profile.grade_level ? <Badge variant="outline" className="border-white/20 text-white/60">{getGradeName(profile.grade_level, language)}</Badge> : undefined}
    >
      <div className="p-4 md:p-8 max-w-6xl mx-auto">
        {/* ───────────────────── OVERVIEW ───────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-6 tab-enter">
            {/* Hero banner with atom */}
            <div className="lumina-card p-8 fade-up relative overflow-hidden">
              <div className="absolute top-0 right-0 opacity-30 pointer-events-none">
                <LuminaAtom size={180} animate glow />
              </div>
              <div className="relative z-10 max-w-lg">
                <div className="text-[11px] font-semibold tracking-[0.25em] uppercase text-white/30 mb-2">{tl('welcome')}</div>
                <h1 className="text-3xl md:text-4xl font-extrabold lumina-text mb-3">{profile.full_name}</h1>
                <p className="text-white/40 text-sm mb-6">{tl('yourDashboard')} — {school.name}</p>
                {overdue.length > 0 && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-sm fade-up fade-up-delay-1">
                    <AlertCircle size={16} />
                    <span>{tl('youHave')} {overdue.length} {overdue.length > 1 ? tl('overdueWarningPlural') : tl('overdueWarning')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Stat grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: tl('materials'), value: materials.length, icon: <BookOpen size={20} />, delay: 'fade-up-delay-1' },
                { label: tl('submitted'), value: submissions.length, icon: <FileText size={20} />, delay: 'fade-up-delay-2' },
                { label: tl('grades'), value: gradedCount, icon: <Star size={20} />, delay: 'fade-up-delay-3' },
                { label: tl('myAwards'), value: awards.length, icon: <Award size={20} />, delay: 'fade-up-delay-4' },
              ].map((stat) => (
                <div key={stat.label} className={`lumina-stat p-5 space-y-3 fade-up ${stat.delay}`}>
                  <div className="lumina-icon-tile w-10 h-10">{stat.icon}</div>
                  <p className="text-4xl font-extrabold text-white count-up">{stat.value}</p>
                  <p className="text-xs text-white/35 font-medium">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Calibration + Decay */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 fade-up fade-up-delay-5">
              <CalibrationCurve userId={profile.id} />
              <DecayDashboardCard userId={profile.id} />
            </div>

            <TenantExtensionsSection />
          </div>
        )}

        {/* ───────────────────── ASSIGNMENTS ───────────────────── */}
        {activeTab === 'assignments' && (
          <div className="space-y-6 tab-enter">
            <div className="fade-up">
              <h2 className="text-2xl font-bold lumina-text mb-1">{tl('work')}</h2>
              <p className="text-white/35 text-sm">{assignments.length} assignments • {submissions.length} submitted • {overdue.length} overdue</p>
            </div>
            {loadingData ? (
              <div className="flex items-center justify-center py-16"><LuminaAtom size={48} animate /></div>
            ) : (
              <div className="fade-up fade-up-delay-1">
                <StudentAssignments assignments={assignments} submissions={submissions} profileId={profile.id} onRefresh={fetchData} />
              </div>
            )}
          </div>
        )}

        {/* ───────────────────── LEARNING MODES ───────────────────── */}
        {activeTab === 'modes' && (
          <div className="space-y-6 tab-enter">
            <div className="fade-up">
              <h2 className="text-2xl font-bold lumina-text mb-1">AI Learning Modes</h2>
              <p className="text-white/35 text-sm">Choose how you want to learn today</p>
            </div>
            <div className="fade-up fade-up-delay-1"><MasteryMap /></div>
            <div className="fade-up fade-up-delay-2"><LearningModesHub /></div>
          </div>
        )}

        {/* ───────────────────── REPORT CARDS ───────────────────── */}
        {activeTab === 'reports' && (
          <div className="space-y-6 tab-enter">
            <div className="fade-up">
              <h2 className="text-2xl font-bold lumina-text mb-1">{tl('reports')}</h2>
            </div>
            {loadingData ? (
              <div className="flex items-center justify-center py-16"><LuminaAtom size={48} animate /></div>
            ) : (
              <div className="fade-up fade-up-delay-1"><StudentReportCards studentId={profile.id} /></div>
            )}
          </div>
        )}

        {/* ───────────────────── GRADES ───────────────────── */}
        {activeTab === 'grades' && (
          <div className="space-y-6 tab-enter">
            <div className="fade-up">
              <h2 className="text-2xl font-bold lumina-text mb-1">{tl('myGrades')}</h2>
            </div>
            <div className="lumina-card overflow-hidden fade-up fade-up-delay-1">
              <table className="w-full">
                <thead className="bg-white/[0.03]">
                  <tr>
                    <th className="text-left p-4 text-xs font-semibold text-white/35 uppercase tracking-wider">{tl('assignment')}</th>
                    <th className="text-left p-4 text-xs font-semibold text-white/35 uppercase tracking-wider">{tl('submitted')}</th>
                    <th className="text-left p-4 text-xs font-semibold text-white/35 uppercase tracking-wider">{tl('grade')}</th>
                    <th className="text-left p-4 text-xs font-semibold text-white/35 uppercase tracking-wider">{tl('feedback')}</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.filter(s => s.grade !== null).length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-12 text-white/30">{tl('noGradesYet')}</td></tr>
                  ) : (
                    submissions.filter(s => s.grade !== null).map((submission, i) => {
                      const assignment = assignments.find(a => a.id === submission.assignment_id);
                      return (
                        <tr key={submission.id} className="border-t border-white/[0.05] hover:bg-white/[0.02] transition-colors fade-up" style={{ animationDelay: `${0.1 + i * 0.05}s` }}>
                          <td className="p-4 font-medium text-white/90">{assignment?.title || 'Unknown'}</td>
                          <td className="p-4 text-white/40 text-sm">{new Date(submission.submitted_at).toLocaleDateString()}</td>
                          <td className="p-4"><Badge className="bg-white/10 text-white/80 border border-white/15">{submission.grade}/{assignment?.points || 100}</Badge></td>
                          <td className="p-4 text-white/40 text-sm max-w-xs truncate">{submission.feedback || '—'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {awards.length > 0 && (
              <div className="fade-up fade-up-delay-2">
                <h3 className="text-lg font-semibold lumina-text mb-4">{tl('myAwards')}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {awards.map((award, i) => (
                    <div key={award.id} className="lumina-card p-5 text-center cosmic-float fade-up" style={{ animationDelay: `${0.1 + i * 0.08}s` }}>
                      <div className="lumina-icon-tile mx-auto mb-3 w-12 h-12"><Star size={22} /></div>
                      <h4 className="font-semibold text-sm text-white/85">{award.title}</h4>
                      <p className="text-xs text-white/30 capitalize mt-1">{award.type}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ───────────────────── ANNOUNCEMENTS ───────────────────── */}
        {activeTab === 'news' && (
          <div className="space-y-6 tab-enter">
            <div className="fade-up">
              <h2 className="text-2xl font-bold lumina-text mb-1">{tl('announcementsLabel')}</h2>
            </div>
            {announcements.length === 0 ? (
              <div className="lumina-card p-12 text-center fade-up fade-up-delay-1">
                <Megaphone size={32} className="mx-auto mb-4 text-white/15" />
                <h3 className="font-semibold text-white/50 mb-2">{tl('noAnnouncements')}</h3>
                <p className="text-sm text-white/25">{tl('schoolAnnouncementsWillAppear')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {announcements.map((ann, i) => (
                  <div key={ann.id} className="lumina-card p-5 fade-up" style={{ animationDelay: `${0.1 + i * 0.08}s` }}>
                    <div className="flex items-start gap-3">
                      <div className="lumina-icon-tile w-10 h-10 flex-shrink-0"><Megaphone size={16} /></div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white/90 mb-1">{ann.title}</h3>
                        <p className="text-xs text-white/30 mb-3">{new Date(ann.created_at).toLocaleString()}</p>
                        <p className="text-white/50 text-sm whitespace-pre-wrap">{ann.body}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ───────────────────── SETTINGS ───────────────────── */}
        {activeTab === 'settings' && (
          <div className="space-y-6 tab-enter">
            <div className="fade-up">
              <h2 className="text-2xl font-bold lumina-text mb-1">{tl('settings')}</h2>
            </div>
            <div className="lumina-card p-6 space-y-6 max-w-lg fade-up fade-up-delay-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="lumina-icon-tile w-10 h-10"><Bell size={16} /></div>
                  <div>
                    <p className="font-medium text-white/85">{tl('notifications')}</p>
                    <p className="text-sm text-white/30">{tl('notificationsDesc')}</p>
                  </div>
                </div>
                <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
              </div>
              <div className="border-t border-white/[0.06] pt-6">
                <h3 className="font-medium text-white/70 mb-4">{tl('profileInformation')}</h3>
                <div className="space-y-3 text-sm">
                  {[
                    { label: tl('name'), value: profile.full_name },
                    { label: tl('grade'), value: profile.grade_level ? getGradeName(profile.grade_level, language) : tl('notSet') },
                    { label: tl('school'), value: school.name },
                  ].map((row) => (
                    <div key={row.label} className="flex justify-between">
                      <span className="text-white/35">{row.label}</span>
                      <span className="text-white/80">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
