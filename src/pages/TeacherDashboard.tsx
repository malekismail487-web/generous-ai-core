import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  getCurrentUser,
  createSubject,
  getTeacherSubjects,
  createLessonPlan,
  getTeacherLessonPlans,
  createAssignment,
  getTeacherAssignments,
  createExam,
  getTeacherExams,
  getAnnouncements,
  uploadFile
} from '@/lib/educationApi';
import type { Profile, Subject, LessonPlan, Assignment, Exam, Announcement } from '@/types/education';

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<Profile | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [lessonPlans, setLessonPlans] = useState<LessonPlan[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAccess();
  }, []);

  const checkAccess = async () => {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== 'teacher' || !currentUser.is_active) {
      navigate('/access-denied');
      return;
    }
    setUser(currentUser);
    loadData(currentUser);
  };

  const loadData = async (currentUser: Profile) => {
    try {
      const [subjectsData, plansData, assignmentsData, examsData, announcementsData] = await Promise.all([
        getTeacherSubjects(currentUser.id),
        getTeacherLessonPlans(currentUser.id),
        getTeacherAssignments(currentUser.id),
        getTeacherExams(currentUser.id),
        getAnnouncements(currentUser.school_id!)
      ]);
      setSubjects(subjectsData);
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

  const handleCreateSubject = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      await createSubject(formData.get('name') as string, user!.id, user!.school_id!);
      toast({ title: 'Success', description: 'Subject created' });
      e.currentTarget.reset();
      loadData(user!);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleCreateLesson = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      await createLessonPlan({
        subject_id: formData.get('subject_id') as string,
        title: formData.get('title') as string,
        description: formData.get('description') as string,
        content_json: {
          objectives: formData.get('objectives') as string,
          notes: formData.get('notes') as string
        },
        files: [],
        publish_date: new Date().toISOString(),
        classes: ['default']
      }, user!.id, user!.school_id!);
      toast({ title: 'Success', description: 'Lesson plan created' });
      e.currentTarget.reset();
      loadData(user!);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      await createAssignment({
        class_id: 'default',
        title: formData.get('title') as string,
        description: formData.get('description') as string,
        files: [],
        due_date: new Date(formData.get('due_date') as string).toISOString(),
        points: parseInt(formData.get('points') as string)
      }, user!.id, user!.school_id!);
      toast({ title: 'Success', description: 'Assignment created' });
      e.currentTarget.reset();
      loadData(user!);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  if (loading) {
    return <div className=\"min-h-screen flex items-center justify-center\"><div className=\"animate-spin rounded-full h-12 w-12 border-b-2 border-primary\"></div></div>;
  }

  return (
    <div className=\"min-h-screen bg-background\">\n      <header className=\"border-b bg-card\">\n        <div className=\"max-w-7xl mx-auto px-4 py-4 flex justify-between items-center\">\n          <div>\n            <h1 className=\"text-2xl font-bold\">Study Bright - Teacher Portal</h1>\n            <p className=\"text-sm text-muted-foreground\">{user?.name} \u2022 Powered by Lumina AI</p>\n          </div>\n          <Button onClick={() => navigate('/')} variant=\"outline\">Dashboard</Button>\n        </div>\n      </header>\n\n      <main className=\"max-w-7xl mx-auto px-4 py-8\">\n        <Tabs defaultValue=\"subjects\" className=\"space-y-6\">\n          <TabsList>\n            <TabsTrigger value=\"subjects\">Subjects</TabsTrigger>\n            <TabsTrigger value=\"lessons\">Course Materials</TabsTrigger>\n            <TabsTrigger value=\"assignments\">Assignments</TabsTrigger>\n            <TabsTrigger value=\"announcements\">Announcements</TabsTrigger>\n          </TabsList>\n\n          <TabsContent value=\"subjects\">\n            <div className=\"bg-card p-6 rounded-lg border\">\n              <h2 className=\"text-xl font-bold mb-4\">My Subjects</h2>\n              <form onSubmit={handleCreateSubject} className=\"mb-6 flex gap-4\">\n                <Input name=\"name\" placeholder=\"Subject name\" required />\n                <Button type=\"submit\">Add Subject</Button>\n              </form>\n              <div className=\"grid grid-cols-1 md:grid-cols-3 gap-4\">\n                {subjects.map((subject) => (\n                  <div key={subject.id} className=\"border rounded-lg p-4 hover:border-primary transition\">\n                    <h3 className=\"text-lg font-bold\">{subject.name}</h3>\n                    <p className=\"text-sm text-muted-foreground mt-2\">Created: {new Date(subject.created_at).toLocaleDateString()}</p>\n                  </div>\n                ))}\n              </div>\n            </div>\n          </TabsContent>\n\n          <TabsContent value=\"lessons\">\n            <div className=\"bg-card p-6 rounded-lg border\">\n              <h2 className=\"text-xl font-bold mb-4\">Create Lesson Plan</h2>\n              <form onSubmit={handleCreateLesson} className=\"space-y-4 mb-8\">\n                <div className=\"grid grid-cols-1 md:grid-cols-2 gap-4\">\n                  <div>\n                    <Label>Subject</Label>\n                    <select name=\"subject_id\" required className=\"w-full px-3 py-2 border rounded-md bg-background\">\n                      <option value=\"\">Select Subject</option>\n                      {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}\n                    </select>\n                  </div>\n                  <div>\n                    <Label>Title</Label>\n                    <Input name=\"title\" required />\n                  </div>\n                </div>\n                <div>\n                  <Label>Description</Label>\n                  <textarea name=\"description\" className=\"w-full px-3 py-2 border rounded-md bg-background\" rows={2} required />\n                </div>\n                <div>\n                  <Label>Learning Objectives</Label>\n                  <textarea name=\"objectives\" className=\"w-full px-3 py-2 border rounded-md bg-background\" rows={2} />\n                </div>\n                <div>\n                  <Label>Notes (visible to students)</Label>\n                  <textarea name=\"notes\" className=\"w-full px-3 py-2 border rounded-md bg-background\" rows={2} />\n                </div>\n                <Button type=\"submit\">Create Lesson Plan</Button>\n              </form>\n\n              <h3 className=\"text-lg font-semibold mb-3\">My Lesson Plans</h3>\n              <div className=\"space-y-4\">\n                {lessonPlans.map((plan) => (\n                  <div key={plan.id} className=\"border rounded-lg p-4\">\n                    <h4 className=\"font-bold text-lg\">{plan.title}</h4>\n                    <p className=\"text-muted-foreground mt-2\">{plan.description}</p>\n                    <p className=\"text-sm text-muted-foreground mt-2\">Created: {new Date(plan.created_at).toLocaleString()}</p>\n                  </div>\n                ))}\n              </div>\n            </div>\n          </TabsContent>\n\n          <TabsContent value=\"assignments\">\n            <div className=\"bg-card p-6 rounded-lg border\">\n              <h2 className=\"text-xl font-bold mb-4\">Create Assignment</h2>\n              <form onSubmit={handleCreateAssignment} className=\"space-y-4 mb-8\">\n                <div>\n                  <Label>Title</Label>\n                  <Input name=\"title\" required />\n                </div>\n                <div>\n                  <Label>Description</Label>\n                  <textarea name=\"description\" className=\"w-full px-3 py-2 border rounded-md bg-background\" rows={3} required />\n                </div>\n                <div className=\"grid grid-cols-1 md:grid-cols-2 gap-4\">\n                  <div>\n                    <Label>Due Date</Label>\n                    <Input name=\"due_date\" type=\"datetime-local\" required />\n                  </div>\n                  <div>\n                    <Label>Points</Label>\n                    <Input name=\"points\" type=\"number\" defaultValue=\"100\" required />\n                  </div>\n                </div>\n                <Button type=\"submit\">Create Assignment</Button>\n              </form>\n\n              <h3 className=\"text-lg font-semibold mb-3\">My Assignments</h3>\n              <div className=\"space-y-4\">\n                {assignments.map((assignment) => (\n                  <div key={assignment.id} className=\"border rounded-lg p-4\">\n                    <h4 className=\"font-bold text-lg\">{assignment.title}</h4>\n                    <p className=\"text-muted-foreground mt-2\">{assignment.description}</p>\n                    <div className=\"mt-2 flex gap-4 text-sm text-muted-foreground\">\n                      <span>Due: {new Date(assignment.due_date).toLocaleString()}</span>\n                      <span>Points: {assignment.points}</span>\n                      <span>Submissions: {assignment.submissions.length}</span>\n                    </div>\n                  </div>\n                ))}\n              </div>\n            </div>\n          </TabsContent>\n\n          <TabsContent value=\"announcements\">\n            <div className=\"bg-card p-6 rounded-lg border\">\n              <h2 className=\"text-xl font-bold mb-4\">School Announcements</h2>\n              <div className=\"space-y-4\">\n                {announcements.map((ann) => (\n                  <div key={ann.id} className=\"border rounded-lg p-4\">\n                    <h3 className=\"font-bold text-lg\">{ann.title}</h3>\n                    <p className=\"text-muted-foreground mt-2\">{ann.body}</p>\n                    <p className=\"text-sm text-muted-foreground mt-2\">{new Date(ann.created_at).toLocaleString()}</p>\n                  </div>\n                ))}\n              </div>\n            </div>\n          </TabsContent>\n        </Tabs>\n      </main>\n    </div>\n  );\n}
