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
  Calendar,
  Megaphone,
  Plus,
  Trash2,
  Edit,
  Users,
  Award,
  Eye
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
  is_published: boolean;
  is_shareable: boolean;
  objectives: string | null;
  notes: string | null;
  publish_date: string | null;
  created_at: string;
}

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  subject_id: string | null;
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
  const { signOut } = useAuth();
  const { toast } = useToast();

  // State
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [lessonPlans, setLessonPlans] = useState<LessonPlan[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Form states
  const [lessonDialogOpen, setLessonDialogOpen] = useState(false);
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [gradingDialogOpen, setGradingDialogOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);

  // Lesson Plan form
  const [newLessonTitle, setNewLessonTitle] = useState('');
  const [newLessonDescription, setNewLessonDescription] = useState('');
  const [newLessonSubject, setNewLessonSubject] = useState('');
  const [newLessonObjectives, setNewLessonObjectives] = useState('');
  const [newLessonNotes, setNewLessonNotes] = useState('');
  const [newLessonPublished, setNewLessonPublished] = useState(false);
  const [newLessonShareable, setNewLessonShareable] = useState(false);

  // Assignment form
  const [newAssignmentTitle, setNewAssignmentTitle] = useState('');
  const [newAssignmentDescription, setNewAssignmentDescription] = useState('');
  const [newAssignmentSubject, setNewAssignmentSubject] = useState('');
  const [newAssignmentDueDate, setNewAssignmentDueDate] = useState('');
  const [newAssignmentPoints, setNewAssignmentPoints] = useState('100');

  // Grading form
  const [gradeValue, setGradeValue] = useState('');
  const [feedbackValue, setFeedbackValue] = useState('');

  const fetchData = useCallback(async () => {
    if (!school || !profile) return;
    setLoadingData(true);

    // Fetch subjects
    const { data: subjectsData } = await supabase
      .from('subjects')
      .select('*')
      .eq('school_id', school.id);
    setSubjects((subjectsData || []) as Subject[]);

    // Fetch lesson plans
    const { data: lessonsData } = await supabase
      .from('lesson_plans')
      .select('*')
      .eq('teacher_id', profile.id)
      .order('created_at', { ascending: false });
    setLessonPlans((lessonsData || []) as LessonPlan[]);

    // Fetch assignments
    const { data: assignmentsData } = await supabase
      .from('assignments')
      .select('*')
      .eq('teacher_id', profile.id)
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
    }

    // Fetch announcements
    const { data: announcementsData } = await supabase
      .from('announcements')
      .select('*')
      .eq('school_id', school.id)
      .order('created_at', { ascending: false });
    setAnnouncements((announcementsData || []) as Announcement[]);

    setLoadingData(false);
  }, [school, profile]);

  useEffect(() => {
    if (isTeacher && school && profile) {
      fetchData();
    }
  }, [isTeacher, school, profile, fetchData]);

  const createLessonPlan = async () => {
    if (!school || !profile || !newLessonTitle || !newLessonSubject) {
      toast({ variant: 'destructive', title: 'Please fill required fields' });
      return;
    }

    const { error } = await supabase
      .from('lesson_plans')
      .insert({
        teacher_id: profile.id,
        school_id: school.id,
        subject_id: newLessonSubject,
        title: newLessonTitle,
        description: newLessonDescription || null,
        objectives: newLessonObjectives || null,
        notes: newLessonNotes || null,
        is_published: newLessonPublished,
        is_shareable: newLessonShareable,
        publish_date: newLessonPublished ? new Date().toISOString() : null
      });

    if (error) {
      toast({ variant: 'destructive', title: 'Error creating lesson plan' });
      console.error(error);
    } else {
      toast({ title: 'Lesson plan created!' });
      resetLessonForm();
      setLessonDialogOpen(false);
      fetchData();
    }
  };

  const resetLessonForm = () => {
    setNewLessonTitle('');
    setNewLessonDescription('');
    setNewLessonSubject('');
    setNewLessonObjectives('');
    setNewLessonNotes('');
    setNewLessonPublished(false);
    setNewLessonShareable(false);
  };

  const deleteLessonPlan = async (lessonId: string) => {
    const { error } = await supabase
      .from('lesson_plans')
      .delete()
      .eq('id', lessonId);

    if (error) {
      toast({ variant: 'destructive', title: 'Error deleting lesson plan' });
    } else {
      toast({ title: 'Lesson plan deleted' });
      fetchData();
    }
  };

  const toggleLessonPublished = async (lessonId: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('lesson_plans')
      .update({ 
        is_published: !currentStatus,
        publish_date: !currentStatus ? new Date().toISOString() : null
      })
      .eq('id', lessonId);

    if (error) {
      toast({ variant: 'destructive', title: 'Error updating lesson plan' });
    } else {
      fetchData();
    }
  };

  const createAssignment = async () => {
    if (!school || !profile || !newAssignmentTitle) {
      toast({ variant: 'destructive', title: 'Please fill required fields' });
      return;
    }

    const { error } = await supabase
      .from('assignments')
      .insert({
        teacher_id: profile.id,
        school_id: school.id,
        subject_id: newAssignmentSubject || null,
        subject: newAssignmentSubject ? subjects.find(s => s.id === newAssignmentSubject)?.name || 'General' : 'General',
        title: newAssignmentTitle,
        description: newAssignmentDescription || null,
        due_date: newAssignmentDueDate || null,
        points: parseInt(newAssignmentPoints) || 100,
        grade_level: profile.grade_level || 'All'
      });

    if (error) {
      toast({ variant: 'destructive', title: 'Error creating assignment' });
      console.error(error);
    } else {
      toast({ title: 'Assignment created!' });
      resetAssignmentForm();
      setAssignmentDialogOpen(false);
      fetchData();
    }
  };

  const resetAssignmentForm = () => {
    setNewAssignmentTitle('');
    setNewAssignmentDescription('');
    setNewAssignmentSubject('');
    setNewAssignmentDueDate('');
    setNewAssignmentPoints('100');
  };

  const deleteAssignment = async (assignmentId: string) => {
    const { error } = await supabase
      .from('assignments')
      .delete()
      .eq('id', assignmentId);

    if (error) {
      toast({ variant: 'destructive', title: 'Error deleting assignment' });
    } else {
      toast({ title: 'Assignment deleted' });
      fetchData();
    }
  };

  const gradeSubmission = async () => {
    if (!selectedSubmission || !profile) return;

    const { error } = await supabase
      .from('submissions')
      .update({
        grade: parseInt(gradeValue) || null,
        feedback: feedbackValue || null,
        graded_at: new Date().toISOString(),
        graded_by: profile.id
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

  const getSubjectName = (subjectId: string | null) => {
    if (!subjectId) return 'General';
    return subjects.find(s => s.id === subjectId)?.name || 'Unknown';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isTeacher || !school || !profile?.is_active) {
    return <Navigate to="/" replace />;
  }

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
              <h1 className="text-xl font-bold">Teacher Dashboard</h1>
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
              <CardTitle className="text-sm text-muted-foreground">Lesson Plans</CardTitle>
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
              <CardTitle className="text-sm text-muted-foreground">Pending Grading</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-amber-500">
                {submissions.filter(s => s.grade === null).length}
              </p>
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

        <Tabs defaultValue="lessons" className="space-y-6">
          <TabsList className="grid grid-cols-5 w-full max-w-2xl">
            <TabsTrigger value="lessons" className="gap-2">
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline">Lessons</span>
            </TabsTrigger>
            <TabsTrigger value="assignments" className="gap-2">
              <ClipboardList className="w-4 h-4" />
              <span className="hidden sm:inline">Assign</span>
            </TabsTrigger>
            <TabsTrigger value="grading" className="gap-2">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Grade</span>
              {submissions.filter(s => s.grade === null).length > 0 && (
                <Badge variant="destructive" className="ml-1">
                  {submissions.filter(s => s.grade === null).length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="insights" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">Insights</span>
            </TabsTrigger>
            <TabsTrigger value="announcements" className="gap-2">
              <Megaphone className="w-4 h-4" />
              <span className="hidden sm:inline">News</span>
            </TabsTrigger>
          </TabsList>

          {/* Lesson Plans Tab */}
          <TabsContent value="lessons" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Lesson Plans</h2>
              <Dialog open={lessonDialogOpen} onOpenChange={setLessonDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="w-4 h-4" />
                    Add Lesson Plan
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Create Lesson Plan</DialogTitle>
                    <DialogDescription>
                      Add a new lesson plan for your students
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                    <div className="space-y-2">
                      <Label htmlFor="lesson-title">Title *</Label>
                      <Input
                        id="lesson-title"
                        value={newLessonTitle}
                        onChange={(e) => setNewLessonTitle(e.target.value)}
                        placeholder="Lesson title"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lesson-subject">Subject *</Label>
                      <Select value={newLessonSubject} onValueChange={setNewLessonSubject}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select subject" />
                        </SelectTrigger>
                        <SelectContent>
                          {subjects.map((subject) => (
                            <SelectItem key={subject.id} value={subject.id}>
                              {subject.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lesson-description">Description</Label>
                      <Textarea
                        id="lesson-description"
                        value={newLessonDescription}
                        onChange={(e) => setNewLessonDescription(e.target.value)}
                        placeholder="Lesson description"
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lesson-objectives">Objectives</Label>
                      <Textarea
                        id="lesson-objectives"
                        value={newLessonObjectives}
                        onChange={(e) => setNewLessonObjectives(e.target.value)}
                        placeholder="Learning objectives"
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lesson-notes">Notes for Students</Label>
                      <Textarea
                        id="lesson-notes"
                        value={newLessonNotes}
                        onChange={(e) => setNewLessonNotes(e.target.value)}
                        placeholder="Notes visible to students"
                        rows={3}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="lesson-published">Publish immediately</Label>
                      <Switch
                        id="lesson-published"
                        checked={newLessonPublished}
                        onCheckedChange={setNewLessonPublished}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="lesson-shareable">Allow other teachers to copy</Label>
                      <Switch
                        id="lesson-shareable"
                        checked={newLessonShareable}
                        onCheckedChange={setNewLessonShareable}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setLessonDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={createLessonPlan}>Create Lesson Plan</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {loadingData ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : lessonPlans.length === 0 ? (
              <div className="glass-effect rounded-xl p-8 text-center">
                <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-semibold mb-2">No Lesson Plans Yet</h3>
                <p className="text-sm text-muted-foreground">Create your first lesson plan to get started</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {lessonPlans.map((lesson) => (
                  <div key={lesson.id} className="glass-effect rounded-xl p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{lesson.title}</h3>
                          {lesson.is_published ? (
                            <Badge className="bg-green-500">Published</Badge>
                          ) : (
                            <Badge variant="secondary">Draft</Badge>
                          )}
                          {lesson.is_shareable && (
                            <Badge variant="outline">Shareable</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {getSubjectName(lesson.subject_id)} • Created {new Date(lesson.created_at).toLocaleDateString()}
                        </p>
                        {lesson.description && (
                          <p className="mt-2 text-sm">{lesson.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleLessonPublished(lesson.id, lesson.is_published)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteLessonPlan(lesson.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Assignments Tab */}
          <TabsContent value="assignments" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Assignments</h2>
              <Dialog open={assignmentDialogOpen} onOpenChange={setAssignmentDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="w-4 h-4" />
                    Create Assignment
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Assignment</DialogTitle>
                    <DialogDescription>
                      Create a new assignment for your students
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="assignment-title">Title *</Label>
                      <Input
                        id="assignment-title"
                        value={newAssignmentTitle}
                        onChange={(e) => setNewAssignmentTitle(e.target.value)}
                        placeholder="Assignment title"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="assignment-subject">Subject</Label>
                      <Select value={newAssignmentSubject} onValueChange={setNewAssignmentSubject}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select subject" />
                        </SelectTrigger>
                        <SelectContent>
                          {subjects.map((subject) => (
                            <SelectItem key={subject.id} value={subject.id}>
                              {subject.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="assignment-description">Description</Label>
                      <Textarea
                        id="assignment-description"
                        value={newAssignmentDescription}
                        onChange={(e) => setNewAssignmentDescription(e.target.value)}
                        placeholder="Assignment instructions"
                        rows={4}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="assignment-due">Due Date</Label>
                        <Input
                          id="assignment-due"
                          type="datetime-local"
                          value={newAssignmentDueDate}
                          onChange={(e) => setNewAssignmentDueDate(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="assignment-points">Points</Label>
                        <Input
                          id="assignment-points"
                          type="number"
                          value={newAssignmentPoints}
                          onChange={(e) => setNewAssignmentPoints(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAssignmentDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={createAssignment}>Create Assignment</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="glass-effect rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Points</TableHead>
                    <TableHead>Submissions</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
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
                      const submissionCount = submissions.filter(s => s.assignment_id === assignment.id).length;
                      const isOverdue = assignment.due_date && new Date(assignment.due_date) < new Date();
                      return (
                        <TableRow key={assignment.id}>
                          <TableCell className="font-medium">{assignment.title}</TableCell>
                          <TableCell>{getSubjectName(assignment.subject_id)}</TableCell>
                          <TableCell>
                            {assignment.due_date ? (
                              <span className={isOverdue ? 'text-destructive' : ''}>
                                {new Date(assignment.due_date).toLocaleDateString()}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">No due date</span>
                            )}
                          </TableCell>
                          <TableCell>{assignment.points}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{submissionCount}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteAssignment(assignment.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Grading Tab */}
          <TabsContent value="grading" className="space-y-4">
            <h2 className="text-lg font-semibold">Student Submissions</h2>

            <div className="glass-effect rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Assignment</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No submissions yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    submissions.map((submission) => {
                      const assignment = assignments.find(a => a.id === submission.assignment_id);
                      return (
                        <TableRow key={submission.id}>
                          <TableCell className="font-medium">{assignment?.title || 'Unknown'}</TableCell>
                          <TableCell>
                            {new Date(submission.submitted_at).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            {submission.grade !== null ? (
                              <Badge className="bg-green-500">{submission.grade}/{assignment?.points || 100}</Badge>
                            ) : (
                              <Badge variant="destructive">Not graded</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedSubmission(submission);
                                setGradeValue(submission.grade?.toString() || '');
                                setFeedbackValue(submission.feedback || '');
                                setGradingDialogOpen(true);
                              }}
                            >
                              {submission.grade !== null ? 'Edit Grade' : 'Grade'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Grading Dialog */}
            <Dialog open={gradingDialogOpen} onOpenChange={setGradingDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Grade Submission</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {selectedSubmission?.content && (
                    <div className="space-y-2">
                      <Label>Student's Answer</Label>
                      <div className="p-3 bg-muted rounded-lg text-sm">
                        {selectedSubmission.content}
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="grade">Grade</Label>
                    <Input
                      id="grade"
                      type="number"
                      value={gradeValue}
                      onChange={(e) => setGradeValue(e.target.value)}
                      placeholder="Enter grade"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="feedback">Feedback</Label>
                    <Textarea
                      id="feedback"
                      value={feedbackValue}
                      onChange={(e) => setFeedbackValue(e.target.value)}
                      placeholder="Feedback for student"
                      rows={4}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setGradingDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={gradeSubmission}>Save Grade</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Insights Tab */}
          <TabsContent value="insights" className="space-y-4">
            <h2 className="text-lg font-semibold">Dashboard Insights</h2>
            
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Submission Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {assignments.length > 0 
                      ? Math.round((submissions.length / assignments.length) * 100)
                      : 0}%
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {submissions.length} submissions across {assignments.length} assignments
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Average Grade</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {submissions.filter(s => s.grade !== null).length > 0
                      ? Math.round(
                          submissions
                            .filter(s => s.grade !== null)
                            .reduce((sum, s) => sum + (s.grade || 0), 0) /
                          submissions.filter(s => s.grade !== null).length
                        )
                      : 'N/A'}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Based on {submissions.filter(s => s.grade !== null).length} graded submissions
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Published Content</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {lessonPlans.filter(l => l.is_published).length}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    of {lessonPlans.length} lesson plans are published
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Pending Tasks</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-amber-500">
                    {submissions.filter(s => s.grade === null).length}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    submissions awaiting grading
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Announcements Tab */}
          <TabsContent value="announcements" className="space-y-4">
            <h2 className="text-lg font-semibold">School Announcements</h2>

            {announcements.length === 0 ? (
              <div className="glass-effect rounded-xl p-8 text-center">
                <Megaphone className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-semibold mb-2">No Announcements</h3>
                <p className="text-sm text-muted-foreground">
                  Announcements from your school admin will appear here
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
    </div>
  );
}
