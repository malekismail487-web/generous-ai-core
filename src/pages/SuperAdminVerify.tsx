import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, AlertTriangle, Lock, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const SUPER_ADMIN_EMAIL = 'malekismail487@gmail.com';

export default function SuperAdminVerify() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);
  const [isLocked, setIsLocked] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [isHighAlert, setIsHighAlert] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { toast } = useToast();

  // Check if user is the super admin
  useEffect(() => {
    const checkAccess = async () => {
      if (!user) {
        navigate('/auth');
        return;
      }

      if (user.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) {
        // Not super admin, redirect to normal flow
        navigate('/');
        return;
      }

      // Check lock status
      try {
        const { data, error } = await supabase.rpc('check_super_admin_lock_status', {
          p_email: user.email
        });

        if (error) {
          console.error('Error checking lock status:', error);
          setCheckingStatus(false);
          return;
        }

        const result = data as { is_super_admin: boolean; locked: boolean; locked_until?: string; is_high_alert?: boolean };

        if (result.locked) {
          setIsLocked(true);
          setLockedUntil(result.locked_until || null);
          setIsHighAlert(result.is_high_alert || false);
        }
      } catch (err) {
        console.error('Error:', err);
      }

      setCheckingStatus(false);
    };

    checkAccess();
  }, [user, navigate]);

  const handleVerify = async () => {
    if (!user?.email || code.length !== 8) {
      toast({
        variant: 'destructive',
        title: 'Invalid code',
        description: 'Please enter an 8-character verification code.'
      });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.rpc('verify_super_admin_code', {
        p_email: user.email,
        p_code: code
      });

      if (error) {
        toast({
          variant: 'destructive',
          title: 'Verification failed',
          description: error.message
        });
        setLoading(false);
        return;
      }

      const result = data as { 
        success: boolean; 
        error?: string; 
        locked?: boolean; 
        attempts_remaining?: number;
        is_high_alert?: boolean;
        locked_until?: string;
      };

      if (result.success) {
        toast({
          title: 'Verification successful',
          description: 'Welcome, Super Admin.'
        });
        // Store verification in session
        sessionStorage.setItem('superAdminVerified', 'true');
        navigate('/super-admin');
      } else {
        if (result.locked) {
          setIsLocked(true);
          setLockedUntil(result.locked_until || null);
          setIsHighAlert(result.is_high_alert || false);
          setAttemptsRemaining(0);
        } else {
          setAttemptsRemaining(result.attempts_remaining || 0);
        }
        
        toast({
          variant: 'destructive',
          title: 'Verification failed',
          description: result.error || 'Invalid verification code.'
        });
      }
    } catch (err) {
      console.error('Verification error:', err);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'An unexpected error occurred.'
      });
    }

    setLoading(false);
    setCode('');
  };

  const handleSignOut = async () => {
    sessionStorage.removeItem('superAdminVerified');
    await signOut();
    navigate('/auth');
  };

  const formatLockedUntil = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  if (checkingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted">
        <div className="animate-pulse">
          <Shield className="w-16 h-16 text-primary" />
        </div>
      </div>
    );
  }

  if (isLocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-destructive/10 p-4">
        <div className="w-full max-w-md">
          <div className="glass-effect rounded-3xl p-8 text-center space-y-6 border-2 border-destructive/30">
            <div className="w-20 h-20 mx-auto rounded-full bg-destructive/20 flex items-center justify-center">
              <Lock className="w-10 h-10 text-destructive" />
            </div>
            
            <h1 className="text-2xl font-bold text-destructive">Access Denied</h1>
            
            <div className="space-y-2">
              <p className="text-muted-foreground">
                This account has been locked due to multiple failed verification attempts.
              </p>
              
              {lockedUntil && (
                <p className="text-sm font-medium">
                  Locked until: <span className="text-destructive">{formatLockedUntil(lockedUntil)}</span>
                </p>
              )}
              
              {isHighAlert && (
                <div className="mt-4 p-3 bg-destructive/10 rounded-lg border border-destructive/30">
                  <div className="flex items-center justify-center gap-2 text-destructive">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="font-semibold">HIGH ALERT</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Suspicious activity detected. This incident has been logged.
                  </p>
                </div>
              )}
            </div>

            <Button 
              variant="outline" 
              onClick={handleSignOut}
              className="w-full mt-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="w-full max-w-md">
        <div className="glass-effect rounded-3xl p-8 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Shield className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold">Super Admin Verification</h1>
            <p className="text-sm text-muted-foreground">
              Enter your 8-character verification code to access the Super Admin panel.
            </p>
          </div>

          {/* Attempts warning */}
          {attemptsRemaining < 3 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-medium">
                  {attemptsRemaining} attempt{attemptsRemaining !== 1 ? 's' : ''} remaining
                </span>
              </div>
            </div>
          )}

          {/* Verification form */}
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Verification Code</label>
              <Input
                type="password"
                placeholder="Enter 8-character code"
                value={code}
                onChange={(e) => setCode(e.target.value.slice(0, 8))}
                maxLength={8}
                className="text-center text-lg tracking-widest font-mono"
                onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
              />
              <p className="text-xs text-muted-foreground mt-1 text-center">
                {code.length}/8 characters
              </p>
            </div>

            <Button 
              onClick={handleVerify} 
              disabled={loading || code.length !== 8}
              className="w-full"
            >
              {loading ? 'Verifying...' : 'Verify Access'}
            </Button>

            <Button 
              variant="ghost" 
              onClick={handleSignOut}
              className="w-full"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>

          {/* Security notice */}
          <div className="pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground text-center">
              🔒 This is a secure verification checkpoint. After 3 failed attempts, 
              access will be denied for 24 hours.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
