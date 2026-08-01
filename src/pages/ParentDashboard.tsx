import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Heart, BookOpen, ClipboardCheck, Trophy, Bell, Flame, TrendingUp } from 'lucide-react';
import { TenantExtensionsSection } from '@/components/extensions/TenantExtensionsSection';
import { DashboardShell, NavItem } from '@/components/DashboardShell';
import { LuminaAtom } from '@/components/LuminaAtom';

type ChildInfo = {
  student_id: string;
  school_id: string;
  student_name: string;
  grade_level: string | null;
};

export default function ParentDashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { language } = useThemeLanguage();
  const isAr = language === 'ar';

  const [loading, setLoading] = useState(true);
  const [child, setChild] = useState<ChildInfo | null>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [streak, setStreak] = useState<{ current_streak: number; max_streak: number } | null>(null);
  const [learningProfile, setLearningProfile] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'performance' | 'assignments' | 'news'>('performance');

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
    loadParentData();
  }, [user]);

  const loadParentData = async () => {
    if (!user) return;
    setLoading(true);

    /* Get linked child */
    const { data: links } = await supabase
      .from('parent_students')
      .select('student_id, school_id')
      .eq('parent_id', user.id);

    if (!links || links.length === 0) {
      setLoading(false);
      return;
    }

    const link = links[0];

    /* Get student profile */
    const { data: studentProfile } = await supabase
      .from('profiles')
      .select('full_name, grade_level')
      .eq('id', link.student_id)
      .maybeSingle();

    setChild({
      student_id: link.student_id,
      school_id: link.school_id,
      student_name: studentProfile?.full_name || 'Student',
      grade_level: studentProfile?.grade_level || null,
    });

    /* Load all data in parallel */
    const [assignmentsRes, submissionsRes, announcementsRes, streakRes, learningRes] = await Promise.all([
      supabase.from('assignments').select('*').eq('school_id', link.school_id).order('created_at', { ascending: false }).limit(20),
      supabase.from('assignment_submissions').select('*, assignments(title, subject)').eq('student_id', link.student_id).order('submitted_at', { ascending: false }).limit(20),
      supabase.from('announcements').select('*').eq('school_id', link.school_id).order('created_at', { ascending: false }).limit(10),
      supabase.from('daily_streaks').select('current_streak, max_streak').eq('user_id', link.student_id).maybeSingle(),
      supabase.from('student_learning_profiles').select('*').eq('user_id', link.student_id),
    ]);

    setAssignments(assignmentsRes.data || []);
    setSubmissions(submissionsRes.data || []);
    setAnnouncements(announcementsRes.data || []);
    setStreak(streakRes.data || null);
    setLearningProfile(learningRes.data || []);
    setLoading(false);
  };

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <LuminaAtom size={48} animate />
      </div>
    );
  }

  /* ── No student linked ── */
  if (!child) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black p-4">
        <div className="lumina-card max-w-md w-full text-center space-y-4 p-8 fade-up">
          <div className="lumina-icon-tile mx-auto">
            <Heart size={24} />
          </div>
          <h2 className="lumina-text text-xl font-bold">
            {isAr ? 'لا يوجد طالب مرتبط' : 'No Student Linked'}
          </h2>
          <p className="text-white/40 text-sm">
            {isAr ? 'تأكد من استخدام رمز ولي الأمر الصحيح' : 'Make sure you used the correct parent invite code.'}
          </p>
          <Button onClick={() => { signOut(); navigate('/auth'); }}>
            {isAr ? 'تسجيل الخروج' : 'Sign Out'}
          </Button>
        </div>
      </div>
    );
  }

  const completedAssignments = submissions.filter(s => s.grade);
  const avgGrade = completedAssignments.length > 0
    ? Math.round(completedAssignments.reduce((sum, s) => sum + (parseInt(s.grade) || 0), 0) / completedAssignments.length)
    : null;

  const navItems: NavItem[] = [
    { id: 'performance',  icon: <TrendingUp size={18} />,    label: isAr ? 'الأداء' : 'Performance' },
    { id: 'assignments',  icon: <ClipboardCheck size={18} />, label: isAr ? 'الواجبات' : 'Assignments' },
    { id: 'news',         icon: <Bell size={18} />,           label: isAr ? 'الإعلانات' : 'News' },
  ];

  const stats = [
    { label: isAr ? 'أيام متتالية' : 'Day Streak',   value: streak?.current_streak || 0,                     icon: <Flame size={20} />,         delay: 'fade-up-delay-1' },
    { label: isAr ? 'واجبات مسلمة' : 'Submitted',     value: submissions.length,                              icon: <ClipboardCheck size={20} />, delay: 'fade-up-delay-2' },
    { label: isAr ? 'متوسط الدرجات' : 'Avg Grade',    value: avgGrade !== null ? `${avgGrade}%` : '—',        icon: <Trophy size={20} />,         delay: 'fade-up-delay-3' },
    { label: isAr ? 'واجبات' : 'Assignments',         value: assignments.length,                              icon: <BookOpen size={20} />,       delay: 'fade-up-delay-4' },
  ];

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="h-screen">
      <DashboardShell
        role="Parent"
        name={child.student_name}
        org={child.grade_level || undefined}
        navItems={navItems}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as 'performance' | 'assignments' | 'news')}
      >
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-6">
          <TenantExtensionsSection />

          {/* ── Stat cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((stat, i) => (
              <div key={i} className={`lumina-stat fade-up ${stat.delay}`}>
                <div className="lumina-icon-tile mb-3">{stat.icon}</div>
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-white/40 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* ═══════════════ Performance Tab ═══════════════ */}
          {activeTab === 'performance' && (
            <div className="tab-enter">
              <div className="lumina-card p-6 fade-up fade-up-delay-1">
                <h3 className="lumina-text text-base font-semibold mb-4">
                  {isAr ? 'مستوى التعلم حسب المادة' : 'Learning Level by Subject'}
                </h3>
                {learningProfile.length === 0 ? (
                  <p className="text-sm text-white/30 text-center py-4">
                    {isAr ? 'لا توجد بيانات بعد' : 'No learning data yet'}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {learningProfile.map((lp: any) => (
                      <div
                        key={lp.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10"
                      >
                        <div>
                          <p className="font-medium text-sm text-white">{lp.subject}</p>
                          <p className="text-xs text-white/40">
                            {lp.total_questions_answered} {isAr ? 'سؤال' : 'questions'} • {Math.round(lp.recent_accuracy || 0)}% {isAr ? 'دقة' : 'accuracy'}
                          </p>
                        </div>
                        <Badge
                          variant={lp.difficulty_level === 'advanced' ? 'default' : lp.difficulty_level === 'intermediate' ? 'secondary' : 'outline'}
                          className={lp.difficulty_level === 'advanced' ? 'bg-white/15 text-white border border-white/25' : ''}
                        >
                          {lp.difficulty_level}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════════════ Assignments Tab ═══════════════ */}
          {activeTab === 'assignments' && (
            <div className="tab-enter">
              <div className="lumina-card p-6 fade-up fade-up-delay-1">
                <h3 className="lumina-text text-base font-semibold mb-4">
                  {isAr ? 'الواجبات الأخيرة' : 'Recent Assignments'}
                </h3>
                {assignments.length === 0 ? (
                  <p className="text-sm text-white/30 text-center py-4">
                    {isAr ? 'لا توجد واجبات' : 'No assignments yet'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {assignments.slice(0, 10).map((a: any) => {
                      const sub = submissions.find((s: any) => s.assignment_id === a.id);
                      return (
                        <div
                          key={a.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm text-white truncate">{a.title}</p>
                            <p className="text-xs text-white/40">
                              {a.subject} • {new Date(a.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          {sub ? (
                            <Badge className={sub.grade
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-white/10 text-white/70 border border-white/20'
                            }>
                              {sub.grade ? `${sub.grade}%` : (isAr ? 'مسلّم' : 'Submitted')}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-white/20 text-white/40">
                              {isAr ? 'لم يسلّم' : 'Not submitted'}
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════════════ News Tab ═══════════════ */}
          {activeTab === 'news' && (
            <div className="tab-enter">
              <div className="lumina-card p-6 fade-up fade-up-delay-1">
                <h3 className="lumina-text text-base font-semibold mb-4">
                  {isAr ? 'إعلانات المدرسة' : 'School Announcements'}
                </h3>
                {announcements.length === 0 ? (
                  <p className="text-sm text-white/30 text-center py-4">
                    {isAr ? 'لا توجد إعلانات' : 'No announcements yet'}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {announcements.map((ann: any) => (
                      <div
                        key={ann.id}
                        className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-1"
                      >
                        <p className="font-medium text-sm text-white">{ann.title}</p>
                        <p className="text-xs text-white/50">{ann.body}</p>
                        <p className="text-xs text-white/20">{new Date(ann.created_at).toLocaleDateString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DashboardShell>
    </div>
  );
}
