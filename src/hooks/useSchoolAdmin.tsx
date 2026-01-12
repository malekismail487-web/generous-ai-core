import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSchool, Profile, School } from '@/hooks/useSchool';
import { useToast } from '@/hooks/use-toast';

export function useSchoolAdmin() {
  const [pendingUsers, setPendingUsers] = useState<Profile[]>([]);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { school, isSchoolAdmin } = useSchool();
  const { toast } = useToast();

  // Fetch users from admin's school
  const fetchUsers = useCallback(async () => {
    if (!isSchoolAdmin || !school) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('school_id', school.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching users:', error);
    } else {
      const users = (data || []) as Profile[];
      setAllUsers(users);
      setPendingUsers(users.filter(u => u.status === 'pending'));
    }
    setLoading(false);
  }, [isSchoolAdmin, school]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Approve a user
  const approveUser = useCallback(async (userId: string) => {
    const { error } = await supabase
      .from('profiles')
      .update({ status: 'approved' })
      .eq('id', userId);

    if (error) {
      toast({ variant: 'destructive', title: 'Error approving user' });
      return false;
    }

    // If user is a teacher, add teacher role
    const user = allUsers.find(u => u.id === userId);
    if (user?.user_type === 'teacher') {
      await supabase
        .from('user_roles')
        .insert({ user_id: userId, role: 'teacher' });
    }

    toast({ title: 'User approved!' });
    fetchUsers();
    return true;
  }, [toast, fetchUsers, allUsers]);

  // Reject a user
  const rejectUser = useCallback(async (userId: string) => {
    const { error } = await supabase
      .from('profiles')
      .update({ status: 'rejected' })
      .eq('id', userId);

    if (error) {
      toast({ variant: 'destructive', title: 'Error rejecting user' });
      return false;
    }

    toast({ title: 'User rejected' });
    fetchUsers();
    return true;
  }, [toast, fetchUsers]);

  return {
    pendingUsers,
    allUsers,
    loading,
    approveUser,
    rejectUser,
    refresh: fetchUsers
  };
}

// Super admin hook for managing schools
export function useSuperAdmin() {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchSchools = useCallback(async () => {
    const { data, error } = await supabase
      .from('schools')
      .select('*')
      .order('name');

    if (!error) {
      setSchools((data || []) as School[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSchools();
  }, [fetchSchools]);

  // Create a new school
  const createSchool = useCallback(async (name: string, code: string, address?: string) => {
    const { data, error } = await supabase
      .from('schools')
      .insert({
        name,
        code: code.toUpperCase(),
        address: address || null
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        toast({ variant: 'destructive', title: 'School code already exists' });
      } else {
        toast({ variant: 'destructive', title: 'Error creating school' });
      }
      return null;
    }

    toast({ title: 'School created!' });
    fetchSchools();
    return data;
  }, [toast, fetchSchools]);

  // Assign school admin
  const assignSchoolAdmin = useCallback(async (userId: string, schoolId: string) => {
    const { error } = await supabase
      .from('school_admins')
      .insert({ user_id: userId, school_id: schoolId });

    if (error) {
      toast({ variant: 'destructive', title: 'Error assigning admin' });
      return false;
    }

    toast({ title: 'School admin assigned!' });
    return true;
  }, [toast]);

  // Delete school
  const deleteSchool = useCallback(async (schoolId: string) => {
    const { error } = await supabase
      .from('schools')
      .delete()
      .eq('id', schoolId);

    if (error) {
      toast({ variant: 'destructive', title: 'Error deleting school' });
      return false;
    }

    toast({ title: 'School deleted' });
    fetchSchools();
    return true;
  }, [toast, fetchSchools]);

  return {
    schools,
    loading,
    createSchool,
    assignSchoolAdmin,
    deleteSchool,
    refresh: fetchSchools
  };
}
