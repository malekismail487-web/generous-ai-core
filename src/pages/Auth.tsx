import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, Mail, Lock, Loader2, KeyRound, Users, UserPlus } from 'lucide-react';
import { z } from 'zod';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const emailSchema = z.string().email('Please enter a valid email address');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');
const codeSchema = z.string().min(6, 'Invite code must be at least 6 characters');

// Hardcoded admin email - uses admin key as password
const HARDCODED_ADMIN_EMAIL = 'malekismail487@gmail.com';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirmPassword?: string; code?: string; name?: string }>({});
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'join'>('login');
  
  const { signIn, signUp, user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const checkUserAndRedirect = async () => {
      // Don't redirect if we came from activate-school (user wants to sign in to activate)
      const fromActivateSchool = sessionStorage.getItem('fromActivateSchool');
      if (fromActivateSchool) {
        sessionStorage.removeItem('fromActivateSchool');
        return; // Stay on auth page
      }

      if (user && !loading) {
        // IMPORTANT: Super admin should always go to super-admin page, never pending approval
        if (user.email?.toLowerCase() === HARDCODED_ADMIN_EMAIL.toLowerCase()) {
          navigate('/super-admin');
          return;
        }

        // Check if user has a profile - first by ID, then by email
        let profile = null;
        
        const { data: idProfile } = await supabase
          .from('profiles')
          .select('status, is_active, user_type')
          .eq('id', user.id)
          .maybeSingle();
        
        profile = idProfile;
        
        // If not found by ID, try by email
        if (!profile && user.email) {
          const { data: emailProfiles } = await supabase
            .from('profiles')
            .select('status, is_active, user_type')
            .eq('email', user.email.toLowerCase())
            .order('is_active', { ascending: false });
          
          if (emailProfiles && emailProfiles.length > 0) {
            // Prefer approved/active profiles
            const approvedProfile = emailProfiles.find(p => p.status === 'approved' && p.is_active);
            profile = approvedProfile || emailProfiles[0];
          }
        }
        
        if (profile) {
          if (profile.status === 'pending' || profile.status === 'rejected') {
            navigate('/pending-approval');
          } else if (profile.status === 'approved' && profile.is_active) {
            // Redirect based on user type
            if (profile.user_type === 'school_admin') {
              navigate('/admin');
            } else if (profile.user_type === 'teacher') {
              navigate('/teacher');
            } else {
              navigate('/');
            }
          } else {
            navigate('/');
          }
        } else {
          // No profile - go to main app (or activate school for new admins)
          navigate('/');
        }
      }
    };
    
    checkUserAndRedirect();
  }, [user, loading, navigate]);

  const clearForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setInviteCode('');
    setName('');
    setErrors({});
  };

  const validateLoginForm = () => {
    const newErrors: { email?: string; password?: string } = {};
    
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      newErrors.email = emailResult.error.errors[0].message;
    }
    
    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) {
      newErrors.password = passwordResult.error.errors[0].message;
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateSignUpForm = () => {
    const newErrors: { email?: string; password?: string; confirmPassword?: string } = {};
    
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      newErrors.email = emailResult.error.errors[0].message;
    }
    
    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) {
      newErrors.password = passwordResult.error.errors[0].message;
    }
    
    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateJoinForm = () => {
    const newErrors: { email?: string; code?: string; name?: string; password?: string; confirmPassword?: string } = {};
    
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      newErrors.email = emailResult.error.errors[0].message;
    }

    if (!name.trim()) {
      newErrors.name = 'Full name is required';
    }
    
    const codeResult = codeSchema.safeParse(inviteCode);
    if (!codeResult.success) {
      newErrors.code = codeResult.error.errors[0].message;
    }

    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) {
      newErrors.password = passwordResult.error.errors[0].message;
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Check if the password is the admin access code
  const verifyAdminCode = async (code: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('verify_admin_access_code', {
        input_code: code
      });
      return data === true && !error;
    } catch {
      return false;
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateLoginForm()) return;
    
    setIsSubmitting(true);
    
    try {
      const isHardcodedAdmin = email.toLowerCase() === HARDCODED_ADMIN_EMAIL.toLowerCase();
      
      // If this is the hardcoded admin email, check if password is the admin key
      if (isHardcodedAdmin) {
        const isAdminKey = await verifyAdminCode(password);
        
        if (isAdminKey) {
          // Try to sign in with the admin key as password
          const { error } = await signIn(email, password);
          
          if (error) {
            // If login fails, the account might not exist or has different password
            const { error: signUpError } = await signUp(email, password);
            
            if (signUpError && !signUpError.message.includes('User already registered')) {
              toast({
                variant: 'destructive',
                title: 'Admin setup failed',
                description: signUpError.message,
              });
            } else if (signUpError?.message.includes('User already registered')) {
              toast({
                variant: 'destructive',
                title: 'Password mismatch',
                description: 'Admin account exists with a different password.',
              });
            } else {
              toast({
                title: 'Admin account created!',
                description: 'You can now sign in with your admin credentials.',
              });
              await signIn(email, password);
            }
          }
          setIsSubmitting(false);
          return;
        }
      }
      
      // Normal login flow
      const { error } = await signIn(email, password);
      
      if (error) {
        let message = error.message;
        if (message.includes('Invalid login credentials')) {
          message = 'Invalid email or password. Please try again.';
        }
        toast({
          variant: 'destructive',
          title: 'Sign in failed',
          description: message,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateSignUpForm()) return;
    
    setIsSubmitting(true);
    
    try {
      const { error } = await signUp(email, password);
      
      if (error) {
        let message = error.message;
        if (message.includes('User already registered')) {
          message = 'An account with this email already exists. Please sign in.';
        }
        toast({
          variant: 'destructive',
          title: 'Sign up failed',
          description: message,
        });
      } else {
        toast({
          title: 'Account created!',
          description: 'Please check your email to verify your account.',
        });
        clearForm();
        setAuthMode('login');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoinWithCode = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateJoinForm()) return;
    
    setIsSubmitting(true);
    
    try {
      // First, validate the invite code and create the request
      const { data, error } = await supabase.rpc('signup_with_invite_code', {
        p_email: email.trim().toLowerCase(),
        p_full_name: name.trim(),
        p_invite_code: inviteCode.trim().toUpperCase()
      });

      if (error) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: error.message,
        });
        setIsSubmitting(false);
        return;
      }

      const result = data as { success: boolean; error?: string; message?: string };
      
      if (!result.success) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to submit request',
        });
        setIsSubmitting(false);
        return;
      }

      // Request created successfully, now create the auth account
      const { error: signUpError } = await signUp(email.trim().toLowerCase(), password);
      
      if (signUpError) {
        // If user already exists, try to sign them in
        if (signUpError.message.includes('User already registered')) {
          const { error: signInError } = await signIn(email.trim().toLowerCase(), password);
          if (signInError) {
            toast({
              variant: 'destructive',
              title: 'Account exists',
              description: 'Please sign in with your existing password.',
            });
            setAuthMode('login');
            setIsSubmitting(false);
            return;
          }
        } else {
          toast({
            variant: 'destructive',
            title: 'Account creation failed',
            description: signUpError.message,
          });
          setIsSubmitting(false);
          return;
        }
      }

      toast({
        title: 'Request Submitted!',
        description: 'Your request is pending approval from your school administrator.',
      });
      
      // Navigate to pending approval page
      navigate('/pending-approval');
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'An unexpected error occurred',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-4 glow-effect">
            <Sparkles className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">
            <span className="gradient-text">Study Bright AI</span>
          </h1>
        </div>

        <Tabs value={authMode} onValueChange={(v) => { setAuthMode(v as 'login' | 'signup' | 'join'); setErrors({}); }}>
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="login" className="gap-2">
              <Lock className="w-4 h-4" />
              Sign In
            </TabsTrigger>
            <TabsTrigger value="signup" className="gap-2">
              <UserPlus className="w-4 h-4" />
              Sign Up
            </TabsTrigger>
            <TabsTrigger value="join" className="gap-2">
              <Users className="w-4 h-4" />
              Join School
            </TabsTrigger>
          </TabsList>

          {/* Login Tab */}
          <TabsContent value="login">
            <form onSubmit={handleLogin} className="glass-effect rounded-2xl p-6 space-y-4">
              <p className="text-center text-muted-foreground mb-4">
                Sign in to your account
              </p>
              
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {errors.password && (
                  <p className="text-sm text-destructive">{errors.password}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Sign In
              </Button>

              <p className="text-center text-xs text-muted-foreground mt-4">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => { setAuthMode('signup'); clearForm(); }}
                  className="text-primary hover:underline"
                >
                  Sign up
                </button>
              </p>
            </form>
          </TabsContent>

          {/* Sign Up Tab */}
          <TabsContent value="signup">
            <form onSubmit={handleSignUp} className="glass-effect rounded-2xl p-6 space-y-4">
              <p className="text-center text-muted-foreground mb-4">
                Create a new account
              </p>
              
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {errors.password && (
                  <p className="text-sm text-destructive">{errors.password}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-confirm-password">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="signup-confirm-password"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive">{errors.confirmPassword}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Create Account
              </Button>

              <p className="text-center text-xs text-muted-foreground mt-4">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => { setAuthMode('login'); clearForm(); }}
                  className="text-primary hover:underline"
                >
                  Sign in
                </button>
              </p>
            </form>
          </TabsContent>

          {/* Join School Tab */}
          <TabsContent value="join">
            <form onSubmit={handleJoinWithCode} className="glass-effect rounded-2xl p-6 space-y-4">
              <p className="text-center text-muted-foreground mb-4">
                Join your school with an invite code
              </p>

              <div className="space-y-2">
                <Label htmlFor="join-name">Full Name</Label>
                <Input
                  id="join-name"
                  type="text"
                  placeholder="Your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="join-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="join-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="join-password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="join-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {errors.password && (
                  <p className="text-sm text-destructive">{errors.password}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="join-confirm-password">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="join-confirm-password"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive">{errors.confirmPassword}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="join-code">Invite Code</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="join-code"
                    type="text"
                    placeholder="Enter your invite code"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    className="pl-10 tracking-wider uppercase"
                    maxLength={10}
                  />
                </div>
                {errors.code && (
                  <p className="text-sm text-destructive">{errors.code}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  This code is provided by your school administrator
                </p>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Join School
              </Button>

              <div className="text-center text-xs text-muted-foreground mt-4 space-y-2">
                <p>
                  Are you a school administrator?{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/activate-school')}
                    className="text-primary hover:underline"
                  >
                    Activate your school
                  </button>
                </p>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
