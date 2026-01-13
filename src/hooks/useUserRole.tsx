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

// Hardcoded super admin email - cannot be removed via UI
const HARDCODED_ADMIN_EMAIL = 'malekismail487@gmail.com';

export function useUserRole() {
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [teacherRequest, setTeacherRequest] = useState<TeacherRequest | null>(null);
  const [isHardcodedAdmin, setIsHardcodedAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  // Check if current user is the hardcoded admin
  const checkHardcodedAdmin = useCallback(() => {
    if (user?.email) {
      const isHardcoded = user.email.toLowerCase() === HARDCODED_ADMIN_EMAIL.toLowerCase();
      setIsHardcodedAdmin(isHardcoded);
      return isHardcoded;
    }
    return false;
  }, [user?.email]);

  const isTeacher = roles.includes('teacher');
  // isAdmin is true if user has admin role OR is hardcoded admin
  const isAdmin = roles.includes('admin') || isHardcodedAdmin;
  const isStudent = !isTeacher && !isAdmin;

  // Fetch user roles
  const fetchRoles = useCallback(async () => {
    if (!user) {
      setRoles([]);
      setIsHardcodedAdmin(false);
      setLoading(false);
      return;
    }

    // Check hardcoded admin status first
    checkHardcodedAdmin();

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
  }, [user, checkHardcodedAdmin]);

  // Verify admin access code and grant admin role
  const verifyAdminCode = useCallback(async (code: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { data, error } = await supabase.rpc('grant_admin_via_code', {
        input_code: code,
        target_user_id: user.id
      });

      if (error) {
        console.error('Error verifying admin code:', error);
        toast({ variant: 'destructive', title: 'Invalid access code' });
        return false;
      }

      if (data === true) {
        toast({ title: 'Admin access granted!' });
        // Refresh roles
        await fetchRoles();
        return true;
      } else {
        toast({ variant: 'destructive', title: 'Invalid access code' });
        return false;
      }
    } catch (err) {
      console.error('Error verifying admin code:', err);
      toast({ variant: 'destructive', title: 'Error verifying code' });
      return false;
    }
  }, [user, toast, fetchRoles]);

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
    isHardcodedAdmin,
    teacherRequest,
    loading,
    requestTeacherAccess,
    verifyAdminCode,
    refresh: () => {
      fetchRoles();
      fetchTeacherRequest();
    }
  };
}
