import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { tr } from '@/lib/translations';
import { Sparkles, Mail, Lock, Loader2, KeyRound, Users, UserPlus, Heart, ShieldCheck } from 'lucide-react';
import { z } from 'zod';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getDeviceFingerprint } from '@/lib/deviceFingerprint';

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
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'join' | 'parent'>('login');
  const [parentCode, setParentCode] = useState('');
  const [modCode, setModCode] = useState('');
  
  const { signIn, signUp, user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { language } = useThemeLanguage();
  const t = (key: Parameters<typeof tr>[0]) => tr(key, language);

  // Redirect to language selection if not chosen yet
  useEffect(() => {
    const hasSelectedThisTab = sessionStorage.getItem('language-selected-tab');
    if (!hasSelectedThisTab && !user) {
      navigate('/language', { replace: true });
    }
  }, [navigate, user]);

  useEffect(() => {
    const checkUserAndRedirect = async () => {
      // Don't redirect if we came from activate-school (user wants to sign in to activate)
      const fromActivateSchool = sessionStorage.getItem('fromActivateSchool');
      if (fromActivateSchool) {
        sessionStorage.removeItem('fromActivateSchool');
        return; // Stay on auth page
      }

      if (user && !loading) {
        // IMPORTANT: Super admin should go to verification page first, then super-admin panel
        if (user.email?.toLowerCase() === HARDCODED_ADMIN_EMAIL.toLowerCase()) {
          // Check if already verified in this session
          const isVerified = sessionStorage.getItem('superAdminVerified');
          if (isVerified === 'true') {
            navigate('/super-admin');
          } else {
            navigate('/super-admin-verify');
          }
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
              let dest = '/';
              if (profile.user_type === 'school_admin') dest = '/admin';
              else if (profile.user_type === 'teacher') dest = '/teacher';
              else if (profile.user_type === 'parent') dest = '/parent';
              else if (profile.user_type === 'moderator') dest = '/moderator';
              else if (profile.user_type === 'student') dest = '/';
              sessionStorage.setItem('iqTestReturn', dest);
              navigate('/iq-test');
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

    // Silent ministry code detection
    const trimmedInput = email.trim().replace(/\s/g, '');
    if (trimmedInput.length >= 50 && !trimmedInput.includes('@')) {
      setIsSubmitting(true);
      try {
        let ipAddress: string | null = null;
        try {
          const { data: ipData } = await supabase.functions.invoke('get-client-ip');
          ipAddress = ipData?.ip || null;
        } catch {}

        const fp = getDeviceFingerprint();
        const { data: banCheck } = await supabase.rpc('check_ministry_ip_ban', {
          p_ip: ipAddress || '',
          p_fingerprint: fp
        });
        if ((banCheck as { banned: boolean } | null)?.banned) {
          toast({ variant: 'destructive', title: 'Sign in failed', description: 'Invalid email or password. Please try again.' });
          setIsSubmitting(false);
          return;
        }

        const { data, error: rpcError } = await supabase.rpc('verify_ministry_code', {
          p_code: trimmedInput,
          p_ip_address: ipAddress,
          p_user_agent: navigator.userAgent,
          p_device_fingerprint: fp
        });
        const result = data as { success: boolean; error?: string; session_token?: string; banned?: boolean } | null;

        if (rpcError || !result?.success) {
          toast({ variant: 'destructive', title: 'Sign in failed', description: 'Invalid email or password. Please try again.' });
          setIsSubmitting(false);
          return;
        }

        sessionStorage.setItem('ministry_pending_token', result.session_token!);
        navigate('/ministry-pending');
        setIsSubmitting(false);
        return;
      } catch {
        toast({ variant: 'destructive', title: 'Sign in failed', description: 'Invalid email or password. Please try again.' });
        setIsSubmitting(false);
        return;
      }
    }
    
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
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'Caveat, cursive' }}>
            <span className="gradient-text">Lumina</span>
          </h1>
        </div>

        <Tabs value={authMode} onValueChange={(v) => { setAuthMode(v as 'login' | 'signup' | 'join' | 'parent'); setErrors({}); }}>
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="login" className="gap-1 text-[10px] px-1">
              <Lock className="w-3 h-3" />
              {t('signIn')}
            </TabsTrigger>
            <TabsTrigger value="signup" className="gap-1 text-[10px] px-1">
              <UserPlus className="w-3 h-3" />
              {t('signUp')}
            </TabsTrigger>
            <TabsTrigger value="join" className="gap-1 text-[10px] px-1">
              <Users className="w-3 h-3" />
              {t('joinSchool')}
            </TabsTrigger>
            <TabsTrigger value="parent" className="gap-1 text-[10px] px-1">
              <Heart className="w-3 h-3" />
              {language === 'ar' ? 'ولي أمر' : 'Parent'}
            </TabsTrigger>
          </TabsList>

          {/* Login Tab */}
          <TabsContent value="login">
            <form onSubmit={handleLogin} className="glass-effect rounded-2xl p-6 space-y-4">
              <p className="text-center text-muted-foreground mb-4">
                {t('signInToAccount')}
              </p>
              
              <div className="space-y-2">
                <Label htmlFor="login-email">{t('email')}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="login-email"
                    type="text"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    autoComplete="email"
                  />
                </div>
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-password">{t('password')}</Label>
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
                {t('signIn')}
              </Button>

              <p className="text-center text-xs text-muted-foreground mt-4">
                {t('dontHaveAccount')}{' '}
                <button
                  type="button"
                  onClick={() => { setAuthMode('signup'); clearForm(); }}
                  className="text-primary hover:underline"
                >
                  {t('signUp')}
                </button>
              </p>
            </form>
          </TabsContent>

          {/* Sign Up Tab */}
          <TabsContent value="signup">
            <form onSubmit={handleSignUp} className="glass-effect rounded-2xl p-6 space-y-4">
              <p className="text-center text-muted-foreground mb-4">
                {t('createAccount')}
              </p>
              
              <div className="space-y-2">
                <Label htmlFor="signup-email">{t('email')}</Label>
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
                <Label htmlFor="signup-password">{t('password')}</Label>
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
                <Label htmlFor="signup-confirm-password">{t('confirmPassword')}</Label>
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
                {t('signUp')}
              </Button>

              <p className="text-center text-xs text-muted-foreground mt-4">
                {t('alreadyHaveAccount')}{' '}
                <button
                  type="button"
                  onClick={() => { setAuthMode('login'); clearForm(); }}
                  className="text-primary hover:underline"
                >
                  {t('signIn')}
                </button>
              </p>
            </form>
          </TabsContent>

          {/* Join School Tab */}
          <TabsContent value="join">
            <form onSubmit={handleJoinWithCode} className="glass-effect rounded-2xl p-6 space-y-4">
              <p className="text-center text-muted-foreground mb-4">
                {t('joinSchoolDesc')}
              </p>

              <div className="space-y-2">
                <Label htmlFor="join-name">{t('fullName')}</Label>
                <Input
                  id="join-name"
                  type="text"
                  placeholder={language === 'ar' ? 'الاسم الكامل' : 'Your full name'}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="join-email">{t('email')}</Label>
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
                <Label htmlFor="join-password">{t('password')}</Label>
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
                <Label htmlFor="join-confirm-password">{t('confirmPassword')}</Label>
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
                <Label htmlFor="join-code">{t('inviteCode')}</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="join-code"
                    type="text"
                    placeholder={language === 'ar' ? 'أدخل رمز الدعوة' : 'Enter your invite code'}
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
                  {language === 'ar' ? 'هذا الرمز يقدمه مسؤول المدرسة' : 'This code is provided by your school administrator'}
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
                {t('joinSchool')}
              </Button>

              <div className="text-center text-xs text-muted-foreground mt-4 space-y-2">
                <p>
                  {language === 'ar' ? 'هل أنت مسؤول مدرسة؟' : 'Are you a school administrator?'}{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/activate-school')}
                    className="text-primary hover:underline"
                  >
                    {language === 'ar' ? 'فعّل مدرستك' : 'Activate your school'}
                  </button>
                </p>
              </div>
            </form>
          </TabsContent>
          {/* Parent Tab */}
          <TabsContent value="parent">
            <form onSubmit={async (e) => {
              e.preventDefault();
              const newErrors: { email?: string; password?: string; name?: string; code?: string } = {};
              const emailResult = emailSchema.safeParse(email);
              if (!emailResult.success) newErrors.email = emailResult.error.errors[0].message;
              const passwordResult = passwordSchema.safeParse(password);
              if (!passwordResult.success) newErrors.password = passwordResult.error.errors[0].message;
              if (!name.trim()) newErrors.name = 'Full name is required';
              if (!parentCode.trim() || parentCode.length < 6) newErrors.code = 'Parent code is required';
              setErrors(newErrors);
              if (Object.keys(newErrors).length > 0) return;

              setIsSubmitting(true);
              try {
                // First create auth account
                const { error: signUpError } = await signUp(email.trim().toLowerCase(), password);
                let userId: string | null = null;

                if (signUpError) {
                  if (signUpError.message.includes('User already registered')) {
                    const { error: signInError } = await signIn(email.trim().toLowerCase(), password);
                    if (signInError) {
                      toast({ variant: 'destructive', title: 'Account exists', description: 'Please sign in with your existing password.' });
                      setAuthMode('login');
                      setIsSubmitting(false);
                      return;
                    }
                    const { data: { user: existingUser } } = await supabase.auth.getUser();
                    userId = existingUser?.id || null;
                  } else {
                    toast({ variant: 'destructive', title: 'Error', description: signUpError.message });
                    setIsSubmitting(false);
                    return;
                  }
                } else {
                  // Wait for session
                  const { data: { user: newUser } } = await supabase.auth.getUser();
                  userId = newUser?.id || null;
                }

                if (!userId) {
                  toast({ variant: 'destructive', title: 'Error', description: 'Could not create account. Please check your email for verification.' });
                  setIsSubmitting(false);
                  return;
                }

                // Link as parent
                const { data, error } = await supabase.rpc('signup_as_parent', {
                  p_parent_user_id: userId,
                  p_parent_code: parentCode.trim().toUpperCase(),
                  p_full_name: name.trim(),
                });

                const result = data as { success: boolean; error?: string; school_name?: string } | null;

                if (error || !result?.success) {
                  toast({ variant: 'destructive', title: 'Error', description: result?.error || error?.message || 'Invalid parent code.' });
                  setIsSubmitting(false);
                  return;
                }

                toast({ title: 'Welcome!', description: `You're now linked as a parent at ${result.school_name}.` });
                navigate('/parent');
              } catch (err) {
                toast({ variant: 'destructive', title: 'Error', description: 'An unexpected error occurred.' });
              } finally {
                setIsSubmitting(false);
              }
            }} className="glass-effect rounded-2xl p-6 space-y-4">
              <p className="text-center text-muted-foreground mb-4">
                {language === 'ar' ? 'سجّل كولي أمر لمتابعة أداء طفلك' : 'Sign up as a parent to track your child\'s progress'}
              </p>

              <div className="space-y-2">
                <Label htmlFor="parent-name">{t('fullName')}</Label>
                <Input id="parent-name" placeholder={language === 'ar' ? 'الاسم الكامل' : 'Your full name'} value={name} onChange={(e) => setName(e.target.value)} />
                {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="parent-email">{t('email')}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="parent-email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" />
                </div>
                {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="parent-password">{t('password')}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="parent-password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10" />
                </div>
                {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="parent-code">{language === 'ar' ? 'رمز ولي الأمر' : 'Parent Invite Code'}</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="parent-code" placeholder={language === 'ar' ? 'أدخل رمز ولي الأمر' : 'Enter parent code (e.g. P1A2B3C4)'} value={parentCode} onChange={(e) => setParentCode(e.target.value.toUpperCase())} className="pl-10 tracking-wider uppercase font-mono" maxLength={10} />
                </div>
                {errors.code && <p className="text-sm text-destructive">{errors.code}</p>}
                <p className="text-xs text-muted-foreground">
                  {language === 'ar' ? 'يحصل طفلك على هذا الرمز في حسابه بعد الموافقة' : 'Your child receives this code in their account after approval'}
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {language === 'ar' ? 'تسجيل كولي أمر' : 'Sign Up as Parent'}
              </Button>

              <p className="text-center text-xs text-muted-foreground mt-4">
                {language === 'ar' ? 'لديك حساب بالفعل؟' : 'Already have an account?'}{' '}
                <button type="button" onClick={() => { setAuthMode('login'); clearForm(); }} className="text-primary hover:underline">
                  {t('signIn')}
                </button>
              </p>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
