import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useToast } from '@/hooks/use-toast';

export type AppRole = 'student' | 'teacher';

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
  const [teacherRequest, setTeacherRequest] = useState<TeacherRequest | null>(null);
  const { user } = useAuth();
  const { isTeacher, isStudent, isSchoolAdmin, isSuperAdmin, loading, refresh } = useRoleGuard();
  const { toast } = useToast();

  const fetchTeacherRequest = useCallback(async () => {
    if (!user) {
      setTeacherRequest(null);
      return;
    }
    const { data } = await supabase
      .from('teacher_requests')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    setTeacherRequest(data as TeacherRequest | null);
  }, [user]);

  useEffect(() => {
    void fetchTeacherRequest();
  }, [fetchTeacherRequest]);

  const requestTeacherAccess = useCallback(async (reason: string) => {
    if (!user || teacherRequest) {
      if (teacherRequest) toast({ variant: 'destructive', title: 'You already have a teacher request' });
      return null;
    }
    const { data, error } = await supabase
      .from('teacher_requests')
      .insert({ user_id: user.id, reason: reason.trim() || null })
      .select()
      .single();
    if (error) {
      toast({ variant: 'destructive', title: 'Error submitting request' });
      return null;
    }
    setTeacherRequest(data as TeacherRequest);
    toast({ title: 'Teacher access request submitted!' });
    return data;
  }, [teacherRequest, toast, user]);

  return {
    roles: isTeacher ? ['teacher' as const] : isStudent ? ['student' as const] : [],
    isTeacher,
    isStudent,
    isSchoolAdmin,
    isSuperAdmin,
    teacherRequest,
    loading,
    requestTeacherAccess,
    refresh: async () => {
      await Promise.all([refresh(), fetchTeacherRequest()]);
    },
  };
}
