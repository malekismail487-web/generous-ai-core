import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Plus,
  Trash2,
  Calendar,
  Users,
  Clock,
  FileText,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Filter
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AssignmentQuestionBuilder } from './AssignmentQuestionBuilder';

// Hardcoded subjects list
const SUBJECTS = [
  { id: 'biology', name: 'Biology', emoji: '🧬', color: 'bg-green-500' },
  { id: 'physics', name: 'Physics', emoji: '⚛️', color: 'bg-blue-500' },
  { id: 'mathematics', name: 'Mathematics', emoji: '📐', color: 'bg-purple-500' },
  { id: 'chemistry', name: 'Chemistry', emoji: '🧪', color: 'bg-orange-500' },
  { id: 'english', name: 'English', emoji: '📚', color: 'bg-red-500' },
  { id: 'social_studies', name: 'Social Studies', emoji: '🌍', color: 'bg-teal-500' },
  { id: 'technology', name: 'Technology', emoji: '💻', color: 'bg-indigo-500' },
  { id: 'arabic', name: 'Arabic', emoji: '🕌', color: 'bg-amber-500' },
];

const GRADES = [
  'All', 'KG1', 'KG2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4',
  'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9',
  'Grade 10', 'Grade 11', 'Grade 12'
];

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  grade_level: string;
  due_date: string | null;
  points: number;
  created_at: string;
  questions_json?: any;
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

interface TeacherAssignmentsProps {
  assignments: Assignment[];
  submissions: Submission[];
  schoolId: string;
  authUserId: string;
  onRefresh: () => void;
}

export function TeacherAssignments({
  assignments,
  submissions,
  schoolId,
  authUserId,
  onRefresh
}: TeacherAssignmentsProps) {
  const { toast } = useToast();
  
  // View state - 'list' or 'create'
  const [view, setView] = useState<'list' | 'create'>('list');
  
  // Filter state
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [filterGrade, setFilterGrade] = useState<string>('all');

  const deleteAssignment = async (assignmentId: string) => {
    const { error } = await supabase
      .from('assignments')
      .delete()
      .eq('id', assignmentId);

    if (error) {
      toast({ variant: 'destructive', title: 'Error deleting assignment' });
    } else {
      toast({ title: 'Assignment deleted' });
      onRefresh();
    }
  };

  const getSubjectInfo = (subjectId: string) => {
    return SUBJECTS.find(s => s.id === subjectId) || { id: subjectId, name: subjectId, emoji: '📄', color: 'bg-gray-500' };
  };

  const getSubmissionStats = (assignmentId: string) => {
    const assignmentSubmissions = submissions.filter(s => s.assignment_id === assignmentId);
    const graded = assignmentSubmissions.filter(s => s.grade !== null).length;
    return { total: assignmentSubmissions.length, graded };
  };

  const getQuestionCount = (assignment: Assignment) => {
    if (Array.isArray(assignment.questions_json)) {
      return assignment.questions_json.length;
    }
    return 0;
  };

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  // Filter assignments
  const filteredAssignments = assignments.filter(a => {
    if (filterSubject !== 'all' && a.subject !== filterSubject) return false;
    if (filterGrade !== 'all' && a.grade_level !== filterGrade) return false;
    return true;
  });

  // Show question builder when creating
  if (view === 'create') {
    return (
      <AssignmentQuestionBuilder
        schoolId={schoolId}
        authUserId={authUserId}
        onBack={() => setView('list')}
        onSuccess={() => {
          setView('list');
          onRefresh();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Create Button and Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Assignments</h2>
          <p className="text-sm text-muted-foreground">
            Create and manage assignments for your students
          </p>
        </div>
        <Button onClick={() => setView('create')} className="gap-2">
          <Plus className="w-4 h-4" />
          Create Assignment
        </Button>
      </div>

      {/* Filters - Classera Style */}
      <div className="flex flex-wrap gap-3 p-4 bg-muted/50 rounded-xl">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters:</span>
        </div>
        <Select value={filterSubject} onValueChange={setFilterSubject}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Subjects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Subjects</SelectItem>
            {SUBJECTS.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.emoji} {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterGrade} onValueChange={setFilterGrade}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All Grades" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Grades</SelectItem>
            {GRADES.map((g) => (
              <SelectItem key={g} value={g}>{g}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Assignments Grid - Classera Card Style */}
      {filteredAssignments.length === 0 ? (
        <div className="glass-effect rounded-xl p-12 text-center">
          <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="text-lg font-semibold mb-2">No Assignments Found</h3>
          <p className="text-muted-foreground mb-4">
            {assignments.length === 0 
              ? "Start by creating your first assignment"
              : "No assignments match your current filters"}
          </p>
          {assignments.length === 0 && (
            <Button onClick={() => setView('create')}>
              <Plus className="w-4 h-4 mr-2" />
              Create First Assignment
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAssignments.map((assignment) => {
            const subjectInfo = getSubjectInfo(assignment.subject);
            const stats = getSubmissionStats(assignment.id);
            const overdue = isOverdue(assignment.due_date);
            const questionCount = getQuestionCount(assignment);

            return (
              <Card 
                key={assignment.id} 
                className="group hover:shadow-lg transition-all duration-300 border-l-4"
                style={{ borderLeftColor: `var(--${subjectInfo.color.replace('bg-', '')})` }}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{subjectInfo.emoji}</span>
                      <Badge variant="outline" className="text-xs">
                        {subjectInfo.name}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-destructive"
                      onClick={() => deleteAssignment(assignment.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <CardTitle className="text-lg line-clamp-2 mt-2">
                    {assignment.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {assignment.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {assignment.description}
                    </p>
                  )}
                  
                  {/* Meta info */}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="gap-1">
                      <Users className="w-3 h-3" />
                      {assignment.grade_level}
                    </Badge>
                    <Badge variant="secondary" className="gap-1">
                      <BookOpen className="w-3 h-3" />
                      {assignment.points} pts
                    </Badge>
                    {questionCount > 0 && (
                      <Badge variant="secondary" className="gap-1">
                        <FileText className="w-3 h-3" />
                        {questionCount} Q
                      </Badge>
                    )}
                  </div>

                  {/* Due date */}
                  {assignment.due_date && (
                    <div className={`flex items-center gap-2 text-sm ${overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {overdue ? (
                        <AlertCircle className="w-4 h-4" />
                      ) : (
                        <Calendar className="w-4 h-4" />
                      )}
                      <span>
                        {overdue ? 'Overdue: ' : 'Due: '}
                        {new Date(assignment.due_date).toLocaleDateString()}
                      </span>
                    </div>
                  )}

                  {/* Submission stats */}
                  <div className="pt-3 border-t flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{stats.total} submitted</span>
                    </div>
                    {stats.total > 0 && (
                      <Badge variant={stats.graded === stats.total ? 'default' : 'secondary'}>
                        {stats.graded}/{stats.total} graded
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
