import { useState } from 'react';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useAuth } from '@/hooks/useAuth';
import { Navigate, useNavigate } from 'react-router-dom';
import { Loader2, KeyRound, Building2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

export default function ActivateSchool() {
  const { user, loading: authLoading } = useAuth();
  const { activateSchoolCode, loading, profile, isSuperAdmin } = useRoleGuard();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [code, setCode] = useState('');
  const [activating, setActivating] = useState(false);
  const [success, setSuccess] = useState<{ schoolName: string } | null>(null);

  const handleActivate = async () => {
    if (!code.trim()) {
      toast({ variant: 'destructive', title: 'Please enter an activation code' });
      return;
    }

    setActivating(true);
    const result = await activateSchoolCode(code.trim().toUpperCase());
    setActivating(false);

    if (result.success) {
      setSuccess({ schoolName: result.schoolName || 'Your School' });
      toast({ title: 'School activated successfully!' });
    } else {
      toast({ variant: 'destructive', title: result.error || 'Failed to activate school' });
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Super admin goes to super admin panel
  if (isSuperAdmin) {
    return <Navigate to="/super-admin" replace />;
  }

  // Already has a profile with school - redirect to appropriate dashboard
  if (profile?.school_id) {
    if (profile.user_type === 'school_admin') {
      return <Navigate to="/admin" replace />;
    } else if (profile.user_type === 'teacher') {
      return <Navigate to="/teacher" replace />;
    } else if (profile.user_type === 'student') {
      return <Navigate to="/student" replace />;
    }
    return <Navigate to="/" replace />;
  }

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <div className="ambient-glow" />
        <div className="glass-effect rounded-2xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold mb-2">School Activated!</h1>
          <p className="text-muted-foreground mb-2">
            You are now the administrator of
          </p>
          <p className="text-xl font-semibold text-primary mb-6">
            {success.schoolName}
          </p>
          <Button onClick={() => navigate('/admin')} className="w-full">
            Go to Admin Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <div className="ambient-glow" />
      <div className="glass-effect rounded-2xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Activate Your School</h1>
          <p className="text-muted-foreground">
            Enter the activation code provided by the super administrator to become the school admin.
          </p>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Enter activation code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="pl-10 h-12 text-lg tracking-wider uppercase"
              maxLength={20}
            />
          </div>

          <Button
            onClick={handleActivate}
            disabled={activating || !code.trim()}
            className="w-full h-12"
          >
            {activating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Activating...
              </>
            ) : (
              'Activate School'
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Don't have a code? Contact your super administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
