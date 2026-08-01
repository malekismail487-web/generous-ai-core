import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useAuth } from '@/hooks/useAuth';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { tr } from '@/lib/translations';
import { Navigate, Link } from 'react-router-dom';
import { Upload, ClipboardList, FileText, Megaphone, Settings, ChartBar as BarChart3, Bot, Radio, GraduationCap, Globe, BookOpen, Users, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

interface CourseMaterial { id: string; title: string; subject: string; }
interface Assignment { id: string; title: string; description: string | null; subject: string; due_date: string | null; points: number; created_at: string; }
interface Submission { id: string; assignment_id: string; content: string | null; submitted_at: string; grade: number | null; feedback: string | null; }
interface Announcement { id: string; title: string; body: string; created_at: string; }

export default function TeacherDashboard() {
  const { isTeacher, school, profile, loading } = useRoleGuard();
  const { signOut, user } = useAuth();
  const { toast } = useToast();
  const { language, setLanguage } = useThemeLanguage();

  const [courseMaterials, setCourseMaterials] = useState<CourseMaterial[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [categoryLabel, setCategoryLabel] = useState<{ name: string; emoji: string } | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  const [gradingDialogOpen, setGradingDialogOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [gradeValue, setGradeValue] = useState('');
  const [feedbackValue, setFeedbackValue] = useState('');

  const fetchData = useCallback(async () => {
    if (!school || !profile || !user) return;
    setLoadingData(true);
    const authUserId = user.id;
    const { data: materialsData } = await supabase.from('course_materials').select('*').eq('uploaded_by', authUserId).order('created_at', { ascending: false });
    setCourseMaterials((materialsData || []) as CourseMaterial[]);
    const { data: assignmentsData } = await supabase.from('assignments').select('*').eq('teacher_id', authUserId).order('created_at', { ascending: false });
    setAssignments((assignmentsData || []) as Assignment[]);
    if (assignmentsData && assignmentsData.length > 0) {
      const { data: submissionsData } = await supabase.from('submissions').select('*').in('assignment_id', assignmentsData.map(a => a.id));
      setSubmissions((submissionsData || []) as Submission[]);
    } else { setSubmissions([]); }
    const { data: announcementsData } = await supabase.from('announcements').select('*').eq('school_id', school.id).order('created_at', { ascending: false });
    setAnnouncements((announcementsData || []) as Announcement[]);
    setLoadingData(false);
  }, [school, profile, user]);

  useEffect(() => { if (isTeacher && school && profile) fetchData(); }, [isTeacher, school, profile, fetchData]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: prof } = await supabase.from('profiles').select('teacher_category_id').eq('id', user.id).maybeSingle();
      const tid = (prof as { teacher_category_id?: string | null } | null)?.teacher_category_id;
      if (!tid) { if (!cancelled) setCategoryLabel(null); return; }
      const { data: cat } = await supabase.from('teacher_categories').select('name,emoji').eq('id', tid).maybeSingle();
      const c = cat as { name?: string; emoji?: string | null } | null;
      if (!cancelled && c?.name) setCategoryLabel({ name: c.name, emoji: c.emoji || '🎓' });
    })();
    return () => { cancelled = true; };
  }, [user]);

  const gradeSubmission = async () => {
    if (!selectedSubmission || !user) return;
    const { error } = await supabase.from('submissions').update({ grade: parseInt(gradeValue) || null, feedback: feedbackValue || null, graded_at: new Date().toISOString(), graded_by: user.id }).eq('id', selectedSubmission.id);
    if (error) { toast({ variant: 'destructive', title: 'Error saving grade' }); }
    else { toast({ title: 'Grade saved!' }); setGradingDialogOpen(false); setSelectedSubmission(null); setGradeValue(''); setFeedbackValue(''); fetchData(); }
  };

  if (loading) return <div className="flex items-center justify-center h-screen bg-black"><LuminaAtom size={64} animate glow /></div>;
  if (!user || !isTeacher || !school || !profile?.is_active) return <Navigate to="/" replace />;

  const pendingGrading = submissions.filter(s => s.grade === null).length;

  const navItems: NavItem[] = [
    { id: 'overview',    icon: <BarChart3 size={18} />, label: 'Overview' },
    { id: 'materials',   icon: <Upload size={18} />,    label: tr('materials', language) },
    { id: 'assignments', icon: <ClipboardList size={18} />, label: tr('assign', language) },
    { id: 'analytics',   icon: <BarChart3 size={18} />, label: 'Analytics' },
    { id: 'lectures',    icon: <Bot size={18} />,       label: 'AI Lectures' },
    { id: 'grading',     icon: <FileText size={18} />,  label: tr('gradeVerb', language), badge: pendingGrading },
    { id: 'insights',    icon: <Users size={18} />,     label: tr('insights', language) },
    { id: 'news',        icon: <Megaphone size={18} />, label: tr('news', language) },
    { id: 'settings',    icon: <Settings size={18} />,  label: tr('settings', language) },
  ];

  const ungraded = submissions.filter(s => s.grade === null);

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
          <Button asChild size="sm" className="lumina-btn gap-2">
            <Link to="/teacher/live"><Radio size={14} className="text-red-400" /> Live</Link>
          </Button>
        </>
      }
    >
      <div className="p-4 md:p-8 max-w-6xl mx-auto">
        {/* ── OVERVIEW ── */}
        {activeTab === 'overview' && (
          <div className="space-y-6 tab-enter">
            <div className="lumina-card p-8 fade-up relative overflow-hidden">
              <div className="absolute top-0 right-0 opacity-30 pointer-events-none"><LuminaAtom size={180} animate glow /></div>
              <div className="relative z-10 max-w-lg">
                <div className="text-[11px] font-semibold tracking-[0.25em] uppercase text-white/30 mb-2">{tr('teacherDashboard', language)}</div>
                <h1 className="text-3xl md:text-4xl font-extrabold lumina-text mb-3">{profile.full_name}</h1>
                <p className="text-white/40 text-sm mb-6">{school.name}</p>
                {pendingGrading > 0 && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 text-sm fade-up fade-up-delay-1">
                    <Clock size={16} /><span>{pendingGrading} submissions waiting for grading</span>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: tr('courseMaterials', language), value: courseMaterials.length, icon: <Upload size={20} />, delay: 'fade-up-delay-1' },
                { label: tr('assignments', language), value: assignments.length, icon: <ClipboardList size={20} />, delay: 'fade-up-delay-2' },
                { label: tr('pendingGrading', language), value: pendingGrading, icon: <FileText size={20} />, delay: 'fade-up-delay-3', accent: 'text-amber-400' },
                { label: tr('announcementsLabel', language), value: announcements.length, icon: <Megaphone size={20} />, delay: 'fade-up-delay-4' },
              ].map((stat) => (
                <div key={stat.label} className={`lumina-stat p-5 space-y-3 fade-up ${stat.delay}`}>
                  <div className="lumina-icon-tile w-10 h-10">{stat.icon}</div>
                  <p className={`text-4xl font-extrabold count-up ${stat.accent || 'text-white'}`}>{stat.value}</p>
                  <p className="text-xs text-white/35 font-medium">{stat.label}</p>
                </div>
              ))}
            </div>
            <TenantExtensionsSection />
          </div>
        )}

        {/* ── MATERIALS ── */}
        {activeTab === 'materials' && (
          <div className="space-y-6 tab-enter">
            <div className="fade-up"><h2 className="text-2xl font-bold lumina-text mb-1">{tr('materials', language)}</h2></div>
            {loadingData ? <div className="flex items-center justify-center py-16"><LuminaAtom size={48} animate /></div>
            : <div className="fade-up fade-up-delay-1"><TeacherMaterials materials={courseMaterials} schoolId={school.id} authUserId={user.id} onRefresh={fetchData} /></div>}
          </div>
        )}

        {/* ── ASSIGNMENTS ── */}
        {activeTab === 'assignments' && (
          <div className="space-y-6 tab-enter">
            <div className="fade-up"><h2 className="text-2xl font-bold lumina-text mb-1">{tr('assign', language)}</h2></div>
            {loadingData ? <div className="flex items-center justify-center py-16"><LuminaAtom size={48} animate /></div>
            : <div className="fade-up fade-up-delay-1"><TeacherAssignments assignments={assignments} submissions={submissions} schoolId={school.id} authUserId={user.id} onRefresh={fetchData} /></div>}
          </div>
        )}

        {/* ── ANALYTICS ── */}
        {activeTab === 'analytics' && (
          <div className="space-y-6 tab-enter">
            <div className="fade-up"><h2 className="text-2xl font-bold lumina-text mb-1">Analytics</h2></div>
            <div className="fade-up fade-up-delay-1"><AssignmentPerformanceAnalytics schoolId={school.id} teacherId={user.id} /></div>
          </div>
        )}

        {/* ── AI LECTURES ── */}
        {activeTab === 'lectures' && (
          <div className="space-y-6 tab-enter">
            <div className="fade-up"><h2 className="text-2xl font-bold lumina-text mb-1">AI Lectures</h2></div>
            <div className="fade-up fade-up-delay-1"><SubjectsSection embedded /></div>
          </div>
        )}

        {/* ── GRADING ── */}
        {activeTab === 'grading' && (
          <div className="space-y-6 tab-enter">
            <div className="fade-up"><h2 className="text-2xl font-bold lumina-text mb-1">{tr('gradeSubmissions', language)}</h2></div>
            {ungraded.length === 0 ? (
              <div className="lumina-card p-12 text-center fade-up fade-up-delay-1">
                <FileText size={32} className="mx-auto mb-4 text-white/15" />
                <h3 className="font-semibold text-white/50 mb-2">{tr('allCaughtUp', language)}</h3>
                <p className="text-sm text-white/25">{tr('noSubmissionsWaiting', language)}</p>
              </div>
            ) : (
              <div className="lumina-card overflow-hidden fade-up fade-up-delay-1">
                <table className="w-full">
                  <thead className="bg-white/[0.03]">
                    <tr>
                      <th className="text-left p-4 text-xs font-semibold text-white/35 uppercase tracking-wider">{tr('assignment', language)}</th>
                      <th className="text-left p-4 text-xs font-semibold text-white/35 uppercase tracking-wider">{tr('studentLabel', language)}</th>
                      <th className="text-left p-4 text-xs font-semibold text-white/35 uppercase tracking-wider">{tr('submittedAt', language)}</th>
                      <th className="text-right p-4 text-xs font-semibold text-white/35 uppercase tracking-wider">{tr('action', language)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ungraded.map((submission, i) => {
                      const assignment = assignments.find(a => a.id === submission.assignment_id);
                      return (
                        <tr key={submission.id} className="border-t border-white/[0.05] hover:bg-white/[0.02] transition-colors fade-up" style={{ animationDelay: `${0.1 + i * 0.05}s` }}>
                          <td className="p-4 font-medium text-white/90">{assignment?.title || 'Unknown'}</td>
                          <td className="p-4 text-white/40 text-sm">Student</td>
                          <td className="p-4 text-white/40 text-sm">{new Date(submission.submitted_at).toLocaleDateString()}</td>
                          <td className="p-4 text-right"><Button size="sm" className="lumina-btn" onClick={() => { setSelectedSubmission(submission); setGradingDialogOpen(true); }}>Grade</Button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── INSIGHTS ── */}
        {activeTab === 'insights' && (
          <div className="space-y-6 tab-enter">
            <div className="fade-up"><h2 className="text-2xl font-bold lumina-text mb-1">{tr('insights', language)}</h2></div>
            <div className="fade-up fade-up-delay-1"><TeacherLearningStyleReports schoolId={school.id} /></div>
          </div>
        )}

        {/* ── ANNOUNCEMENTS ── */}
        {activeTab === 'news' && (
          <div className="space-y-6 tab-enter">
            <div className="fade-up"><h2 className="text-2xl font-bold lumina-text mb-1">{tr('schoolAnnouncements', language)}</h2></div>
            {announcements.length === 0 ? (
              <div className="lumina-card p-12 text-center fade-up fade-up-delay-1">
                <Megaphone size={32} className="mx-auto mb-4 text-white/15" />
                <h3 className="font-semibold text-white/50 mb-2">{tr('noAnnouncements', language)}</h3>
                <p className="text-sm text-white/25">{tr('announcementsWillAppear', language)}</p>
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

        {/* ── SETTINGS ── */}
        {activeTab === 'settings' && (
          <div className="space-y-6 tab-enter">
            <div className="fade-up"><h2 className="text-2xl font-bold lumina-text mb-1">{tr('settings', language)}</h2></div>
            <div className="lumina-card p-6 space-y-6 max-w-lg fade-up fade-up-delay-1">
              <div>
                <h3 className="font-semibold text-white/70 mb-3 flex items-center gap-2"><Globe size={16} className="text-white/40" />{language === 'ar' ? 'اللغة' : 'Language'}</h3>
                <div className="flex gap-2">
                  <button onClick={() => setLanguage('en')} className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all border ${language === 'en' ? 'lumina-btn' : 'bg-white/[0.03] text-white/40 border-white/10 hover:border-white/20'}`}>English</button>
                  <button onClick={() => setLanguage('ar')} className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all border ${language === 'ar' ? 'lumina-btn' : 'bg-white/[0.03] text-white/40 border-white/10 hover:border-white/20'}`}>العربية</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Grading Dialog */}
      {gradingDialogOpen && selectedSubmission && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="lumina-card p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto scale-in">
            <h2 className="text-xl font-bold lumina-text mb-4">{tr('gradeSubmission', language)}</h2>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-white/70 mb-2 text-sm">{tr('studentAnswer', language)}</h4>
                <div className="p-4 rounded-lg bg-white/[0.03] border border-white/[0.06] whitespace-pre-wrap text-sm text-white/60 max-h-40 overflow-y-auto">{selectedSubmission.content || tr('noContentSubmitted', language)}</div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/70">{tr('grade', language)}</label>
                <input type="number" value={gradeValue} onChange={(e) => setGradeValue(e.target.value)} placeholder={tr('enterGrade', language)} className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white/90 focus:border-white/30 outline-none transition-colors" min="0" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/70">{tr('feedback', language)}</label>
                <textarea value={feedbackValue} onChange={(e) => setFeedbackValue(e.target.value)} placeholder={tr('enterFeedback', language)} className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white/90 focus:border-white/30 outline-none transition-colors" rows={4} />
              </div>
              <div className="flex gap-3 pt-4">
                <Button variant="outline" className="flex-1 bg-white/[0.03] border-white/10 text-white/60 hover:bg-white/[0.06]" onClick={() => { setGradingDialogOpen(false); setSelectedSubmission(null); setGradeValue(''); setFeedbackValue(''); }}>{tr('cancel', language)}</Button>
                <Button className="flex-1 lumina-btn" onClick={gradeSubmission}>{tr('saveGrade', language)}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
