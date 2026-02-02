import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useSchool } from './useSchool';
import { useUserRole } from './useUserRole';
import { useToast } from './use-toast';

export interface Assignment {
  id: string;
  school_id: string;
  teacher_id: string;
  title: string;
  description: string | null;
  subject: string;
  grade_level: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  points?: number;
  questions_json?: any;
}

export interface AssignmentSubmission {
  id: string;
  assignment_id: string;
  student_id: string;
  content: string | null;
  submitted_at: string;
  grade: string | null;
  feedback: string | null;
  graded_at: string | null;
  graded_by: string | null;
}

export function useAssignments() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [mySubmissions, setMySubmissions] = useState<AssignmentSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { school, profile } = useSchool();
  const { isTeacher } = useUserRole();
  const { toast } = useToast();

  // Fetch assignments for the school, filtered by grade level for students
  const fetchAssignments = useCallback(async () => {
    if (!user || !school) {
      setAssignments([]);
      setLoading(false);
      return;
    }

    let query = supabase
      .from('assignments')
      .select('*')
      .eq('school_id', school.id)
      .order('due_date', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching assignments:', error);
      setAssignments([]);
    } else {
      let filteredAssignments = data || [];
      
      // For students, filter by their grade level
      if (!isTeacher && profile?.grade_level) {
        filteredAssignments = filteredAssignments.filter((a: any) => {
          return !a.grade_level || a.grade_level === 'All' || a.grade_level === profile.grade_level;
        });
      }
      
      setAssignments(filteredAssignments as Assignment[]);
    }
    setLoading(false);
  }, [user, school, profile, isTeacher]);

  // Fetch user's submissions
  const fetchMySubmissions = useCallback(async () => {
    if (!user) {
      setMySubmissions([]);
      return;
    }

    const { data, error } = await supabase
      .from('assignment_submissions')
      .select('*')
      .eq('student_id', user.id)
      .order('submitted_at', { ascending: false });

    if (error) {
      console.error('Error fetching submissions:', error);
    } else {
      setMySubmissions(data || []);
    }
  }, [user]);

  // Create assignment (teachers only)
  const createAssignment = useCallback(async (
    title: string,
    description: string | null,
    subject: string,
    gradeLevel: string,
    dueDate: string | null
  ) => {
    if (!user || !school || !isTeacher) return null;

    const { data, error } = await supabase
      .from('assignments')
      .insert({
        school_id: school.id,
        teacher_id: user.id,
        title,
        description,
        subject,
        grade_level: gradeLevel,
        due_date: dueDate,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating assignment:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to create assignment',
      });
      return null;
    }

    setAssignments(prev => [...prev, data]);
    toast({ title: 'Assignment created' });
    return data;
  }, [user, school, isTeacher, toast]);

  // Submit assignment (students)
  const submitAssignment = useCallback(async (assignmentId: string, content: string) => {
    if (!user) return null;

    // Check if already submitted
    const existing = mySubmissions.find(s => s.assignment_id === assignmentId);
    if (existing) {
      // Update existing submission
      const { data, error } = await supabase
        .from('assignment_submissions')
        .update({ content, submitted_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating submission:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to update submission',
        });
        return null;
      }

      setMySubmissions(prev => prev.map(s => s.id === existing.id ? data : s));
      toast({ title: 'Submission updated' });
      return data;
    }

    // Create new submission
    const { data, error } = await supabase
      .from('assignment_submissions')
      .insert({
        assignment_id: assignmentId,
        student_id: user.id,
        content,
      })
      .select()
      .single();

    if (error) {
      console.error('Error submitting assignment:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to submit assignment',
      });
      return null;
    }

    setMySubmissions(prev => [...prev, data]);
    toast({ title: 'Assignment submitted' });
    return data;
  }, [user, mySubmissions, toast]);

  // Grade submission (teachers)
  const gradeSubmission = useCallback(async (
    submissionId: string,
    grade: string,
    feedback: string | null
  ) => {
    if (!user) return false;

    const { error } = await supabase
      .from('assignment_submissions')
      .update({
        grade,
        feedback,
        graded_at: new Date().toISOString(),
        graded_by: user.id,
      })
      .eq('id', submissionId);

    if (error) {
      console.error('Error grading submission:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to grade submission',
      });
      return false;
    }

    toast({ title: 'Submission graded' });
    return true;
  }, [user, toast]);

  // Get submissions for an assignment (teachers)
  const getSubmissionsForAssignment = useCallback(async (assignmentId: string) => {
    const { data, error } = await supabase
      .from('assignment_submissions')
      .select('*')
      .eq('assignment_id', assignmentId)
      .order('submitted_at', { ascending: false });

    if (error) {
      console.error('Error fetching submissions:', error);
      return [];
    }

    return data || [];
  }, []);

  // Delete assignment (teachers)
  const deleteAssignment = useCallback(async (assignmentId: string) => {
    const { error } = await supabase
      .from('assignments')
      .delete()
      .eq('id', assignmentId);

    if (error) {
      console.error('Error deleting assignment:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete assignment',
      });
      return false;
    }

    setAssignments(prev => prev.filter(a => a.id !== assignmentId));
    toast({ title: 'Assignment deleted' });
    return true;
  }, [toast]);

  // Check if assignment is submitted
  const isSubmitted = useCallback((assignmentId: string) => {
    return mySubmissions.some(s => s.assignment_id === assignmentId);
  }, [mySubmissions]);

  // Get submission for an assignment
  const getSubmission = useCallback((assignmentId: string) => {
    return mySubmissions.find(s => s.assignment_id === assignmentId);
  }, [mySubmissions]);

  useEffect(() => {
    fetchAssignments();
    fetchMySubmissions();
  }, [fetchAssignments, fetchMySubmissions]);

  return {
    assignments,
    mySubmissions,
    loading,
    createAssignment,
    submitAssignment,
    gradeSubmission,
    getSubmissionsForAssignment,
    deleteAssignment,
    isSubmitted,
    getSubmission,
    refresh: fetchAssignments,
  };
}
