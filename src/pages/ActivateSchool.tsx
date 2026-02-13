import { useState } from 'react';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useAuth } from '@/hooks/useAuth';
import { Navigate, useNavigate } from 'react-router-dom';
import { Loader2, KeyRound, Building2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export default function ActivateSchool() {
  const { user, loading: authLoading } = useAuth();
  const { loading, profile, isSuperAdmin, refresh } = useRoleGuard();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [schoolName, setSchoolName] = useState('');
  const [code, setCode] = useState('');
  const [activating, setActivating] = useState(false);

  const handleActivate = async () => {
    if (!schoolName.trim()) {
      toast({ variant: 'destructive', title: 'Please enter the school name' });
      return;
    }
    if (!code.trim()) {
      toast({ variant: 'destructive', title: 'Please enter the activation code' });
      return;
    }

    if (!user) {
      toast({ variant: 'destructive', title: 'Please sign in first' });
      return;
    }

    setActivating(true);

    try {
      const { data, error } = await supabase.functions.invoke('activate-school', {
        body: {
          schoolName: schoolName.trim(),
          activationCode: code.trim().toUpperCase(),
        },
      });

      if (error) {
        toast({
          variant: 'destructive',
          title: 'Activation failed',
          description: error.message,
        });
        return;
      }

      const result = data as { success?: boolean; error?: string; school_name?: string };
      if (!result?.success) {
        toast({
          variant: 'destructive',
          title: 'Activation failed',
          description: result?.error || 'Failed to activate school',
        });
        return;
      }

      toast({ title: 'School activated successfully!' });
      await refresh();
      navigate('/admin');
    } catch (err) {
      toast({ variant: 'destructive', title: 'An error occurred during activation' });
    } finally {
      setActivating(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not logged in - show a message to sign up/in first
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <div className="ambient-glow" />
        <div className="glass-effect rounded-2xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold mb-4">Activate Your School</h1>
          <p className="text-muted-foreground mb-6">
            To become a school administrator, you need to create an account first.
          </p>
          <div className="space-y-3">
            <Button onClick={() => navigate('/auth')} className="w-full">
              Sign Up / Sign In
            </Button>
            <p className="text-xs text-muted-foreground">
              After signing in, return here to activate your school.
            </p>
          </div>
        </div>
      </div>
    );
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
            Enter the school name and activation code provided by the super administrator.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="school-name">School Name</Label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="school-name"
                type="text"
                placeholder="Enter school name"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                className="pl-10 h-12"
                maxLength={100}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="activation-code">Activation Code</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="activation-code"
                type="text"
                placeholder="Enter activation code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="pl-10 h-12 text-lg tracking-wider uppercase"
                maxLength={20}
              />
            </div>
          </div>

          <Button
            onClick={handleActivate}
            disabled={activating || !code.trim() || !schoolName.trim()}
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
            Don't have credentials? Contact your super administrator.
          </p>

          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              // Set flag so Auth page knows not to redirect back
              sessionStorage.setItem('fromActivateSchool', 'true');
              navigate('/auth');
            }}
          >
            ← Back to Sign In
          </Button>
        </div>
      </div>
    </div>
  );
}
