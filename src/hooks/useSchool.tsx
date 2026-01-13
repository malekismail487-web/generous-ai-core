import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export type School = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  created_at: string;
  is_test_data?: boolean;
};

export type Profile = {
  id: string;
  school_id: string | null;
  full_name: string;
  student_teacher_id: string | null;
  grade_level: string | null;
  department: string | null;
  user_type: 'student' | 'teacher';
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  is_test_data?: boolean;
};

export function useSchool() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [isSchoolAdmin, setIsSchoolAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  // Fetch user's profile
  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setSchool(null);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching profile:', error);
    }
    
    setProfile(data as Profile | null);

    // If profile has school, fetch school details
    if (data?.school_id) {
      const { data: schoolData } = await supabase
        .from('schools')
        .select('*')
        .eq('id', data.school_id)
        .single();
      
      setSchool(schoolData as School | null);

      // Check if user is school admin
      const { data: adminData } = await supabase
        .from('school_admins')
        .select('id')
        .eq('user_id', user.id)
        .eq('school_id', data.school_id)
        .maybeSingle();
      
      setIsSchoolAdmin(!!adminData);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Validate school code
  const validateSchoolCode = useCallback(async (code: string) => {
    const { data, error } = await supabase
      .from('schools')
      .select('*')
      .eq('code', code.toUpperCase())
      .maybeSingle();

    if (error || !data) {
      return null;
    }
    return data as School;
  }, []);

  // Create profile with school code
  const createProfile = useCallback(async (
    schoolCode: string,
    fullName: string,
    userType: 'student' | 'teacher',
    studentTeacherId?: string,
    gradeLevel?: string,
    department?: string
  ) => {
    if (!user) return null;

    // Validate school code
    const schoolData = await validateSchoolCode(schoolCode);
    if (!schoolData) {
      toast({ variant: 'destructive', title: 'Invalid school code' });
      return null;
    }

    const { data, error } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        school_id: schoolData.id,
        full_name: fullName,
        user_type: userType,
        student_teacher_id: studentTeacherId || null,
        grade_level: userType === 'student' ? gradeLevel || null : null,
        department: userType === 'teacher' ? department || null : null,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating profile:', error);
      toast({ variant: 'destructive', title: 'Error creating profile' });
      return null;
    }

    setProfile(data as Profile);
    setSchool(schoolData);
    toast({ title: 'Registration submitted! Waiting for school admin approval.' });
    return data;
  }, [user, validateSchoolCode, toast]);

  return {
    profile,
    school,
    isSchoolAdmin,
    loading,
    hasProfile: !!profile,
    isApproved: profile?.status === 'approved',
    isPending: profile?.status === 'pending',
    isRejected: profile?.status === 'rejected',
    validateSchoolCode,
    createProfile,
    refresh: fetchProfile
  };
}
