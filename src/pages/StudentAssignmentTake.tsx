import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AssignmentQuizTaker } from '@/components/student/AssignmentQuizTaker';

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  points: number;
  questions_json: any;
  due_date: string | null;
  grade_level: string;
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

export default function StudentAssignmentTake() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { isStudent, school, profile, loading } = useRoleGuard();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  const studentId = profile?.id;

  const canAccess = useMemo(() => {
    if (!assignment || !profile?.grade_level) return true;
    return assignment.grade_level === 'All' || assignment.grade_level === profile.grade_level;
  }, [assignment, profile?.grade_level]);

  useEffect(() => {
    const run = async () => {
      if (!assignmentId || !school || !studentId) return;
      setLoadingData(true);

      const { data: assignmentData, error: assignmentError } = await supabase
        .from('assignments')
        .select('*')
        .eq('id', assignmentId)
        .eq('school_id', school.id)
        .maybeSingle();

      if (assignmentError || !assignmentData) {
        setAssignment(null);
        setLoadingData(false);
        return;
      }

      setAssignment(assignmentData as Assignment);

      // Record that the student viewed this assignment
      await supabase
        .from('assignment_views')
        .upsert(
          { assignment_id: assignmentId, user_id: studentId },
          { onConflict: 'assignment_id,user_id' }
        );

      const { data: submissionData } = await supabase
        .from('submissions')
        .select('*')
        .eq('assignment_id', assignmentId)
        .eq('student_id', studentId)
        .maybeSingle();

      setSubmission((submissionData || null) as Submission | null);
      setLoadingData(false);
    };

    run();
  }, [assignmentId, school, studentId]);

  // If already graded, go straight to results page.
  useEffect(() => {
    if (submission?.grade !== null && submission?.grade !== undefined && assignmentId) {
      navigate(`/student/assignments/${assignmentId}/results`, { replace: true });
    }
  }, [submission?.grade, assignmentId, navigate]);

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

  if (loadingData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
          <p className="text-sm text-muted-foreground">Assignment not found.</p>
          <Button onClick={() => navigate('/student')}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
          <p className="text-sm text-muted-foreground">
            This assignment isn’t available for your grade.
          </p>
          <Button onClick={() => navigate('/student')}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-3xl mx-auto px-4 py-6">
        <AssignmentQuizTaker
          assignment={assignment}
          profileId={profile.id}
          existingSubmission={submission}
          onBack={() => navigate('/student')}
          onSuccess={() => {
            // no-op (we redirect to results after submit)
          }}
        />
      </main>
    </div>
  );
}
