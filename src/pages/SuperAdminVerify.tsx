import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, AlertTriangle, Lock, ArrowLeft, Ban, CheckCircle, Monitor, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getDeviceFingerprint } from '@/lib/deviceFingerprint';

const SUPER_ADMIN_EMAIL = 'malekismail487@gmail.com';

type AttackLog = {
  id: string;
  device_fingerprint: string;
  user_agent: string | null;
  attempt_count: number;
  status: string;
  resolved_action: string | null;
  created_at: string;
};

export default function SuperAdminVerify() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);
  const [isLocked, setIsLocked] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [isHighAlert, setIsHighAlert] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [hasAttacks, setHasAttacks] = useState(false);
  
  // Attack review modal state
  const [showAttackReview, setShowAttackReview] = useState(false);
  const [attackLogs, setAttackLogs] = useState<AttackLog[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const deviceFp = getDeviceFingerprint();

  useEffect(() => {
    const checkAccess = async () => {
      if (!user) { navigate('/auth'); return; }
      if (user.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) { navigate('/'); return; }

      try {
        const { data, error } = await supabase.rpc('check_super_admin_lock_status', {
          p_email: user.email,
          p_device_fingerprint: deviceFp,
        });

        if (!error && data) {
          const result = data as { is_super_admin: boolean; locked: boolean; locked_until?: string; is_high_alert?: boolean; has_attacks?: boolean };
          if (result.locked) {
            setIsLocked(true);
            setLockedUntil(result.locked_until || null);
            setIsHighAlert(result.is_high_alert || false);
          }
          setHasAttacks(result.has_attacks || false);
        }
      } catch (err) {
        console.error('Error:', err);
      }
      setCheckingStatus(false);
    };
    checkAccess();
  }, [user, navigate, deviceFp]);

  const fetchAttackLogs = async () => {
    setReviewLoading(true);
    const { data } = await supabase
      .from('super_admin_attack_logs')
      .select('*')
      .eq('status', 'unreviewed')
      .order('created_at', { ascending: false });
    setAttackLogs((data as AttackLog[]) || []);
    setReviewLoading(false);
  };

  const handleVerify = async () => {
    if (!user?.email || code.length !== 8) {
      toast({ variant: 'destructive', title: 'Invalid code', description: 'Please enter an 8-character verification code.' });
      return;
    }
    setLoading(true);

    try {
      const { data, error } = await supabase.rpc('verify_super_admin_code', {
        p_email: user.email,
        p_code: code,
        p_device_fingerprint: deviceFp,
        p_user_agent: navigator.userAgent,
      });

      if (error) {
        toast({ variant: 'destructive', title: 'Verification failed', description: error.message });
        setLoading(false);
        return;
      }

      const result = data as { success: boolean; error?: string; locked?: boolean; attempts_remaining?: number; is_high_alert?: boolean; locked_until?: string };

      if (result.success) {
        sessionStorage.setItem('superAdminVerified', 'true');
        
        // Check if there are unreviewed attacks - show modal before proceeding
        if (hasAttacks) {
          await fetchAttackLogs();
          if (attackLogs.length > 0 || hasAttacks) {
            await fetchAttackLogs();
            setShowAttackReview(true);
            toast({ title: '⚠️ Security Alert', description: 'Attacks detected while you were away. Please review them.' });
          } else {
            toast({ title: 'Verification successful', description: 'Welcome, Super Admin.' });
            navigate('/super-admin');
          }
        } else {
          toast({ title: 'Verification successful', description: 'Welcome, Super Admin.' });
          navigate('/super-admin');
        }
      } else {
        if (result.locked) {
          setIsLocked(true);
          setLockedUntil(result.locked_until || null);
          setIsHighAlert(result.is_high_alert || false);
          setAttemptsRemaining(0);
        } else {
          setAttemptsRemaining(result.attempts_remaining || 0);
        }
        toast({ variant: 'destructive', title: 'Verification failed', description: result.error || 'Invalid verification code.' });
      }
    } catch (err) {
      console.error('Verification error:', err);
      toast({ variant: 'destructive', title: 'Error', description: 'An unexpected error occurred.' });
    }
    setLoading(false);
    setCode('');
  };

  const handleAttackAction = async (log: AttackLog, action: 'ban' | 'let_go') => {
    setActionLoading(log.id);

    if (action === 'ban') {
      // Permanently block the device
      await supabase
        .from('super_admin_attack_attempts')
        .update({ permanently_blocked: true, updated_at: new Date().toISOString() })
        .eq('device_fingerprint', log.device_fingerprint);
    } else {
      // Let go - reset the device lockout
      await supabase
        .from('super_admin_attack_attempts')
        .update({ 
          permanently_blocked: false, 
          locked_until: null, 
          attempts: 0, 
          is_high_alert: false, 
          updated_at: new Date().toISOString() 
        })
        .eq('device_fingerprint', log.device_fingerprint);
    }

    // Update log status
    await supabase
      .from('super_admin_attack_logs')
      .update({
        status: 'resolved',
        resolved_action: action === 'ban' ? 'permanently_blocked' : 'dismissed',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', log.id);

    setActionLoading(null);
    
    // Remove from list
    setAttackLogs(prev => prev.filter(l => l.id !== log.id));
    
    toast({ 
      title: action === 'ban' ? '🚫 Device Banned' : '✅ Lockout Removed',
      description: action === 'ban' 
        ? 'The attacker will see a termination screen on every page.' 
        : 'The device lockout has been lifted.',
    });
  };

  const handleFinishReview = () => {
    setShowAttackReview(false);
    navigate('/super-admin');
  };

  const handleSignOut = async () => {
    sessionStorage.removeItem('superAdminVerified');
    await signOut();
    navigate('/auth');
  };

  const parseUserAgent = (ua: string | null) => {
    if (!ua) return 'Unknown Device';
    if (ua.includes('Mobile')) return '📱 Mobile Device';
    if (ua.includes('Windows')) return '💻 Windows PC';
    if (ua.includes('Mac')) return '💻 Mac';
    if (ua.includes('Linux')) return '💻 Linux PC';
    return '💻 Desktop';
  };

  if (checkingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted">
        <div className="animate-pulse"><Shield className="w-16 h-16 text-primary" /></div>
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
            <h1 className="text-2xl font-bold text-destructive">Device Blocked</h1>
            <div className="space-y-2">
              <p className="text-muted-foreground">
                This device has been locked due to multiple failed verification attempts.
              </p>
              {lockedUntil && lockedUntil !== 'permanent' && (
                <p className="text-sm font-medium">
                  Locked until: <span className="text-destructive">{new Date(lockedUntil).toLocaleString()}</span>
                </p>
              )}
              {lockedUntil === 'permanent' && (
                <p className="text-sm font-medium text-destructive">This device is permanently blocked.</p>
              )}
              {isHighAlert && (
                <div className="mt-4 p-3 bg-destructive/10 rounded-lg border border-destructive/30">
                  <div className="flex items-center justify-center gap-2 text-destructive">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="font-semibold">HIGH ALERT</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Suspicious activity detected. This incident has been logged.</p>
                </div>
              )}
            </div>
            <Button variant="outline" onClick={handleSignOut} className="w-full mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" /> Sign Out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Attack review modal - shown after successful verification when attacks exist
  if (showAttackReview) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-destructive/5 p-4">
        <div className="w-full max-w-lg">
          <div className="glass-effect rounded-3xl p-8 space-y-6 border border-destructive/30">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 mx-auto rounded-full bg-destructive/20 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
              <h1 className="text-2xl font-bold">🚨 Security Alert</h1>
              <p className="text-sm text-muted-foreground">
                Unauthorized access attempts were detected while you were away. Review each incident below.
              </p>
            </div>

            {reviewLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : attackLogs.length === 0 ? (
              <div className="text-center py-6">
                <Shield className="w-10 h-10 mx-auto mb-3 text-green-500" />
                <p className="text-sm text-muted-foreground">All attacks have been reviewed.</p>
                <Button onClick={handleFinishReview} className="mt-4 w-full">
                  Continue to Dashboard
                </Button>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {attackLogs.map((log) => (
                  <div key={log.id} className="glass-effect rounded-xl p-4 border border-destructive/20 space-y-3">
                    <div className="flex items-start gap-3">
                      <Monitor className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{parseUserAgent(log.user_agent)}</p>
                        <p className="text-xs text-muted-foreground">
                          {log.attempt_count} failed attempts
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(log.created_at).toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          FP: {log.device_fingerprint.slice(0, 24)}...
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleAttackAction(log, 'ban')}
                        disabled={actionLoading === log.id}
                        className="flex-1 gap-1"
                      >
                        {actionLoading === log.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />}
                        Ban Device
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAttackAction(log, 'let_go')}
                        disabled={actionLoading === log.id}
                        className="flex-1 gap-1"
                      >
                        {actionLoading === log.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                        Let Go
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {attackLogs.length > 0 && (
              <Button variant="outline" onClick={handleFinishReview} className="w-full">
                Skip & Continue to Dashboard
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="w-full max-w-md">
        <div className="glass-effect rounded-3xl p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Shield className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold">Super Admin Verification</h1>
            <p className="text-sm text-muted-foreground">Enter your 8-character verification code.</p>
          </div>

          {hasAttacks && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-medium">⚠️ Attack attempts detected! Verify to review them.</span>
              </div>
            </div>
          )}

          {attemptsRemaining < 3 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-medium">{attemptsRemaining} attempt{attemptsRemaining !== 1 ? 's' : ''} remaining</span>
              </div>
            </div>
          )}

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
              <p className="text-xs text-muted-foreground mt-1 text-center">{code.length}/8 characters</p>
            </div>
            <Button onClick={handleVerify} disabled={loading || code.length !== 8} className="w-full">
              {loading ? 'Verifying...' : 'Verify Access'}
            </Button>
            <Button variant="ghost" onClick={handleSignOut} className="w-full">
              <ArrowLeft className="w-4 h-4 mr-2" /> Sign Out
            </Button>
          </div>

          <div className="pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground text-center">
              🔒 Secure verification. After 3 failed attempts, this device will be locked for 24 hours. Your account remains accessible from other devices.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
