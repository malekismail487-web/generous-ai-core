import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useAuth } from '@/hooks/useAuth';
import { Navigate, useNavigate } from 'react-router-dom';
import { Loader2, KeyRound, Users, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export default function JoinWithCode() {
  const { user, loading: authLoading } = useAuth();
  const { loading, profile, isSuperAdmin, isSchoolAdmin, isTeacher, isStudent } = useRoleGuard();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [joining, setJoining] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleJoin = async () => {
    if (!code.trim() || !name.trim() || !email.trim()) {
      toast({ variant: 'destructive', title: 'Please fill all fields' });
      return;
    }

    setJoining(true);

    // Find the invite code
    const { data: inviteCode, error: codeError } = await supabase
      .from('invite_codes')
      .select('*')
      .eq('code', code.trim().toUpperCase())
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (codeError || !inviteCode) {
      toast({ variant: 'destructive', title: 'Invalid or expired invite code' });
      setJoining(false);
      return;
    }

    // Create invite request
    const { error: requestError } = await supabase
      .from('invite_requests')
      .insert({
        code_id: inviteCode.id,
        name: name.trim(),
        email: email.trim(),
        user_id: user?.id || null
      });

    if (requestError) {
      toast({ variant: 'destructive', title: 'Error submitting request' });
      console.error(requestError);
      setJoining(false);
      return;
    }

    setSuccess(true);
    setJoining(false);
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Already has a role - redirect
  if (isSuperAdmin) {
    return <Navigate to="/super-admin" replace />;
  }
  if (isSchoolAdmin) {
    return <Navigate to="/admin" replace />;
  }
  if (isTeacher && profile?.is_active) {
    return <Navigate to="/teacher" replace />;
  }
  if (isStudent && profile?.is_active) {
    return <Navigate to="/student" replace />;
  }

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <div className="ambient-glow" />
        <div className="glass-effect rounded-2xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Request Submitted!</h1>
          <p className="text-muted-foreground mb-6">
            Your request has been submitted. You will be notified once your school administrator approves your account.
          </p>
          <Button onClick={() => navigate('/auth')} variant="outline" className="w-full">
            Go to Login
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
            <Users className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Join a School</h1>
          <p className="text-muted-foreground">
            Enter the invite code provided by your school administrator
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              type="text"
              placeholder="Your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="code">Invite Code</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="code"
                type="text"
                placeholder="Enter invite code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="pl-10 tracking-wider uppercase"
                maxLength={10}
              />
            </div>
          </div>

          <Button
            onClick={handleJoin}
            disabled={joining || !code.trim() || !name.trim() || !email.trim()}
            className="w-full"
          >
            {joining ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Request'
            )}
          </Button>

          <div className="text-center space-y-2">
            <p className="text-xs text-muted-foreground">
              Are you a school administrator?
            </p>
            <Button
              variant="link"
              onClick={() => navigate('/activate-school')}
              className="text-xs"
            >
              Activate your school instead
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
