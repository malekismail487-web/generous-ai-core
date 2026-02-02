import { useEffect, useState, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Clock, School, RefreshCw, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface PendingProfile {
  id: string;
  school_id: string | null;
  full_name: string;
  user_type: string;
  status: string;
  is_active: boolean;
  grade_level: string | null;
  department: string | null;
}

interface School {
  id: string;
  name: string;
}

export default function PendingApprovalPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PendingProfile | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfileData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    // First try to find profile by user ID
    let { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    // If not found by ID, try by email
    if (!profileData && user.email) {
      const { data: emailProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', user.email.toLowerCase())
        .maybeSingle();
      
      profileData = emailProfile;
    }

    if (profileData) {
      setProfile(profileData as PendingProfile);

      // Fetch school if profile has one
      if (profileData.school_id) {
        const { data: schoolData } = await supabase
          .from('schools')
          .select('id, name')
          .eq('id', profileData.school_id)
          .single();
        
        if (schoolData) {
          setSchool(schoolData);
        }
      }

      // Check if approved - redirect to appropriate page
      if (profileData.status === 'approved' && profileData.is_active) {
        if (profileData.user_type === 'school_admin') {
          navigate('/admin', { replace: true });
        } else if (profileData.user_type === 'teacher') {
          navigate('/teacher', { replace: true });
        } else {
          navigate('/', { replace: true });
        }
        return;
      }
    }

    setLoading(false);
  }, [user, navigate]);

  // Initial fetch
  useEffect(() => {
    if (!authLoading) {
      fetchProfileData();
    }
  }, [authLoading, fetchProfileData]);

  // Poll for status changes every 10 seconds
  useEffect(() => {
    if (!user) return;
    
    const interval = setInterval(() => {
      fetchProfileData();
    }, 10000);

    return () => clearInterval(interval);
  }, [user, fetchProfileData]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="ambient-glow" />
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not authenticated - go to auth
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Rejected state
  if (profile?.status === 'rejected') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="ambient-glow" />
        <div className="w-full max-w-md relative z-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6 bg-gradient-to-br from-red-500 to-rose-600">
            <School className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Registration Declined</h1>
          <p className="text-muted-foreground mb-6">
            Your registration for <strong>{school?.name || 'your school'}</strong> was not approved. 
            Please contact your school administrator for more information.
          </p>
          <Button variant="outline" onClick={() => signOut()} className="gap-2">
            <LogOut size={16} />
            Sign Out
          </Button>
        </div>
      </div>
    );
  }

  // Pending state (default)
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="ambient-glow" />
      <div className="w-full max-w-md relative z-10 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6 bg-gradient-to-br from-amber-500 to-orange-600 animate-pulse">
          <Clock className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Pending Approval</h1>
        <p className="text-muted-foreground mb-2">
          Your request to join <strong>{school?.name || 'your school'}</strong> has been submitted.
        </p>
        <p className="text-sm text-muted-foreground mb-6">
          Your school administrator has been notified and will review your request shortly.
        </p>

        {profile && (
          <div className="glass-effect rounded-2xl p-5 mb-6 text-left">
            <h3 className="font-semibold mb-3">Your Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span>{profile.full_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Role</span>
                <span className="capitalize">{profile.user_type}</span>
              </div>
              {profile.grade_level && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Grade</span>
                  <span>{profile.grade_level}</span>
                </div>
              )}
              {profile.department && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Department</span>
                  <span>{profile.department}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={fetchProfileData} className="flex-1 gap-2">
            <RefreshCw size={16} />
            Check Status
          </Button>
          <Button variant="ghost" onClick={() => signOut()} className="gap-2">
            <LogOut size={16} />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
