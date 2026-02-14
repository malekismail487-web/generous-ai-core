import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import {
  Loader2,
  LogOut,
  BookOpen,
  FileText,
  GraduationCap,
  ClipboardList,
  BarChart3,
  Megaphone,
  Upload
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TeacherAssignments } from '@/components/teacher/TeacherAssignments';
import { TeacherMaterials } from '@/components/teacher/TeacherMaterials';

interface CourseMaterial {
  id: string;
  title: string;
  subject: string;
  content: string | null;
  file_url: string | null;
  grade_level: string | null;
  created_at: string;
}

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  grade_level: string;
  due_date: string | null;
  points: number;
  created_at: string;
}

interface Submission {
  id: string;
  assignment_id: string;
  student_id: string;
  content: string | null;
  submitted_at: string;
  grade: number | null;
  feedback: string | null;
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  created_at: string;
}

export default function TeacherDashboard() {
  const { isTeacher, school, profile, loading } = useRoleGuard();
  const { signOut, user } = useAuth();
  const { toast } = useToast();
  const { language } = useThemeLanguage();

  // State
  const [courseMaterials, setCourseMaterials] = useState<CourseMaterial[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Grading dialog states
  const [gradingDialogOpen, setGradingDialogOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [gradeValue, setGradeValue] = useState('');
  const [feedbackValue, setFeedbackValue] = useState('');

  const fetchData = useCallback(async () => {
    if (!school || !profile || !user) return;
    setLoadingData(true);

    // IMPORTANT: For all ownership fields, the backend expects the authenticated user id (auth.uid()),
    // not the profile id. Profile ids can differ in this app.
    const authUserId = user.id;

    // Fetch course materials
    const { data: materialsData } = await supabase
      .from('course_materials')
      .select('*')
      .eq('uploaded_by', authUserId)
      .order('created_at', { ascending: false });
    setCourseMaterials((materialsData || []) as CourseMaterial[]);

    // Fetch assignments
    const { data: assignmentsData } = await supabase
      .from('assignments')
      .select('*')
      .eq('teacher_id', authUserId)
      .order('created_at', { ascending: false });
    setAssignments((assignmentsData || []) as Assignment[]);

    // Fetch submissions for teacher's assignments
    if (assignmentsData && assignmentsData.length > 0) {
      const assignmentIds = assignmentsData.map(a => a.id);
      const { data: submissionsData } = await supabase
        .from('submissions')
        .select('*')
        .in('assignment_id', assignmentIds);
      setSubmissions((submissionsData || []) as Submission[]);
    } else {
      setSubmissions([]);
    }

    // Fetch announcements
    const { data: announcementsData } = await supabase
      .from('announcements')
      .select('*')
      .eq('school_id', school.id)
      .order('created_at', { ascending: false });
    setAnnouncements((announcementsData || []) as Announcement[]);

    setLoadingData(false);
  }, [school, profile, user]);

  useEffect(() => {
    if (isTeacher && school && profile) {
      fetchData();
    }
  }, [isTeacher, school, profile, fetchData]);

  // Grading
  const gradeSubmission = async () => {
    if (!selectedSubmission || !user) return;

    const { error } = await supabase
      .from('submissions')
      .update({
        grade: parseInt(gradeValue) || null,
        feedback: feedbackValue || null,
        graded_at: new Date().toISOString(),
        graded_by: user.id
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !isTeacher || !school || !profile?.is_active) {
    return <Navigate to="/" replace />;
  }

  const pendingGrading = submissions.filter(s => s.grade === null).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass-effect-strong border-b border-border/30 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">{tr('teacherDashboard', language)}</h1>
              <p className="text-xs text-muted-foreground">{school.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {profile.full_name}
            </span>
            <Button variant="outline" size="icon" onClick={signOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{tr('courseMaterials', language)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{courseMaterials.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{tr('assignments', language)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{assignments.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{tr('pendingGrading', language)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-amber-500">{pendingGrading}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{tr('announcementsLabel', language)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{announcements.length}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="materials" className="space-y-6">
          <TabsList className="grid grid-cols-5 w-full max-w-2xl">
            <TabsTrigger value="materials" className="gap-2">
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">{tr('materials', language)}</span>
            </TabsTrigger>
            <TabsTrigger value="assignments" className="gap-2">
              <ClipboardList className="w-4 h-4" />
              <span className="hidden sm:inline">{tr('assign', language)}</span>
            </TabsTrigger>
            <TabsTrigger value="grading" className="gap-2">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">{tr('gradeVerb', language)}</span>
              {pendingGrading > 0 && (
                <Badge variant="destructive" className="ml-1">
                  {pendingGrading}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="insights" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">{tr('insights', language)}</span>
            </TabsTrigger>
            <TabsTrigger value="announcements" className="gap-2">
              <Megaphone className="w-4 h-4" />
              <span className="hidden sm:inline">{tr('news', language)}</span>
            </TabsTrigger>
          </TabsList>

          {/* Course Materials Tab - Using new Classera-style component */}
          <TabsContent value="materials" className="space-y-4">
            {loadingData ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <TeacherMaterials
                materials={courseMaterials}
                schoolId={school.id}
                authUserId={user.id}
                onRefresh={fetchData}
              />
            )}
          </TabsContent>

          {/* Assignments Tab - Using new Classera-style component */}
          <TabsContent value="assignments" className="space-y-4">
            {loadingData ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <TeacherAssignments
                assignments={assignments}
                submissions={submissions}
                schoolId={school.id}
                authUserId={user.id}
                onRefresh={fetchData}
              />
            )}
          </TabsContent>

          {/* Grading Tab */}
          <TabsContent value="grading" className="space-y-4">
            <h2 className="text-lg font-semibold">{tr('gradeSubmissions', language)}</h2>

            {submissions.filter(s => s.grade === null).length === 0 ? (
              <div className="glass-effect rounded-xl p-8 text-center">
                <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-semibold mb-2">{tr('allCaughtUp', language)}</h3>
                <p className="text-sm text-muted-foreground">
                  {tr('noSubmissionsWaiting', language)}
                </p>
              </div>
            ) : (
              <div className="glass-effect rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-4 font-medium">{tr('assignment', language)}</th>
                      <th className="text-left p-4 font-medium">{tr('studentLabel', language)}</th>
                      <th className="text-left p-4 font-medium">{tr('submittedAt', language)}</th>
                      <th className="text-right p-4 font-medium">{tr('action', language)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.filter(s => s.grade === null).map((submission) => {
                      const assignment = assignments.find(a => a.id === submission.assignment_id);
                      return (
                        <tr key={submission.id} className="border-t border-border/50">
                          <td className="p-4 font-medium">{assignment?.title || 'Unknown'}</td>
                          <td className="p-4 text-muted-foreground">Student</td>
                          <td className="p-4 text-muted-foreground">
                            {new Date(submission.submitted_at).toLocaleDateString()}
                          </td>
                          <td className="p-4 text-right">
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedSubmission(submission);
                                setGradingDialogOpen(true);
                              }}
                            >
                              Grade
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* Insights Tab */}
          <TabsContent value="insights" className="space-y-4">
            <h2 className="text-lg font-semibold">{tr('insights', language)}</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{tr('submissionRate', language)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-6">
                    <p className="text-4xl font-bold text-primary">
                      {assignments.length > 0 
                        ? Math.round((submissions.length / assignments.length) * 100)
                        : 0
                      }%
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      {tr('avgSubmissionRate', language)}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{tr('gradingProgress', language)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-6">
                    <p className="text-4xl font-bold text-green-500">
                      {submissions.length > 0
                        ? Math.round((submissions.filter(s => s.grade !== null).length / submissions.length) * 100)
                        : 100
                      }%
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      {submissions.filter(s => s.grade !== null).length} of {submissions.length} graded
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Announcements Tab */}
          <TabsContent value="announcements" className="space-y-4">
            <h2 className="text-lg font-semibold">{tr('schoolAnnouncements', language)}</h2>

            {announcements.length === 0 ? (
              <div className="glass-effect rounded-xl p-8 text-center">
                <Megaphone className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-semibold mb-2">{tr('noAnnouncements', language)}</h3>
                <p className="text-sm text-muted-foreground">
                  {tr('announcementsWillAppear', language)}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {announcements.map((announcement) => (
                  <div key={announcement.id} className="glass-effect rounded-xl p-4">
                    <h3 className="font-semibold">{announcement.title}</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      {new Date(announcement.created_at).toLocaleString()}
                    </p>
                    <p className="text-muted-foreground whitespace-pre-wrap">{announcement.body}</p>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Grading Dialog */}
      {gradingDialogOpen && selectedSubmission && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">{tr('gradeSubmission', language)}</h2>
            
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">{tr('studentAnswer', language)}</h4>
                <div className="p-4 bg-muted rounded-lg whitespace-pre-wrap text-sm">
                  {selectedSubmission.content || tr('noContentSubmitted', language)}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{tr('grade', language)}</label>
                <input
                  type="number"
                  value={gradeValue}
                  onChange={(e) => setGradeValue(e.target.value)}
                  placeholder={tr('enterGrade', language)}
                  className="w-full px-3 py-2 rounded-lg border bg-background"
                  min="0"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{tr('feedback', language)}</label>
                <textarea
                  value={feedbackValue}
                  onChange={(e) => setFeedbackValue(e.target.value)}
                  placeholder={tr('enterFeedback', language)}
                  className="w-full px-3 py-2 rounded-lg border bg-background"
                  rows={4}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    setGradingDialogOpen(false);
                    setSelectedSubmission(null);
                    setGradeValue('');
                    setFeedbackValue('');
                  }}
                >
                  {tr('cancel', language)}
                </Button>
                <Button className="flex-1" onClick={gradeSubmission}>
                  {tr('saveGrade', language)}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
