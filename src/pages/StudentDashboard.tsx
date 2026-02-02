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
  Megaphone,
  Clock,
  AlertCircle,
  Star,
  Settings,
  Bell
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { StudentAssignments } from '@/components/student/StudentAssignments';
import { StudentMaterials } from '@/components/student/StudentMaterials';

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
  subject_id: string | null;
  grade_level: string;
  due_date: string | null;
  points: number;
  created_at: string;
}

interface Submission {
  id: string;
  assignment_id: string;
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

interface Award {
  id: string;
  type: string;
  title: string;
  description: string | null;
  created_at: string;
}

export default function StudentDashboard() {
  const { isStudent, school, profile, loading } = useRoleGuard();
  const { signOut } = useAuth();
  const { toast } = useToast();

  // State
  const [materials, setMaterials] = useState<CourseMaterial[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [awards, setAwards] = useState<Award[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Settings state
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const fetchData = useCallback(async () => {
    if (!school || !profile) return;
    setLoadingData(true);

    // Fetch course materials - filtered by student's grade
    let materialsQuery = supabase
      .from('course_materials')
      .select('*')
      .eq('school_id', school.id)
      .order('created_at', { ascending: false });

    // Filter by grade level if student has one
    if (profile.grade_level) {
      materialsQuery = materialsQuery.or(`grade_level.eq.${profile.grade_level},grade_level.eq.All`);
    }

    const { data: materialsData } = await materialsQuery;
    setMaterials((materialsData || []) as CourseMaterial[]);

    // Fetch assignments - filtered by student's grade
    let assignmentsQuery = supabase
      .from('assignments')
      .select('*')
      .eq('school_id', school.id)
      .order('due_date', { ascending: true });

    if (profile.grade_level) {
      assignmentsQuery = assignmentsQuery.or(`grade_level.eq.${profile.grade_level},grade_level.eq.All`);
    }

    const { data: assignmentsData } = await assignmentsQuery;
    setAssignments((assignmentsData || []) as Assignment[]);

    // Fetch my submissions
    const { data: submissionsData } = await supabase
      .from('submissions')
      .select('*')
      .eq('student_id', profile.id);
    setSubmissions((submissionsData || []) as Submission[]);

    // Fetch announcements
    const { data: announcementsData } = await supabase
      .from('announcements')
      .select('*')
      .eq('school_id', school.id)
      .order('created_at', { ascending: false });
    setAnnouncements((announcementsData || []) as Announcement[]);

    // Fetch awards
    const { data: awardsData } = await supabase
      .from('awards')
      .select('*')
      .eq('student_id', profile.id)
      .order('created_at', { ascending: false });
    setAwards((awardsData || []) as Award[]);

    setLoadingData(false);
  }, [school, profile]);

  useEffect(() => {
    if (isStudent && school && profile) {
      fetchData();
    }
  }, [isStudent, school, profile, fetchData]);

  const getUpcomingDeadlines = () => {
    const now = new Date();
    return assignments
      .filter(a => a.due_date && new Date(a.due_date) > now)
      .slice(0, 3);
  };

  const getOverdueAssignments = () => {
    const now = new Date();
    return assignments.filter(a => {
      if (!a.due_date) return false;
      const dueDate = new Date(a.due_date);
      const submission = submissions.find(s => s.assignment_id === a.id);
      return dueDate < now && !submission;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isStudent || !school || !profile?.is_active) {
    return <Navigate to="/" replace />;
  }

  const upcomingDeadlines = getUpcomingDeadlines();
  const overdueAssignments = getOverdueAssignments();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass-effect-strong border-b border-border/30 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Welcome, {profile.full_name}!</h1>
              <p className="text-xs text-muted-foreground">{school.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {profile.grade_level && (
              <Badge variant="outline">{profile.grade_level}</Badge>
            )}
            <Button variant="outline" size="icon" onClick={signOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Welcome Section with Countdown */}
        <div className="glass-effect rounded-xl p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold mb-2">Your Dashboard</h2>
              {upcomingDeadlines.length > 0 && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>
                    Next deadline: <strong>{upcomingDeadlines[0].title}</strong> on{' '}
                    {new Date(upcomingDeadlines[0].due_date!).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-primary">{materials.length}</p>
                <p className="text-xs text-muted-foreground">Materials</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-green-500">{submissions.length}</p>
                <p className="text-xs text-muted-foreground">Submitted</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-amber-500">{awards.length}</p>
                <p className="text-xs text-muted-foreground">Awards</p>
              </div>
            </div>
          </div>

          {/* Overdue Warning */}
          {overdueAssignments.length > 0 && (
            <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              <span className="text-destructive font-medium">
                You have {overdueAssignments.length} overdue assignment{overdueAssignments.length > 1 ? 's' : ''}!
              </span>
            </div>
          )}
        </div>

        <Tabs defaultValue="materials" className="space-y-6">
          <TabsList className="grid grid-cols-5 w-full max-w-2xl">
            <TabsTrigger value="materials" className="gap-2">
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline">Materials</span>
            </TabsTrigger>
            <TabsTrigger value="assignments" className="gap-2">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Work</span>
              {overdueAssignments.length > 0 && (
                <Badge variant="destructive" className="ml-1">{overdueAssignments.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="grades" className="gap-2">
              <Star className="w-4 h-4" />
              <span className="hidden sm:inline">Grades</span>
            </TabsTrigger>
            <TabsTrigger value="announcements" className="gap-2">
              <Megaphone className="w-4 h-4" />
              <span className="hidden sm:inline">News</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </TabsTrigger>
          </TabsList>

          {/* Materials Tab - Using new Classera-style component */}
          <TabsContent value="materials" className="space-y-4">
            {loadingData ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <StudentMaterials materials={materials} />
            )}
          </TabsContent>

          {/* Assignments Tab - Using new Classera-style component */}
          <TabsContent value="assignments" className="space-y-4">
            {loadingData ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <StudentAssignments
                assignments={assignments}
                submissions={submissions}
                profileId={profile.id}
                onRefresh={fetchData}
              />
            )}
          </TabsContent>

          {/* Grades Tab */}
          <TabsContent value="grades" className="space-y-4">
            <h2 className="text-lg font-semibold">My Grades</h2>

            <div className="glass-effect rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-4 font-medium">Assignment</th>
                    <th className="text-left p-4 font-medium">Submitted</th>
                    <th className="text-left p-4 font-medium">Grade</th>
                    <th className="text-left p-4 font-medium">Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.filter(s => s.grade !== null).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-8 text-muted-foreground">
                        No grades yet
                      </td>
                    </tr>
                  ) : (
                    submissions
                      .filter(s => s.grade !== null)
                      .map((submission) => {
                        const assignment = assignments.find(a => a.id === submission.assignment_id);
                        return (
                          <tr key={submission.id} className="border-t border-border/50">
                            <td className="p-4 font-medium">
                              {assignment?.title || 'Unknown'}
                            </td>
                            <td className="p-4 text-muted-foreground">
                              {new Date(submission.submitted_at).toLocaleDateString()}
                            </td>
                            <td className="p-4">
                              <Badge className="bg-green-500">
                                {submission.grade}/{assignment?.points || 100}
                              </Badge>
                            </td>
                            <td className="p-4 text-muted-foreground max-w-xs truncate">
                              {submission.feedback || '-'}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>

            {/* Awards Section */}
            {awards.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-4">My Awards</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {awards.map((award) => (
                    <div key={award.id} className="glass-effect rounded-xl p-4 text-center">
                      <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-2">
                        <Star className="w-6 h-6 text-amber-500" />
                      </div>
                      <h4 className="font-semibold text-sm">{award.title}</h4>
                      <p className="text-xs text-muted-foreground capitalize">{award.type}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Announcements Tab */}
          <TabsContent value="announcements" className="space-y-4">
            <h2 className="text-lg font-semibold">Announcements</h2>

            {announcements.length === 0 ? (
              <div className="glass-effect rounded-xl p-8 text-center">
                <Megaphone className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-semibold mb-2">No Announcements</h3>
                <p className="text-sm text-muted-foreground">
                  School announcements will appear here
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

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4">
            <h2 className="text-lg font-semibold">Settings</h2>

            <div className="glass-effect rounded-xl p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Notifications</p>
                    <p className="text-sm text-muted-foreground">
                      Receive notifications for new assignments and grades
                    </p>
                  </div>
                </div>
                <Switch
                  checked={notificationsEnabled}
                  onCheckedChange={setNotificationsEnabled}
                />
              </div>

              <div className="border-t pt-6">
                <h3 className="font-medium mb-4">Profile Information</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name</span>
                    <span>{profile.full_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Grade</span>
                    <span>{profile.grade_level || 'Not set'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">School</span>
                    <span>{school.name}</span>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
