import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Send,
  BookOpen,
  Filter,
  FileText,
  Award,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';

const SUBJECTS = [
  { id: 'biology', name: 'Biology', emoji: '🧬', color: 'from-green-500 to-emerald-600' },
  { id: 'physics', name: 'Physics', emoji: '⚛️', color: 'from-blue-500 to-cyan-600' },
  { id: 'mathematics', name: 'Mathematics', emoji: '📐', color: 'from-purple-500 to-violet-600' },
  { id: 'chemistry', name: 'Chemistry', emoji: '🧪', color: 'from-orange-500 to-amber-600' },
  { id: 'english', name: 'English', emoji: '📚', color: 'from-red-500 to-rose-600' },
  { id: 'social_studies', name: 'Social Studies', emoji: '🌍', color: 'from-teal-500 to-cyan-600' },
  { id: 'technology', name: 'Technology', emoji: '💻', color: 'from-indigo-500 to-blue-600' },
  { id: 'arabic', name: 'Arabic', emoji: '🕌', color: 'from-amber-500 to-yellow-600' },
];

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

interface StudentAssignmentsProps {
  assignments: Assignment[];
  submissions: Submission[];
  profileId: string;
  onRefresh: () => void;
}

export function StudentAssignments({
  assignments,
  submissions,
  profileId,
  onRefresh
}: StudentAssignmentsProps) {
  const { toast } = useToast();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [submissionContent, setSubmissionContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Filter state
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSubject, setFilterSubject] = useState<string>('all');

  const getSubmission = (assignmentId: string) => {
    return submissions.find(s => s.assignment_id === assignmentId);
  };

  const getSubjectInfo = (assignment: Assignment) => {
    // Try to match by subject field first
    const bySubject = SUBJECTS.find(s => s.id === assignment.subject);
    if (bySubject) return bySubject;
    
    // Fallback
    return { id: 'general', name: assignment.subject || 'General', emoji: '📄', color: 'from-gray-500 to-gray-600' };
  };

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  const getStatus = (assignment: Assignment) => {
    const submission = getSubmission(assignment.id);
    const overdue = isOverdue(assignment.due_date);
    
    if (submission?.grade !== null) return 'graded';
    if (submission) return 'submitted';
    if (overdue) return 'overdue';
    return 'pending';
  };

  const getDaysRemaining = (dueDate: string | null) => {
    if (!dueDate) return null;
    const now = new Date();
    const due = new Date(dueDate);
    const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const submitAssignment = async () => {
    if (!selectedAssignment) return;

    setSubmitting(true);

    const existingSubmission = getSubmission(selectedAssignment.id);

    if (existingSubmission) {
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
      const { error } = await supabase
        .from('submissions')
        .insert({
          assignment_id: selectedAssignment.id,
          student_id: profileId,
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
    setDialogOpen(false);
    setSelectedAssignment(null);
    setSubmissionContent('');
    onRefresh();
  };

  // Filter assignments
  const filteredAssignments = assignments.filter(a => {
    const status = getStatus(a);
    if (filterStatus !== 'all' && filterStatus !== status) return false;
    if (filterSubject !== 'all' && a.subject !== filterSubject) return false;
    return true;
  });

  // Stats
  const totalAssignments = assignments.length;
  const submittedCount = assignments.filter(a => getSubmission(a.id)).length;
  const gradedCount = submissions.filter(s => s.grade !== null).length;
  const averageGrade = gradedCount > 0 
    ? Math.round(submissions.filter(s => s.grade !== null).reduce((acc, s) => {
        const assignment = assignments.find(a => a.id === s.assignment_id);
        return acc + ((s.grade || 0) / (assignment?.points || 100)) * 100;
      }, 0) / gradedCount)
    : null;

  return (
    <div className="space-y-6">
      {/* Progress Overview - Classera Style */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalAssignments}</p>
                <p className="text-xs text-muted-foreground">Total Assignments</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{submittedCount}</p>
                <p className="text-xs text-muted-foreground">Submitted</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <Award className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{gradedCount}</p>
                <p className="text-xs text-muted-foreground">Graded</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{averageGrade ?? '--'}%</p>
                <p className="text-xs text-muted-foreground">Average Score</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Completion Progress */}
      {totalAssignments > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Completion Progress</span>
              <span className="text-sm text-muted-foreground">
                {submittedCount}/{totalAssignments} completed
              </span>
            </div>
            <Progress value={(submittedCount / totalAssignments) * 100} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 p-4 bg-muted/50 rounded-xl">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters:</span>
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="graded">Graded</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
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
      </div>

      {/* Assignments Grid - Classera Card Style */}
      {filteredAssignments.length === 0 ? (
        <div className="glass-effect rounded-xl p-12 text-center">
          <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="text-lg font-semibold mb-2">No Assignments Found</h3>
          <p className="text-muted-foreground">
            {assignments.length === 0 
              ? "Your teachers haven't created any assignments yet"
              : "No assignments match your current filters"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAssignments.map((assignment) => {
            const subjectInfo = getSubjectInfo(assignment);
            const status = getStatus(assignment);
            const submission = getSubmission(assignment.id);
            const daysRemaining = getDaysRemaining(assignment.due_date);

            return (
              <Card 
                key={assignment.id} 
                className={`group hover:shadow-lg transition-all duration-300 overflow-hidden ${
                  status === 'overdue' ? 'border-destructive/50' : ''
                }`}
              >
                {/* Subject Header */}
                <div className={`h-2 bg-gradient-to-r ${subjectInfo.color}`} />
                
                <CardHeader className="pb-3 pt-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{subjectInfo.emoji}</span>
                      <Badge variant="outline" className="text-xs">
                        {subjectInfo.name}
                      </Badge>
                    </div>
                    {/* Status Badge */}
                    {status === 'graded' && (
                      <Badge className="bg-green-500 gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        {submission?.grade}/{assignment.points}
                      </Badge>
                    )}
                    {status === 'submitted' && (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Submitted
                      </Badge>
                    )}
                    {status === 'overdue' && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Overdue
                      </Badge>
                    )}
                    {status === 'pending' && daysRemaining !== null && daysRemaining <= 3 && daysRemaining > 0 && (
                      <Badge variant="outline" className="gap-1 text-amber-500 border-amber-500">
                        <Clock className="w-3 h-3" />
                        {daysRemaining}d left
                      </Badge>
                    )}
                  </div>
                  <h3 className="font-semibold text-lg line-clamp-2 mt-2">
                    {assignment.title}
                  </h3>
                </CardHeader>

                <CardContent className="space-y-3">
                  {assignment.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {assignment.description}
                    </p>
                  )}

                  {/* Meta info */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Award className="w-3 h-3" />
                      <span>{assignment.points} points</span>
                    </div>
                    {assignment.due_date && (
                      <div className={`flex items-center gap-1 ${status === 'overdue' ? 'text-destructive' : 'text-muted-foreground'}`}>
                        <Calendar className="w-3 h-3" />
                        <span>{new Date(assignment.due_date).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>

                  {/* Grade/Feedback for graded assignments */}
                  {status === 'graded' && submission?.feedback && (
                    <div className="p-3 bg-green-500/10 rounded-lg">
                      <p className="text-xs font-medium text-green-600 mb-1">Teacher Feedback:</p>
                      <p className="text-sm line-clamp-2">{submission.feedback}</p>
                    </div>
                  )}

                  {/* Action Button */}
                  <div className="pt-3 border-t">
                    {status === 'graded' ? (
                      <Button variant="outline" className="w-full" disabled>
                        <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
                        Completed
                      </Button>
                    ) : (
                      <Button
                        variant={status === 'overdue' ? 'destructive' : 'default'}
                        className="w-full"
                        onClick={() => {
                          setSelectedAssignment(assignment);
                          setSubmissionContent(submission?.content || '');
                          setDialogOpen(true);
                        }}
                      >
                        <Send className="w-4 h-4 mr-2" />
                        {submission ? 'Edit Submission' : 'Submit Work'}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Submission Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedAssignment?.title}</DialogTitle>
            <DialogDescription>
              {selectedAssignment?.description || 'Submit your work for this assignment'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Assignment Info */}
            <div className="grid grid-cols-2 gap-4 p-3 bg-muted rounded-lg">
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">{selectedAssignment?.points}</p>
                <p className="text-xs text-muted-foreground">Points</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">
                  {selectedAssignment?.due_date 
                    ? new Date(selectedAssignment.due_date).toLocaleDateString()
                    : 'No deadline'
                  }
                </p>
                <p className="text-xs text-muted-foreground">Due Date</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="answer">Your Answer</Label>
              <Textarea
                id="answer"
                value={submissionContent}
                onChange={(e) => setSubmissionContent(e.target.value)}
                placeholder="Type your answer here..."
                rows={8}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={submitAssignment} 
              disabled={submitting || !submissionContent.trim()}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Submit
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
