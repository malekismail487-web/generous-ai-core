import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { authLogger } from '@/lib/logger';

export type UserRole = 'super_admin' | 'school_admin' | 'teacher' | 'student' | 'parent' | 'moderator' | 'none';

export interface UserProfile {
  id: string;
  school_id: string | null;
  full_name: string;
  user_type: string;
  status: string;
  is_active: boolean;
  grade_level: string | null;
  department: string | null;
  student_teacher_id: string | null;
}

export interface School {
  id: string;
  name: string;
  code: string;
  status: string;
  code_used: boolean;
  address: string | null;
  created_at: string;
  tenant_id: string;
}

type AuthorityContext = {
  user_id: string;
  aal: 'aal1' | 'aal2';
  is_super_admin: boolean;
  school_admin_school_ids: string[];
};

const emptyAuthority: AuthorityContext = {
  user_id: '',
  aal: 'aal1',
  is_super_admin: false,
  school_admin_school_ids: [],
};

export function useRoleGuard() {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<UserRole>('none');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [authority, setAuthority] = useState<AuthorityContext>(emptyAuthority);
  const [loading, setLoading] = useState(true);

  const fetchUserData = useCallback(async () => {
    if (!user) {
      setRole('none');
      setProfile(null);
      setSchool(null);
      setAuthority(emptyAuthority);
      setLoading(false);
      return;
    }

    setLoading(true);
    const [{ data: authorityData, error: authorityError }, { data: profileData, error: profileError }] = await Promise.all([
      supabase.rpc('get_authority_context' as never),
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    ]);

    if (authorityError) authLogger.error('Error fetching server authority context', authorityError);
    if (profileError) authLogger.error('Error fetching profile by immutable ID', profileError);

    const nextAuthority = authorityError || !authorityData
      ? { ...emptyAuthority, user_id: user.id }
      : authorityData as unknown as AuthorityContext;
    const nextProfile = profileData as UserProfile | null;
    setAuthority(nextAuthority);
    setProfile(nextProfile);

    if (nextAuthority.is_super_admin) {
      setRole('super_admin');
    } else if (
      nextProfile?.user_type === 'school_admin'
      && nextProfile.school_id
      && nextProfile.status === 'approved'
      && nextProfile.is_active
      && nextAuthority.school_admin_school_ids.includes(nextProfile.school_id)
    ) {
      setRole('school_admin');
    } else if (
      nextProfile?.status === 'approved'
      && nextProfile.is_active
      && ['teacher', 'student', 'parent', 'moderator'].includes(nextProfile.user_type)
    ) {
      setRole(nextProfile.user_type as UserRole);
    } else {
      setRole('none');
    }

    if (nextProfile?.school_id) {
      const { data: schoolData, error: schoolError } = await supabase
        .from('schools')
        .select('id,name,code,status,code_used,address,created_at,tenant_id')
        .eq('id', nextProfile.school_id)
        .maybeSingle();
      if (schoolError) authLogger.error('Error fetching school', schoolError);
      setSchool(schoolData as School | null);
    } else {
      setSchool(null);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!authLoading) void fetchUserData();
  }, [authLoading, fetchUserData]);

  const activateSchoolCode = useCallback(async (
    code: string,
  ): Promise<{
    success: boolean;
    error?: string;
    schoolName?: string;
    tenant_id?: string;
    tenant_slug?: string;
    tenant_name?: string;
  }> => {
    if (!user) return { success: false, error: 'Not authenticated' };
    const { data, error } = await supabase.rpc('activate_school' as never, {
      activation_code_input: code,
    } as never);
    if (error) {
      authLogger.error('Error activating school', error);
      return { success: false, error: error.message };
    }
    const result = data as unknown as {
      success: boolean;
      school_name?: string;
      tenant_id?: string;
      tenant_slug?: string;
      tenant_name?: string;
    };
    await fetchUserData();
    return {
      success: result.success,
      schoolName: result.school_name,
      tenant_id: result.tenant_id,
      tenant_slug: result.tenant_slug,
      tenant_name: result.tenant_name,
    };
  }, [fetchUserData, user]);

  return {
    user,
    role,
    profile,
    school,
    tenantId: school?.tenant_id ?? null,
    loading: authLoading || loading,
    assuranceLevel: authority.aal,
    isSuperAdmin: role === 'super_admin',
    isSchoolAdmin: role === 'school_admin',
    isTeacher: role === 'teacher',
    isStudent: role === 'student',
    isParent: role === 'parent',
    isModerator: role === 'moderator',
    isActive: profile?.is_active ?? false,
    hasProfile: Boolean(profile),
    activateSchoolCode,
    refresh: fetchUserData,
  };
}
