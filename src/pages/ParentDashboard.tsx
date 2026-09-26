import { useState, useEffect, useRef, useCallback } from 'react';
import { TrendingUp as LensTrend, ClipboardList as LensTask, Megaphone as LensMega } from 'lucide-react';
import { LiquidLens } from '@/components/motion/LiquidLens';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Heart, BookOpen, ClipboardCheck, Trophy, Bell, LogOut, Flame, TrendingUp } from 'lucide-react';
import { TenantExtensionsSection } from '@/components/extensions/TenantExtensionsSection';
import { ActorBackdrop } from '@/components/motion/ActorBackdrop';
import { LearningSupportPanel } from '@/components/learning/LearningSupportPanel';
import { FamilyActivityPlanner } from '@/components/learning/FamilyActivityPlanner';
import { FamilyEvidencePulse } from '@/components/learning/FamilyEvidencePulse';
import type { Tables } from '@/integrations/supabase/types';

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

  const [tab, setTab] = useState('performance');

  const [loading, setLoading] = useState(true);
  const [child, setChild] = useState<ChildInfo | null>(null);
  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [loadError, setLoadError] = useState('');
  const loadEpoch = useRef(0);
  const [assignments, setAssignments] = useState<Tables<'assignments'>[]>([]);
  const [submissions, setSubmissions] = useState<Tables<'submissions'>[]>([]);
  const [announcements, setAnnouncements] = useState<Tables<'announcements'>[]>([]);
  const [streak, setStreak] = useState<{ current_streak: number; max_streak: number } | null>(null);
  const [learningProfile, setLearningProfile] = useState<Tables<'student_learning_profiles'>[]>([]);

  const loadParentData = useCallback(async () => {
    if (!user) return;
    const epoch = ++loadEpoch.current;
    setLoading(true);
    setLoadError('');

    // Get linked child
    const { data: links, error: linksError } = await supabase
      .from('parent_students')
      .select('student_id, school_id')
      .eq('parent_id', user.id);

    if (epoch !== loadEpoch.current) return;
    if (linksError) { setLoadError(linksError.message); setLoading(false); return; }
    if (!links || links.length === 0) {
      setChildren([]);
      setChild(null);
      setLoading(false);
      return;
    }

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles').select('id, full_name, grade_level').in('id', links.map(link => link.student_id));
    if (epoch !== loadEpoch.current) return;
    if (profilesError) { setLoadError(profilesError.message); setLoading(false); return; }
    const linkedChildren = links.map(link => {
      const profile = profiles?.find(item => item.id === link.student_id);
      return {
        student_id: link.student_id, school_id: link.school_id,
        student_name: profile?.full_name || 'Student', grade_level: profile?.grade_level || null,
      };
    });
    setChildren(linkedChildren);
    const selected = linkedChildren.find(item => item.student_id === selectedChildId) || linkedChildren[0];
    if (selected.student_id !== selectedChildId) setSelectedChildId(selected.student_id);
    const link = selected;

    setChild(link);

    // Load all data in parallel
    const [assignmentsRes, submissionsRes, announcementsRes, streakRes, learningRes] = await Promise.all([
      supabase.from('assignments').select('*').eq('school_id', link.school_id)
        .eq('grade_level', link.grade_level ?? '').order('created_at', { ascending: false }).limit(20),
      supabase.from('submissions').select('*, assignments(title, subject)').eq('student_id', link.student_id).order('submitted_at', { ascending: false }).limit(20),
      supabase.from('announcements').select('*').eq('school_id', link.school_id).order('created_at', { ascending: false }).limit(10),
      supabase.from('daily_streaks').select('current_streak, max_streak').eq('user_id', link.student_id).maybeSingle(),
      supabase.from('student_learning_profiles').select('*').eq('user_id', link.student_id),
    ]);

    if (epoch !== loadEpoch.current) return;

    setAssignments(assignmentsRes.data || []);
    setSubmissions(submissionsRes.data || []);
    setAnnouncements(announcementsRes.data || []);
    setStreak(streakRes.data || null);
    setLearningProfile(learningRes.data || []);
    const firstError = [assignmentsRes.error, submissionsRes.error, announcementsRes.error, streakRes.error, learningRes.error].find(Boolean);
    if (firstError) setLoadError(firstError.message);
    setLoading(false);
  }, [user, selectedChildId]);

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
    const epochRef = loadEpoch;
    void loadParentData();
    return () => { epochRef.current++; };
  }, [user, navigate, loadParentData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!child) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <Heart className="w-12 h-12 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-bold">{isAr ? 'لا يوجد طالب مرتبط' : 'No Student Linked'}</h2>
            <p className="text-muted-foreground text-sm">{isAr ? 'تأكد من استخدام رمز ولي الأمر الصحيح' : 'Make sure you used the correct parent invite code.'}</p>
            <Button onClick={() => { signOut(); navigate('/auth'); }}>{isAr ? 'تسجيل الخروج' : 'Sign Out'}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const completedAssignments = submissions.filter(s => s.grade !== null);
  const avgGrade = completedAssignments.length > 0
    ? Math.round(completedAssignments.reduce((sum, s) => sum + (s.grade ?? 0), 0) / completedAssignments.length)
    : null;

  return (
    <div className="relative min-h-screen" dir={isAr ? 'rtl' : 'ltr'}>
      <ActorBackdrop variant="ambient" />
      <LiquidLens
        storageKey="lumina.lens.parent"
        label="Parent lens"
        actions={[
          { icon: LensTrend, label: 'Performance', onSelect: () => setTab('performance') },
          { icon: LensTask, label: 'Assignments', onSelect: () => setTab('assignments') },
          { icon: LensMega, label: 'Announcements', onSelect: () => setTab('announcements') },
        ]}
      />
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-foreground/[0.14] to-foreground/[0.04] flex items-center justify-center">
              <Heart className="w-5 h-5 text-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-lg">{isAr ? 'لوحة ولي الأمر' : 'Parent Dashboard'}</h1>
              <p className="text-xs text-muted-foreground">
                {isAr ? 'متابعة' : 'Tracking'}: <span className="font-medium text-foreground">{child.student_name}</span>
                {child.grade_level && <span className="text-muted-foreground"> • {child.grade_level}</span>}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => { signOut(); navigate('/auth'); }}>
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {loadError && <p role="alert" className="text-sm text-destructive">{loadError}</p>}
        {children.length > 1 && <label className="block text-sm font-medium">{isAr ? 'اختر الطالب' : 'Choose learner'}
          <select className="mt-1 block w-full rounded-md border bg-background p-2" value={selectedChildId} onChange={event => setSelectedChildId(event.target.value)}>
            {children.map(item => <option key={item.student_id} value={item.student_id}>{item.student_name} {item.grade_level && `· ${item.grade_level}`}</option>)}
          </select>
        </label>}
        <TenantExtensionsSection />
        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <Flame className="w-6 h-6 mx-auto mb-1 text-orange-500" />
              <p className="text-2xl font-bold">{streak?.current_streak || 0}</p>
              <p className="text-xs text-muted-foreground">{isAr ? 'أيام متتالية' : 'Day Streak'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <ClipboardCheck className="w-6 h-6 mx-auto mb-1 text-green-500" />
              <p className="text-2xl font-bold">{submissions.length}</p>
              <p className="text-xs text-muted-foreground">{isAr ? 'واجبات مسلمة' : 'Submitted'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <Trophy className="w-6 h-6 mx-auto mb-1 text-yellow-500" />
              <p className="text-2xl font-bold">{avgGrade !== null ? `${avgGrade}%` : '—'}</p>
              <p className="text-xs text-muted-foreground">{isAr ? 'متوسط الدرجات' : 'Avg Grade'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <BookOpen className="w-6 h-6 mx-auto mb-1 text-foreground" />
              <p className="text-2xl font-bold">{assignments.length}</p>
              <p className="text-xs text-muted-foreground">{isAr ? 'واجبات' : 'Assignments'}</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="performance" className="gap-1 text-xs">
              <TrendingUp className="w-3.5 h-3.5" />
              {isAr ? 'الأداء' : 'Performance'}
            </TabsTrigger>
            <TabsTrigger value="assignments" className="gap-1 text-xs">
              <ClipboardCheck className="w-3.5 h-3.5" />
              {isAr ? 'الواجبات' : 'Assignments'}
            </TabsTrigger>
            <TabsTrigger value="announcements" className="gap-1 text-xs">
              <Bell className="w-3.5 h-3.5" />
              {isAr ? 'الإعلانات' : 'News'}
            </TabsTrigger>
            <TabsTrigger value="support" className="gap-1 text-xs"><BookOpen className="w-3.5 h-3.5" />{isAr ? 'الدعم' : 'Support'}</TabsTrigger>
          </TabsList>

          <TabsContent value="support" className="mt-4">
            <FamilyActivityPlanner schoolId={child.school_id} studentId={child.student_id} />
            <div className="mt-6">
              <FamilyEvidencePulse schoolId={child.school_id} studentId={child.student_id} />
            </div>
            <div className="mt-6">
              <LearningSupportPanel role="family" schoolId={child.school_id} studentId={child.student_id} />
            </div>
          </TabsContent>

          {/* Performance Tab */}
          <TabsContent value="performance" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{isAr ? 'مستوى التعلم حسب المادة' : 'Learning Level by Subject'}</CardTitle>
              </CardHeader>
              <CardContent>
                {learningProfile.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">{isAr ? 'لا توجد بيانات بعد' : 'No learning data yet'}</p>
                ) : (
                  <div className="space-y-3">
                    {learningProfile.map((lp) => (
                      <div key={lp.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div>
                          <p className="font-medium text-sm">{lp.subject}</p>
                          <p className="text-xs text-muted-foreground">
                            {lp.total_questions_answered} {isAr ? 'سؤال' : 'questions'} • {Math.round(lp.recent_accuracy || 0)}% {isAr ? 'دقة' : 'accuracy'}
                          </p>
                        </div>
                        <Badge variant={lp.difficulty_level === 'advanced' ? 'default' : lp.difficulty_level === 'intermediate' ? 'secondary' : 'outline'}>
                          {lp.difficulty_level}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Assignments Tab */}
          <TabsContent value="assignments" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{isAr ? 'الواجبات الأخيرة' : 'Recent Assignments'}</CardTitle>
              </CardHeader>
              <CardContent>
                {assignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">{isAr ? 'لا توجد واجبات' : 'No assignments yet'}</p>
                ) : (
                  <div className="space-y-2">
                    {assignments.slice(0, 10).map((a) => {
                      const sub = submissions.find((s) => s.assignment_id === a.id);
                      return (
                        <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{a.title}</p>
                            <p className="text-xs text-muted-foreground">{a.subject} • {new Date(a.created_at).toLocaleDateString()}</p>
                          </div>
                          {sub ? (
                            <Badge variant={sub.grade !== null ? 'default' : 'secondary'}>
                              {sub.grade !== null ? `${sub.grade}%` : (isAr ? 'مسلّم' : 'Submitted')}
                            </Badge>
                          ) : (
                            <Badge variant="outline">{isAr ? 'لم يسلّم' : 'Not submitted'}</Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Announcements Tab */}
          <TabsContent value="announcements" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{isAr ? 'إعلانات المدرسة' : 'School Announcements'}</CardTitle>
              </CardHeader>
              <CardContent>
                {announcements.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">{isAr ? 'لا توجد إعلانات' : 'No announcements yet'}</p>
                ) : (
                  <div className="space-y-3">
                    {announcements.map((ann) => (
                      <div key={ann.id} className="p-3 rounded-lg bg-muted/50 space-y-1">
                        <p className="font-medium text-sm">{ann.title}</p>
                        <p className="text-xs text-muted-foreground">{ann.body}</p>
                        <p className="text-xs text-muted-foreground/60">{new Date(ann.created_at).toLocaleDateString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
