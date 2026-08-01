import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { tr, getGradeName } from '@/lib/translations';
import { Navigate } from 'react-router-dom';
import { BookOpen, FileText, Megaphone, Clock, CircleAlert as AlertCircle, Star, Settings, Bell, Brain, TrendingUp, Award, Zap } from 'lucide-react';
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

  if (loading) return <div className="flex items-center justify-center h-screen"><LuminaAtom size={64} animate glow /></div>;
  if (!isStudent || !school || !profile?.is_active) return <Navigate to="/" replace />;

  const overdue = getOverdue();
  const gradedCount = submissions.filter(s => s.grade !== null).length;

  const navItems: NavItem[] = [
    { id: 'overview',    icon: <TrendingUp size={20} />, label: 'Overview' },
    { id: 'assignments', icon: <FileText size={20} />,   label: tl('work'), badge: overdue.length },
    { id: 'modes',       icon: <Brain size={20} />,      label: 'AI Modes' },
    { id: 'reports',     icon: <BookOpen size={20} />,   label: tl('reports') },
    { id: 'grades',      icon: <Star size={20} />,       label: tl('grades') },
    { id: 'news',        icon: <Megaphone size={20} />,  label: tl('news') },
    { id: 'settings',    icon: <Settings size={20} />,   label: tl('settings') },
  ];

  const StatOrb = ({ label, value, icon, delay }: { label: string; value: number; icon: React.ReactNode; delay: string }) => (
    <div className={`lumina-stat p-6 flex flex-col items-center justify-center text-center fade-up ${delay} relative`}>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="lumina-orbit-ring w-[90%] h-[90%]" />
      </div>
      <div className="lumina-icon-tile w-12 h-12 mb-3 relative z-10">{icon}</div>
      <p className="text-5xl font-extrabold text-white count-up relative z-10 font-mono">{value}</p>
      <p className="text-xs text-white/35 font-semibold mt-2 relative z-10 uppercase tracking-wider">{label}</p>
    </div>
  );

  return (
    <DashboardShell
      role="Student"
      name={profile.full_name}
      org={school.name}
      navItems={navItems}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      headerRight={profile.grade_level ? <Badge variant="outline" className="border-white/20 text-white/60 font-mono text-xs">{getGradeName(profile.grade_level, language)}</Badge> : undefined}
      floatingActions={
        <>
          <button className="lumina-btn-icon w-12 h-12" title="Quick AI Chat" onClick={() => setActiveTab('modes')}>
            <Zap size={20} className="text-white/70" />
          </button>
        </>
      }
    >
      <div className="p-4 md:p-8 max-w-5xl mx-auto relative z-10">
        {/* ════════ OVERVIEW ════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-8 tab-enter">
            {/* Hero — large animated atom behind glass name card */}
            <div className="lumina-card p-8 md:p-10 fade-up relative overflow-hidden min-h-[220px] flex items-center">
              <div className="absolute top-1/2 right-8 -translate-y-1/2 opacity-40 pointer-events-none hidden md:block">
                <LuminaAtom size={200} animate glow />
              </div>
              <div className="relative z-10 max-w-lg">
                <div className="text-[11px] font-bold tracking-[0.3em] uppercase text-white/25 mb-3 font-mono">{tl('welcome')}</div>
                <h1 className="text-4xl md:text-5xl font-extrabold lumina-text mb-4 leading-tight">{profile.full_name}</h1>
                <p className="text-white/40 text-sm mb-6">{tl('yourDashboard')} — {school.name}</p>
                {overdue.length > 0 && (
                  <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-red-500/10 border border-red-500/25 text-red-400 text-sm fade-up fade-up-delay-1">
                    <AlertCircle size={15} /><span>{tl('youHave')} {overdue.length} {overdue.length > 1 ? tl('overdueWarningPlural') : tl('overdueWarning')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Data stream divider */}
            <div className="lumina-divider fade-up fade-up-delay-1" />

            {/* Stat orbs with orbit rings */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatOrb label={tl('materials')} value={materials.length} icon={<BookOpen size={20} />} delay="fade-up-delay-1" />
              <StatOrb label={tl('submitted')} value={submissions.length} icon={<FileText size={20} />} delay="fade-up-delay-2" />
              <StatOrb label={tl('grades')} value={gradedCount} icon={<Star size={20} />} delay="fade-up-delay-3" />
              <StatOrb label={tl('myAwards')} value={awards.length} icon={<Award size={20} />} delay="fade-up-delay-4" />
            </div>

            {/* Data stream divider */}
            <div className="lumina-divider fade-up fade-up-delay-2" />

            {/* Calibration + Decay */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 fade-up fade-up-delay-3">
              <CalibrationCurve userId={profile.id} />
              <DecayDashboardCard userId={profile.id} />
            </div>

            <div className="fade-up fade-up-delay-4"><TenantExtensionsSection /></div>
          </div>
        )}

        {/* ════════ ASSIGNMENTS ════════ */}
        {activeTab === 'assignments' && (
          <div className="space-y-6 tab-enter">
            <div className="fade-up flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-3xl font-extrabold lumina-text mb-1">{tl('work')}</h2>
                <p className="text-white/35 text-sm font-mono">{assignments.length} total • {submissions.length} submitted • {overdue.length} overdue</p>
              </div>
              <div className="flex gap-2">
                <button className="lumina-btn-glass px-4 py-2 text-sm">All</button>
                <button className="lumina-btn-glass px-4 py-2 text-sm opacity-50">Pending</button>
                <button className="lumina-btn-glass px-4 py-2 text-sm opacity-50">Done</button>
              </div>
            </div>
            <div className="lumina-divider fade-up fade-up-delay-1" />
            {loadingData ? (
              <div className="flex items-center justify-center py-16"><LuminaAtom size={48} animate /></div>
            ) : (
              <div className="fade-up fade-up-delay-1"><StudentAssignments assignments={assignments} submissions={submissions} profileId={profile.id} onRefresh={fetchData} /></div>
            )}
          </div>
        )}

        {/* ════════ AI MODES ════════ */}
        {activeTab === 'modes' && (
          <div className="space-y-6 tab-enter">
            <div className="fade-up">
              <h2 className="text-3xl font-extrabold lumina-text mb-1">AI Learning Modes</h2>
              <p className="text-white/35 text-sm">Choose how you want to learn today</p>
            </div>
            <div className="lumina-divider fade-up fade-up-delay-1" />
            <div className="fade-up fade-up-delay-1"><MasteryMap /></div>
            <div className="lumina-divider fade-up fade-up-delay-2" />
            <div className="fade-up fade-up-delay-2"><LearningModesHub /></div>
          </div>
        )}

        {/* ════════ REPORTS ════════ */}
        {activeTab === 'reports' && (
          <div className="space-y-6 tab-enter">
            <div className="fade-up"><h2 className="text-3xl font-extrabold lumina-text mb-1">{tl('reports')}</h2></div>
            <div className="lumina-divider fade-up fade-up-delay-1" />
            {loadingData ? <div className="flex items-center justify-center py-16"><LuminaAtom size={48} animate /></div>
            : <div className="fade-up fade-up-delay-1"><StudentReportCards studentId={profile.id} /></div>}
          </div>
        )}

        {/* ════════ GRADES ════════ */}
        {activeTab === 'grades' && (
          <div className="space-y-6 tab-enter">
            <div className="fade-up"><h2 className="text-3xl font-extrabold lumina-text mb-1">{tl('myGrades')}</h2></div>
            <div className="lumina-divider fade-up fade-up-delay-1" />
            <div className="lumina-card overflow-hidden fade-up fade-up-delay-1">
              <table className="w-full">
                <thead className="bg-white/[0.03]">
                  <tr>
                    <th className="text-left p-4 text-xs font-bold text-white/35 uppercase tracking-wider font-mono">{tl('assignment')}</th>
                    <th className="text-left p-4 text-xs font-bold text-white/35 uppercase tracking-wider font-mono">{tl('submitted')}</th>
                    <th className="text-left p-4 text-xs font-bold text-white/35 uppercase tracking-wider font-mono">{tl('grade')}</th>
                    <th className="text-left p-4 text-xs font-bold text-white/35 uppercase tracking-wider font-mono">{tl('feedback')}</th>
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
                          <td className="p-4 font-semibold text-white/90">{assignment?.title || 'Unknown'}</td>
                          <td className="p-4 text-white/40 text-sm font-mono">{new Date(submission.submitted_at).toLocaleDateString()}</td>
                          <td className="p-4"><Badge className="bg-white/10 text-white/80 border border-white/15 font-mono">{submission.grade}/{assignment?.points || 100}</Badge></td>
                          <td className="p-4 text-white/40 text-sm max-w-xs truncate">{submission.feedback || '—'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {awards.length > 0 && (
              <>
                <div className="lumina-divider fade-up fade-up-delay-2" />
                <div className="fade-up fade-up-delay-2">
                  <h3 className="text-xl font-bold lumina-text mb-4">{tl('myAwards')}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {awards.map((award, i) => (
                      <div key={award.id} className="lumina-card p-5 text-center cosmic-float fade-up" style={{ animationDelay: `${0.1 + i * 0.08}s` }}>
                        <div className="lumina-icon-tile mx-auto mb-3 w-12 h-12"><Star size={22} /></div>
                        <h4 className="font-semibold text-sm text-white/85">{award.title}</h4>
                        <p className="text-xs text-white/30 capitalize mt-1 font-mono">{award.type}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ════════ ANNOUNCEMENTS ════════ */}
        {activeTab === 'news' && (
          <div className="space-y-6 tab-enter">
            <div className="fade-up"><h2 className="text-3xl font-extrabold lumina-text mb-1">{tl('announcementsLabel')}</h2></div>
            <div className="lumina-divider fade-up fade-up-delay-1" />
            {announcements.length === 0 ? (
              <div className="lumina-card p-12 text-center fade-up fade-up-delay-1">
                <Megaphone size={36} className="mx-auto mb-4 text-white/15" />
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
                        <h3 className="font-bold text-white/90 mb-1">{ann.title}</h3>
                        <p className="text-xs text-white/30 mb-3 font-mono">{new Date(ann.created_at).toLocaleString()}</p>
                        <p className="text-white/50 text-sm whitespace-pre-wrap">{ann.body}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════ SETTINGS ════════ */}
        {activeTab === 'settings' && (
          <div className="space-y-6 tab-enter">
            <div className="fade-up"><h2 className="text-3xl font-extrabold lumina-text mb-1">{tl('settings')}</h2></div>
            <div className="lumina-divider fade-up fade-up-delay-1" />
            <div className="lumina-card p-6 space-y-6 max-w-lg fade-up fade-up-delay-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="lumina-icon-tile w-10 h-10"><Bell size={16} /></div>
                  <div>
                    <p className="font-semibold text-white/85">{tl('notifications')}</p>
                    <p className="text-sm text-white/30">{tl('notificationsDesc')}</p>
                  </div>
                </div>
                <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
              </div>
              <div className="border-t border-white/[0.06] pt-6">
                <h3 className="font-semibold text-white/70 mb-4">{tl('profileInformation')}</h3>
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
