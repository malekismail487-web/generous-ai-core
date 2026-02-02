import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { PendingApproval } from '@/components/PendingApproval';
import { Loader2 } from 'lucide-react';

export default function PendingApprovalPage() {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: roleLoading, refresh } = useRoleGuard();

  // Poll for status changes every 10 seconds
  useEffect(() => {
    if (!user || !profile) return;
    
    const interval = setInterval(() => {
      refresh();
    }, 10000);

    return () => clearInterval(interval);
  }, [user, profile, refresh]);

  if (authLoading || roleLoading) {
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

  // No profile yet - still waiting for signup completion
  if (!profile) {
    return <Navigate to="/auth" replace />;
  }

  // If approved and active, redirect to appropriate dashboard
  if (profile.status === 'approved' && profile.is_active) {
    if (profile.user_type === 'school_admin') {
      return <Navigate to="/admin" replace />;
    }
    if (profile.user_type === 'teacher') {
      return <Navigate to="/teacher" replace />;
    }
    if (profile.user_type === 'student') {
      return <Navigate to="/" replace />;
    }
  }

  // Show pending/rejected state
  return <PendingApproval />;
}
