import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type UserRole = 'super_admin' | 'school_admin' | 'teacher' | 'student' | 'none';

const SUPER_ADMIN_EMAIL = 'malekismail487@gmail.com';

export interface UserProfile {
  id: string;
  school_id: string | null;
  full_name: string;
  user_type: string;
  status: string;
  is_active: boolean;
  grade_level: string | null;
  department: string | null;
}

export interface School {
  id: string;
  name: string;
  code: string;
  activation_code: string | null;
  status: string;
  code_used: boolean;
  address: string | null;
  created_at: string;
}

export function useRoleGuard() {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<UserRole>('none');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);

  const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL;
  const isSchoolAdmin = role === 'school_admin';
  const isTeacher = role === 'teacher';
  const isStudent = role === 'student';

  const fetchUserData = useCallback(async () => {
    if (!user) {
      setRole('none');
      setProfile(null);
      setSchool(null);
      setLoading(false);
      return;
    }

    // Check if super admin first
    if (user.email === SUPER_ADMIN_EMAIL) {
      setRole('super_admin');
      setLoading(false);
      return;
    }

    // Fetch profile - try by ID first, then by email
    let profileData = null;
    
    const { data: idProfileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('Error fetching profile by ID:', profileError);
    }

    profileData = idProfileData;

    // If not found by ID, try by email (for users whose profile was created before auth signup)
    if (!profileData && user.email) {
      const { data: emailProfiles } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', user.email.toLowerCase())
        .order('is_active', { ascending: false });
      
      if (emailProfiles && emailProfiles.length > 0) {
        // Prefer approved/active profiles
        const approvedProfile = emailProfiles.find(p => p.status === 'approved' && p.is_active);
        profileData = approvedProfile || emailProfiles[0];
      }
    }

    if (!profileData) {
      setRole('none');
      setProfile(null);
      setLoading(false);
      return;
    }

    setProfile(profileData as UserProfile);

    // Set role based on user_type
    const userType = profileData.user_type;
    if (userType === 'school_admin') {
      setRole('school_admin');
    } else if (userType === 'teacher') {
      setRole('teacher');
    } else if (userType === 'student') {
      setRole('student');
    } else {
      setRole('none');
    }

    // Fetch school if user has one
    if (profileData.school_id) {
      const { data: schoolData } = await supabase
        .from('schools')
        .select('*')
        .eq('id', profileData.school_id)
        .single();

      if (schoolData) {
        setSchool(schoolData as School);
      }
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      fetchUserData();
    }
  }, [authLoading, fetchUserData]);

  const activateSchoolCode = async (code: string): Promise<{ success: boolean; error?: string; schoolName?: string }> => {
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data, error } = await supabase.rpc('activate_school_with_code', {
      activation_code_input: code,
      user_uuid: user.id
    });

    if (error) {
      console.error('Error activating school:', error);
      return { success: false, error: error.message };
    }

    const result = data as { success: boolean; error?: string; school_name?: string };

    if (result.success) {
      // Refresh user data
      await fetchUserData();
      return { success: true, schoolName: result.school_name };
    }

    return { success: false, error: result.error || 'Failed to activate school' };
  };

  return {
    user,
    role,
    profile,
    school,
    loading: authLoading || loading,
    isSuperAdmin,
    isSchoolAdmin,
    isTeacher,
    isStudent,
    isActive: profile?.is_active ?? false,
    hasProfile: !!profile,
    activateSchoolCode,
    refresh: fetchUserData,
  };
}
