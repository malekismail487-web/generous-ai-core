import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export type AppRole = 'student' | 'teacher' | 'admin';

export type TeacherRequest = {
  id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
};

export function useUserRole() {
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [teacherRequest, setTeacherRequest] = useState<TeacherRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  const isTeacher = roles.includes('teacher');
  const isAdmin = roles.includes('admin');
  const isStudent = !isTeacher && !isAdmin;

  // Fetch user roles
  const fetchRoles = useCallback(async () => {
    if (!user) {
      setRoles([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (error) {
      console.error('Error fetching roles:', error);
    } else {
      setRoles((data || []).map(r => r.role as AppRole));
    }
    setLoading(false);
  }, [user]);

  // Fetch existing teacher request
  const fetchTeacherRequest = useCallback(async () => {
    if (!user) {
      setTeacherRequest(null);
      return;
    }

    const { data, error } = await supabase
      .from('teacher_requests')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!error && data) {
      setTeacherRequest(data as TeacherRequest);
    }
  }, [user]);

  useEffect(() => {
    fetchRoles();
    fetchTeacherRequest();
  }, [fetchRoles, fetchTeacherRequest]);

  // Request teacher access
  const requestTeacherAccess = useCallback(async (reason: string) => {
    if (!user) return null;

    // Check if already has a request
    if (teacherRequest) {
      toast({ variant: 'destructive', title: 'You already have a pending request' });
      return null;
    }

    const { data, error } = await supabase
      .from('teacher_requests')
      .insert({
        user_id: user.id,
        reason: reason.trim() || null
      })
      .select()
      .single();

    if (error) {
      toast({ variant: 'destructive', title: 'Error submitting request' });
      return null;
    }

    setTeacherRequest(data as TeacherRequest);
    toast({ title: 'Teacher access request submitted!' });
    return data;
  }, [user, teacherRequest, toast]);

  return {
    roles,
    isTeacher,
    isAdmin,
    isStudent,
    teacherRequest,
    loading,
    requestTeacherAccess,
    refresh: () => {
      fetchRoles();
      fetchTeacherRequest();
    }
  };
}
