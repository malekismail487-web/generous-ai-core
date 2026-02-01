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
  Calendar,
  Megaphone,
  Clock,
  CheckCircle2,
  AlertCircle,
  Send,
  Star,
  Settings,
  Bell
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface Subject {
  id: string;
  name: string;
  description: string | null;
}

interface LessonPlan {
  id: string;
  title: string;
  description: string | null;
  subject_id: string;
  objectives: string | null;
  notes: string | null;
  publish_date: string | null;
}

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  subject_id: string | null;
  due_date: string | null;
  points: number;
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
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [lessonPlans, setLessonPlans] = useState<LessonPlan[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [awards, setAwards] = useState<Award[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Assignment submission state
  const [submissionDialogOpen, setSubmissionDialogOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [submissionContent, setSubmissionContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Lesson view state
  const [lessonDialogOpen, setLessonDialogOpen] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<LessonPlan | null>(null);

  // Settings state
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const fetchData = useCallback(async () => {
    if (!school || !profile) return;
    setLoadingData(true);

    // Fetch subjects
    const { data: subjectsData } = await supabase
      .from('subjects')
      .select('*')
      .eq('school_id', school.id);
    setSubjects((subjectsData || []) as Subject[]);

    // Fetch published lesson plans
    const { data: lessonsData } = await supabase
      .from('lesson_plans')
      .select('*')
      .eq('school_id', school.id)
      .eq('is_published', true)
      .order('publish_date', { ascending: false });
    setLessonPlans((lessonsData || []) as LessonPlan[]);

    // Fetch assignments
    const { data: assignmentsData } = await supabase
      .from('assignments')
      .select('*')
      .eq('school_id', school.id)
      .order('due_date', { ascending: true });
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

  const submitAssignment = async () => {
    if (!selectedAssignment || !profile) return;

    setSubmitting(true);

    // Check if already submitted
    const existingSubmission = submissions.find(s => s.assignment_id === selectedAssignment.id);

    if (existingSubmission) {
      // Update existing submission
      const { error } = await supabase
        .from('submissions')
        .update({
          content: submissionContent,
          submitted_at: new Date().toISOString()
        })
        .eq('id', existingSubmission.id);

      if (error) {
        toast({ variant: 'destructive', title: 'Error updating submission' });
      } else {
        toast({ title: 'Submission updated!' });
      }
    } else {
      // Create new submission
      const { error } = await supabase
        .from('submissions')
        .insert({
          assignment_id: selectedAssignment.id,
          student_id: profile.id,
          content: submissionContent
        });

      if (error) {
        toast({ variant: 'destructive', title: 'Error submitting assignment' });
        console.error(error);
      } else {
        toast({ title: 'Assignment submitted!' });
      }
    }

    setSubmitting(false);
    setSubmissionDialogOpen(false);
    setSelectedAssignment(null);
    setSubmissionContent('');
    fetchData();
  };

  const getSubjectName = (subjectId: string | null) => {
    if (!subjectId) return 'General';
    return subjects.find(s => s.id === subjectId)?.name || 'Unknown';
  };

  const getSubmission = (assignmentId: string) => {
    return submissions.find(s => s.assignment_id === assignmentId);
  };

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
      const submission = getSubmission(a.id);
      return dueDate < now && !submission;
    });
  };

  const calculateAverageGrade = () => {
    const gradedSubmissions = submissions.filter(s => s.grade !== null);
    if (gradedSubmissions.length === 0) return null;
    const total = gradedSubmissions.reduce((sum, s) => sum + (s.grade || 0), 0);
    return Math.round(total / gradedSubmissions.length);
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
  const averageGrade = calculateAverageGrade();

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
                <p className="text-3xl font-bold text-primary">{averageGrade ?? '--'}</p>
                <p className="text-xs text-muted-foreground">Average Grade</p>
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

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Subjects</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{subjects.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Materials</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{lessonPlans.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Assignments</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{assignments.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Announcements</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{announcements.length}</p>
            </CardContent>
          </Card>
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

          {/* Materials Tab */}
          <TabsContent value="materials" className="space-y-4">
            <h2 className="text-lg font-semibold">Course Materials</h2>

            {loadingData ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : lessonPlans.length === 0 ? (
              <div className="glass-effect rounded-xl p-8 text-center">
                <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-semibold mb-2">No Materials Yet</h3>
                <p className="text-sm text-muted-foreground">
                  Your teachers haven't published any materials yet
                </p>
              </div>
            ) : (
              <div className="grid gap-4">
                {lessonPlans.map((lesson) => (
                  <div key={lesson.id} className="glass-effect rounded-xl p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{lesson.title}</h3>
                          <Badge variant="outline">{getSubjectName(lesson.subject_id)}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Published {lesson.publish_date 
                            ? new Date(lesson.publish_date).toLocaleDateString()
                            : 'Recently'}
                        </p>
                        {lesson.description && (
                          <p className="mt-2 text-sm line-clamp-2">{lesson.description}</p>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedLesson(lesson);
                          setLessonDialogOpen(true);
                        }}
                      >
                        View
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Lesson View Dialog */}
            <Dialog open={lessonDialogOpen} onOpenChange={setLessonDialogOpen}>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{selectedLesson?.title}</DialogTitle>
                  <DialogDescription>
                    {getSubjectName(selectedLesson?.subject_id || null)}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {selectedLesson?.description && (
                    <div>
                      <h4 className="font-medium mb-2">Description</h4>
                      <p className="text-muted-foreground">{selectedLesson.description}</p>
                    </div>
                  )}
                  {selectedLesson?.objectives && (
                    <div>
                      <h4 className="font-medium mb-2">Learning Objectives</h4>
                      <p className="text-muted-foreground whitespace-pre-wrap">{selectedLesson.objectives}</p>
                    </div>
                  )}
                  {selectedLesson?.notes && (
                    <div>
                      <h4 className="font-medium mb-2">Notes</h4>
                      <p className="text-muted-foreground whitespace-pre-wrap">{selectedLesson.notes}</p>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Assignments Tab */}
          <TabsContent value="assignments" className="space-y-4">
            <h2 className="text-lg font-semibold">Assignments</h2>

            <div className="glass-effect rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Assignment</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Points</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No assignments yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    assignments.map((assignment) => {
                      const submission = getSubmission(assignment.id);
                      const isOverdue = assignment.due_date && new Date(assignment.due_date) < new Date();
                      const isGraded = submission?.grade !== null;

                      return (
                        <TableRow key={assignment.id}>
                          <TableCell className="font-medium">{assignment.title}</TableCell>
                          <TableCell>{getSubjectName(assignment.subject_id)}</TableCell>
                          <TableCell>
                            {assignment.due_date ? (
                              <span className={isOverdue && !submission ? 'text-destructive' : ''}>
                                {new Date(assignment.due_date).toLocaleDateString()}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">No due date</span>
                            )}
                          </TableCell>
                          <TableCell>{assignment.points}</TableCell>
                          <TableCell>
                            {isGraded ? (
                              <Badge className="bg-green-500">
                                Graded: {submission.grade}/{assignment.points}
                              </Badge>
                            ) : submission ? (
                              <Badge variant="secondary">Submitted</Badge>
                            ) : isOverdue ? (
                              <Badge variant="destructive">Overdue</Badge>
                            ) : (
                              <Badge variant="outline">Pending</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {!isGraded && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedAssignment(assignment);
                                  setSubmissionContent(submission?.content || '');
                                  setSubmissionDialogOpen(true);
                                }}
                              >
                                {submission ? 'Edit' : 'Submit'}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Submission Dialog */}
            <Dialog open={submissionDialogOpen} onOpenChange={setSubmissionDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{selectedAssignment?.title}</DialogTitle>
                  <DialogDescription>
                    {selectedAssignment?.description || 'Submit your work below'}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Points</span>
                    <span className="font-medium">{selectedAssignment?.points}</span>
                  </div>
                  {selectedAssignment?.due_date && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Due Date</span>
                      <span className="font-medium">
                        {new Date(selectedAssignment.due_date).toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="submission">Your Answer</Label>
                    <Textarea
                      id="submission"
                      value={submissionContent}
                      onChange={(e) => setSubmissionContent(e.target.value)}
                      placeholder="Type your answer here..."
                      rows={6}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setSubmissionDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={submitAssignment} disabled={submitting || !submissionContent.trim()}>
                    {submitting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    Submit
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Grades Tab */}
          <TabsContent value="grades" className="space-y-4">
            <h2 className="text-lg font-semibold">My Grades</h2>

            <div className="glass-effect rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Assignment</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Feedback</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.filter(s => s.grade !== null).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No grades yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    submissions
                      .filter(s => s.grade !== null)
                      .map((submission) => {
                        const assignment = assignments.find(a => a.id === submission.assignment_id);
                        return (
                          <TableRow key={submission.id}>
                            <TableCell className="font-medium">
                              {assignment?.title || 'Unknown'}
                            </TableCell>
                            <TableCell>
                              {new Date(submission.submitted_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              <Badge className="bg-green-500">
                                {submission.grade}/{assignment?.points || 100}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-xs truncate">
                              {submission.feedback || '-'}
                            </TableCell>
                          </TableRow>
                        );
                      })
                  )}
                </TableBody>
              </Table>
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
