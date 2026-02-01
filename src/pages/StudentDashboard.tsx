import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  getCurrentUser,
  getStudentLessonPlans,
  getStudentAssignments,
  getStudentExams,
  submitAssignment,
  getAnnouncements
} from '@/lib/educationApi';
import type { Profile, LessonPlan, Assignment, Exam, Announcement } from '@/types/education';

export default function StudentDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<Profile | null>(null);
  const [lessonPlans, setLessonPlans] = useState<LessonPlan[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [submissionUrl, setSubmissionUrl] = useState('');

  useEffect(() => {
    checkAccess();
  }, []);

  const checkAccess = async () => {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== 'student' || !currentUser.is_active) {
      navigate('/access-denied');
      return;
    }
    setUser(currentUser);
    loadData(currentUser);
  };

  const loadData = async (currentUser: Profile) => {
    try {
      const [plansData, assignmentsData, examsData, announcementsData] = await Promise.all([
        getStudentLessonPlans(currentUser.school_id!),
        getStudentAssignments(currentUser.school_id!),
        getStudentExams(currentUser.school_id!),
        getAnnouncements(currentUser.school_id!)
      ]);
      setLessonPlans(plansData);
      setAssignments(assignmentsData);
      setExams(examsData);
      setAnnouncements(announcementsData);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAssignment = async (assignmentId: string) => {
    if (!submissionUrl) {
      toast({ title: 'Error', description: 'Please enter a file URL', variant: 'destructive' });
      return;
    }
    try {
      await submitAssignment(assignmentId, user!.id, user!.name, submissionUrl);
      toast({ title: 'Success', description: 'Assignment submitted!' });
      setSubmissionUrl('');
      setSubmittingId(null);
      loadData(user!);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const isSubmitted = (assignment: Assignment) => {
    return assignment.submissions.some(sub => sub.student_id === user?.id);
  };

  const getSubmission = (assignment: Assignment) => {
    return assignment.submissions.find(sub => sub.student_id === user?.id);
  };

  const getUpcomingDeadlines = () => {
    const now = new Date();
    return assignments
      .filter(a => new Date(a.due_date) > now && !isSubmitted(a))
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
      .slice(0, 3);
  };

  if (loading) {
    return <div className=\"min-h-screen flex items-center justify-center\"><div className=\"animate-spin rounded-full h-12 w-12 border-b-2 border-primary\"></div></div>;
  }

  const upcomingDeadlines = getUpcomingDeadlines();

  return (
    <div className=\"min-h-screen bg-background\">
      <header className=\"border-b bg-card\">
        <div className=\"max-w-7xl mx-auto px-4 py-4 flex justify-between items-center\">
          <div>
            <h1 className=\"text-2xl font-bold\">Study Bright - Student Portal</h1>
            <p className=\"text-sm text-muted-foreground\">{user?.name} | Grade: {user?.grade || 'N/A'} \u2022 Powered by Lumina AI</p>
          </div>
          <Button onClick={() => navigate('/')} variant=\"outline\">Dashboard</Button>
        </div>
      </header>

      <main className=\"max-w-7xl mx-auto px-4 py-8\">
        <div className=\"bg-card rounded-lg border p-6 mb-6\">
          <h2 className=\"text-2xl font-bold mb-4\">Welcome back, {user?.name}! \ud83d\udc4b</h2>
          {upcomingDeadlines.length > 0 ? (
            <div className=\"bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 p-4\">
              <h3 className=\"font-semibold mb-2\">\u23f0 Upcoming Deadlines</h3>
              <ul className=\"space-y-2\">
                {upcomingDeadlines.map((assignment) => (
                  <li key={assignment.id} className=\"text-sm\">
                    <strong>{assignment.title}</strong> - Due: {new Date(assignment.due_date).toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className=\"bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 p-4\">
              <p>\u2705 All caught up! No pending assignments.</p>
            </div>
          )}
        </div>

        <Tabs defaultValue=\"materials\" className=\"space-y-6\">
          <TabsList>
            <TabsTrigger value=\"materials\">Course Materials</TabsTrigger>
            <TabsTrigger value=\"assignments\">Assignments</TabsTrigger>
            <TabsTrigger value=\"exams\">Exams</TabsTrigger>
            <TabsTrigger value=\"announcements\">Announcements</TabsTrigger>
          </TabsList>

          <TabsContent value=\"materials\">
            <div className=\"bg-card p-6 rounded-lg border\">
              <h2 className=\"text-xl font-bold mb-4\">Course Materials</h2>
              <div className=\"space-y-4\">
                {lessonPlans.length === 0 ? (
                  <p className=\"text-muted-foreground text-center py-8\">No materials available yet.</p>
                ) : (
                  lessonPlans.map((plan) => (
                    <div key={plan.id} className=\"border rounded-lg p-4\">
                      <h3 className=\"font-bold text-lg text-primary\">{plan.title}</h3>
                      <p className=\"text-muted-foreground mt-2\">{plan.description}</p>
                      {plan.content_json?.objectives && (
                        <div className=\"mt-3\">
                          <strong className=\"text-sm\">Objectives:</strong>
                          <p className=\"text-sm text-muted-foreground\">{plan.content_json.objectives}</p>
                        </div>
                      )}
                      {plan.content_json?.notes && (
                        <div className=\"mt-3 bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded\">
                          <strong className=\"text-sm\">Notes:</strong>
                          <p className=\"text-sm\">{plan.content_json.notes}</p>
                        </div>
                      )}
                      <p className=\"text-sm text-muted-foreground mt-3\">Published: {new Date(plan.publish_date).toLocaleString()}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value=\"assignments\">
            <div className=\"bg-card p-6 rounded-lg border\">
              <h2 className=\"text-xl font-bold mb-4\">Assignments</h2>
              <div className=\"space-y-4\">
                {assignments.length === 0 ? (
                  <p className=\"text-muted-foreground text-center py-8\">No assignments yet.</p>
                ) : (
                  assignments.map((assignment) => {
                    const submitted = isSubmitted(assignment);
                    const submission = getSubmission(assignment);
                    const isOverdue = new Date(assignment.due_date) < new Date();

                    return (
                      <div key={assignment.id} className={`border rounded-lg p-4 ${
                        isOverdue && !submitted ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : ''
                      }`}>
                        <div className=\"flex justify-between items-start\">
                          <div className=\"flex-1\">
                            <h3 className=\"font-bold text-lg\">{assignment.title}</h3>
                            <p className=\"text-muted-foreground mt-2\">{assignment.description}</p>
                            <div className=\"mt-2 flex gap-4 text-sm text-muted-foreground\">
                              <span className={isOverdue && !submitted ? 'text-red-600 font-bold' : ''}>
                                Due: {new Date(assignment.due_date).toLocaleString()}
                              </span>
                              <span>Points: {assignment.points}</span>
                            </div>
                          </div>
                          <div>
                            {submitted ? (
                              <span className=\"px-3 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full text-sm font-semibold\">
                                \u2713 Submitted
                              </span>
                            ) : (
                              <span className=\"px-3 py-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 rounded-full text-sm font-semibold\">
                                Pending
                              </span>
                            )}
                          </div>
                        </div>

                        {submitted ? (
                          <div className=\"mt-4 bg-muted p-3 rounded\">
                            <p className=\"text-sm\">
                              <strong>Your submission:</strong> {submission?.file_url}
                            </p>
                            <p className=\"text-sm text-muted-foreground mt-1\">
                              Submitted on: {new Date(submission!.submitted_at).toLocaleString()}
                            </p>
                            {submission?.grade && (
                              <p className=\"text-sm text-green-600 mt-1 font-semibold\">
                                Grade: {submission.grade}/{assignment.points}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className=\"mt-4\">
                            {submittingId === assignment.id ? (
                              <div className=\"flex gap-2\">
                                <Input
                                  placeholder=\"Enter file URL\"
                                  value={submissionUrl}
                                  onChange={(e) => setSubmissionUrl(e.target.value)}
                                />
                                <Button onClick={() => handleSubmitAssignment(assignment.id)}>Submit</Button>
                                <Button onClick={() => { setSubmittingId(null); setSubmissionUrl(''); }} variant=\"outline\">Cancel</Button>
                              </div>
                            ) : (
                              <Button onClick={() => setSubmittingId(assignment.id)}>Submit Assignment</Button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value=\"exams\">
            <div className=\"bg-card p-6 rounded-lg border\">
              <h2 className=\"text-xl font-bold mb-4\">Scheduled Exams</h2>
              <div className=\"space-y-4\">
                {exams.length === 0 ? (
                  <p className=\"text-muted-foreground text-center py-8\">No exams scheduled.</p>
                ) : (
                  exams.map((exam) => (
                    <div key={exam.id} className=\"border rounded-lg p-4\">
                      <h3 className=\"font-bold text-lg\">{exam.title}</h3>
                      <p className=\"text-muted-foreground mt-2\">{exam.description}</p>
                      <div className=\"mt-2 flex gap-4 text-sm text-muted-foreground\">
                        <span>Scheduled: {new Date(exam.scheduled_date).toLocaleString()}</span>
                        <span>Duration: {exam.duration_minutes} minutes</span>
                        <span>Total Points: {exam.total_points}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value=\"announcements\">
            <div className=\"bg-card p-6 rounded-lg border\">
              <h2 className=\"text-xl font-bold mb-4\">School Announcements</h2>
              <div className=\"space-y-4\">
                {announcements.length === 0 ? (
                  <p className=\"text-muted-foreground text-center py-8\">No announcements.</p>
                ) : (
                  announcements.map((ann) => (
                    <div key={ann.id} className=\"border rounded-lg p-4\">
                      <h3 className=\"font-bold text-lg\">{ann.title}</h3>
                      <p className=\"text-muted-foreground mt-2\">{ann.body}</p>
                      <p className=\"text-sm text-muted-foreground mt-2\">{new Date(ann.created_at).toLocaleString()}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
