import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Heart, BookOpen, ClipboardCheck, Trophy, Bell, LogOut, Flame, TrendingUp } from 'lucide-react';

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

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
    loadParentData();
  }, [user]);

  const loadParentData = async () => {
    if (!user) return;
    setLoading(true);

    // Get linked child
    const { data: links } = await supabase
      .from('parent_students')
      .select('student_id, school_id')
      .eq('parent_id', user.id);

    if (!links || links.length === 0) {
      setLoading(false);
      return;
    }

    const link = links[0];
    
    // Get student profile
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

    // Load all data in parallel
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

  const completedAssignments = submissions.filter(s => s.grade);
  const avgGrade = completedAssignments.length > 0
    ? Math.round(completedAssignments.reduce((sum, s) => sum + (parseInt(s.grade) || 0), 0) / completedAssignments.length)
    : null;

  return (
    <div className="min-h-screen bg-background" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">
              <Heart className="w-5 h-5 text-white" />
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
              <BookOpen className="w-6 h-6 mx-auto mb-1 text-blue-500" />
              <p className="text-2xl font-bold">{assignments.length}</p>
              <p className="text-xs text-muted-foreground">{isAr ? 'واجبات' : 'Assignments'}</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="performance">
          <TabsList className="grid w-full grid-cols-3">
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
          </TabsList>

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
                    {learningProfile.map((lp: any) => (
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
                    {assignments.slice(0, 10).map((a: any) => {
                      const sub = submissions.find((s: any) => s.assignment_id === a.id);
                      return (
                        <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{a.title}</p>
                            <p className="text-xs text-muted-foreground">{a.subject} • {new Date(a.created_at).toLocaleDateString()}</p>
                          </div>
                          {sub ? (
                            <Badge variant={sub.grade ? 'default' : 'secondary'}>
                              {sub.grade ? `${sub.grade}%` : (isAr ? 'مسلّم' : 'Submitted')}
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
                    {announcements.map((ann: any) => (
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
