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
import { Mail, Lock, Loader2, KeyRound, Users, UserPlus, Heart, ShieldCheck, Globe } from 'lucide-react';
import { LuminaLogo } from '@/components/LuminaLogo';
import { z } from 'zod';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getDeviceFingerprint } from '@/lib/deviceFingerprint';
import { getSelectedTenant, reconcileTenantFromCode, setSelectedTenant } from '@/lib/selectedTenant';
import { SUPER_ADMIN_EMAIL } from '@/lib/config';
import { lovable } from '@/integrations/lovable/index';

const emailSchema = z.string().email('Please enter a valid email address');
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters');
// Existing accounts may predate the 8-char rule; sign-in must not lock them out.
const loginPasswordSchema = z.string().min(1, 'Please enter your password');
const codeSchema = z.string().min(6, 'Invite code must be at least 6 characters');

type AuthMode = 'login' | 'signup' | 'join' | 'parent' | 'social-verify' | 'social-details';
type SocialOnboardingFlow = 'account' | 'join' | 'parent';
type AuthErrors = {
  email?: string;
  password?: string;
  confirmPassword?: string;
  code?: string;
  name?: string;
  verificationCode?: string;
};

const SOCIAL_FLOW_KEY = 'luminaSocialOnboardingFlow';
const SOCIAL_VERIFIED_KEY = 'luminaSocialEmailVerified';
const SOCIAL_LAST_SENT_AT_KEY = 'luminaSocialVerificationLastSentAt';
const SOCIAL_SENT_EMAIL_KEY = 'luminaSocialVerificationEmail';
const VERIFICATION_COOLDOWN_SECONDS = 60;

const readSocialFlow = (): SocialOnboardingFlow | null => {
  const value = sessionStorage.getItem(SOCIAL_FLOW_KEY);
  return value === 'account' || value === 'join' || value === 'parent' ? value : null;
};

const getVerificationCooldownSeconds = () => {
  const sentAt = Number(sessionStorage.getItem(SOCIAL_LAST_SENT_AT_KEY) || '0');
  if (!Number.isFinite(sentAt) || sentAt <= 0) return 0;
  const elapsed = Math.floor((Date.now() - sentAt) / 1000);
  return Math.max(0, VERIFICATION_COOLDOWN_SECONDS - elapsed);
};

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<AuthErrors>({});
  const [authMode, setAuthMode] = useState<AuthMode>(() => {
    const storedFlow = readSocialFlow();
    if (!storedFlow) return 'login';
    return sessionStorage.getItem(SOCIAL_VERIFIED_KEY) === 'true' && storedFlow !== 'account'
      ? 'social-details'
      : 'social-verify';
  });
  const [parentCode, setParentCode] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [socialFlow, setSocialFlow] = useState<SocialOnboardingFlow | null>(() => readSocialFlow());
  const [verificationCooldown, setVerificationCooldown] = useState(() => getVerificationCooldownSeconds());
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  
  const { signIn, signUp, signOut, user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { language } = useThemeLanguage();
  const t = (key: Parameters<typeof tr>[0]) => tr(key, language);
  const [selectedCountry, setSelectedCountry] = useState(() => getSelectedTenant());

  const applyTenantOverride = (response: {
    tenant_id?: string | null;
    tenant_slug?: string | null;
    tenant_name?: string | null;
  }) => {
    const outcome = reconcileTenantFromCode(response);
    setSelectedCountry(getSelectedTenant());
    if (outcome.overridden) {
      toast({
        title: language === 'ar' ? 'تم تحديث الدولة' : 'Country updated',
        description:
          language === 'ar'
            ? `تم تغيير اختيارك إلى ${outcome.to} لأن الرمز يخص هذه الدولة.`
            : `Your country was updated to ${outcome.to} because your code belongs there.`,
      });
    }
  };

  const clearSocialOnboarding = () => {
    sessionStorage.removeItem(SOCIAL_FLOW_KEY);
    sessionStorage.removeItem(SOCIAL_VERIFIED_KEY);
    sessionStorage.removeItem(SOCIAL_LAST_SENT_AT_KEY);
    sessionStorage.removeItem(SOCIAL_SENT_EMAIL_KEY);
    setSocialFlow(null);
    setVerificationCode('');
    setVerificationCooldown(0);
  };

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
        const activeSocialFlow = readSocialFlow();
        const socialEmailVerified = sessionStorage.getItem(SOCIAL_VERIFIED_KEY) === 'true';
        if (activeSocialFlow) {
          setSocialFlow(activeSocialFlow);
          if (!socialEmailVerified) {
            setAuthMode('social-verify');
            return;
          }
          if (activeSocialFlow === 'join' || activeSocialFlow === 'parent') {
            setAuthMode('social-details');
            return;
          }
        }

        // Super Admin verification is only reachable after the dedicated admin-code login path.
        // Social OAuth and normal sessions for the reserved email must not expose the verifier.
        if (user.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
          const hasAdminLoginIntent = sessionStorage.getItem('superAdminLoginIntent') === 'true';

          if (!hasAdminLoginIntent) {
            sessionStorage.removeItem('superAdminVerified');
            await signOut();
            toast({
              variant: 'destructive',
              title: 'Admin access protected',
              description: 'Use the dedicated admin code flow to access Super Admin verification.',
            });
            return;
          }

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
              if (profile.user_type === 'moderator') {
                navigate('/moderator-pending');
              } else {
                navigate('/pending-approval');
              }
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
  }, [user, loading, navigate, signOut, toast]);

  const clearForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setInviteCode('');
    setName('');
    setParentCode('');
    setVerificationCode('');
    setErrors({});
  };

  useEffect(() => {
    const interval = window.setInterval(() => {
      setVerificationCooldown(getVerificationCooldownSeconds());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const requestSocialVerificationCode = async (silent = false) => {
    const currentEmail = user?.email?.toLowerCase();
    if (!currentEmail) {
      if (!silent) {
        toast({
          variant: 'destructive',
          title: 'Verification unavailable',
          description: 'Please finish signing in with Google or Apple first.',
        });
      }
      return;
    }

    const remaining = getVerificationCooldownSeconds();
    if (remaining > 0) {
      setVerificationCooldown(remaining);
      if (!silent) {
        toast({
          title: 'Please wait',
          description: `You can request another code in ${remaining} seconds.`,
        });
      }
      return;
    }

    setIsSendingCode(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: currentEmail,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/auth`,
        },
      });

      if (error) {
        toast({
          variant: 'destructive',
          title: 'Code not sent',
          description: error.message,
        });
        return;
      }

      sessionStorage.setItem(SOCIAL_LAST_SENT_AT_KEY, String(Date.now()));
      sessionStorage.setItem(SOCIAL_SENT_EMAIL_KEY, currentEmail);
      setVerificationCooldown(VERIFICATION_COOLDOWN_SECONDS);
      if (!silent) {
        toast({
          title: 'Verification code sent',
          description: `Check ${currentEmail} for the code.`,
        });
      }
    } finally {
      setIsSendingCode(false);
    }
  };

  useEffect(() => {
    const currentEmail = user?.email?.toLowerCase();
    if (authMode !== 'social-verify' || !currentEmail) return;
    if (sessionStorage.getItem(SOCIAL_VERIFIED_KEY) === 'true') return;
    const sentEmail = sessionStorage.getItem(SOCIAL_SENT_EMAIL_KEY);
    if (sentEmail === currentEmail && getVerificationCooldownSeconds() > 0) return;
    void requestSocialVerificationCode(true);
  }, [authMode, user?.email]);

  const handleVerifySocialCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentEmail = user?.email?.toLowerCase();
    const token = verificationCode.trim();

    if (!currentEmail) {
      toast({ variant: 'destructive', title: 'Verification failed', description: 'No signed-in account was found.' });
      return;
    }
    if (token.length < 6) {
      setErrors({ verificationCode: 'Enter the verification code from your email.' });
      return;
    }

    setIsVerifyingCode(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: currentEmail,
        token,
        type: 'email',
      });

      if (error) {
        setErrors({ verificationCode: error.message });
        return;
      }

      setErrors({});
      sessionStorage.setItem(SOCIAL_VERIFIED_KEY, 'true');
      const activeFlow = socialFlow ?? readSocialFlow();
      if (activeFlow === 'join' || activeFlow === 'parent') {
        setSocialFlow(activeFlow);
        setAuthMode('social-details');
        return;
      }

      clearSocialOnboarding();
      navigate('/');
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handleSocialDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeFlow = socialFlow ?? readSocialFlow();
    const currentEmail = user?.email?.toLowerCase();
    const currentUserId = user?.id;
    const code = activeFlow === 'parent' ? parentCode.trim().toUpperCase() : inviteCode.trim().toUpperCase();
    const newErrors: AuthErrors = {};

    if (!currentEmail || !currentUserId) newErrors.email = 'Please sign in with Google or Apple again.';
    if (!name.trim()) newErrors.name = 'Full name is required';
    if (!activeFlow || activeFlow === 'account') newErrors.code = 'Choose Join School or Parent first.';
    if (!code || code.length < 6) newErrors.code = activeFlow === 'parent' ? 'Parent code is required' : 'Invite code is required';

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0 || !currentEmail || !currentUserId || !activeFlow || activeFlow === 'account') return;

    setIsSubmitting(true);
    try {
      if (activeFlow === 'join') {
        const { data, error } = await supabase.rpc('signup_with_invite_code', {
          p_email: currentEmail,
          p_full_name: name.trim(),
          p_invite_code: code,
        });

        const result = data as {
          success: boolean;
          error?: string;
          role?: string;
          tenant_id?: string;
          tenant_slug?: string;
          tenant_name?: string;
        } | null;

        if (error || !result?.success) {
          toast({ variant: 'destructive', title: 'Request failed', description: result?.error || error?.message || 'Invalid invite code.' });
          return;
        }

        applyTenantOverride(result);
        await supabase.rpc('link_profile_after_signup', { p_user_id: currentUserId, p_email: currentEmail });
        toast({
          title: 'Request submitted',
          description: result.role === 'teacher'
            ? 'Your teacher request is pending school approval.'
            : 'Your student request is pending school approval.',
        });
        clearSocialOnboarding();
        navigate('/pending-approval');
        return;
      }

      const { data, error } = await supabase.rpc('signup_as_parent', {
        p_parent_user_id: currentUserId,
        p_parent_code: code,
        p_full_name: name.trim(),
      });

      const result = data as {
        success: boolean;
        error?: string;
        school_name?: string;
        tenant_id?: string;
        tenant_slug?: string;
        tenant_name?: string;
      } | null;

      if (error || !result?.success) {
        toast({ variant: 'destructive', title: 'Parent link failed', description: result?.error || error?.message || 'Invalid parent code.' });
        return;
      }

      applyTenantOverride(result);
      toast({ title: 'Welcome!', description: `You're now linked as a parent at ${result.school_name}.` });
      clearSocialOnboarding();
      navigate('/parent');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSocialSignIn = async (provider: 'google' | 'apple', flow: SocialOnboardingFlow) => {
    setIsSubmitting(true);
    try {
      sessionStorage.removeItem('superAdminLoginIntent');
      sessionStorage.removeItem('superAdminVerified');
      sessionStorage.setItem(SOCIAL_FLOW_KEY, flow);
      sessionStorage.removeItem(SOCIAL_VERIFIED_KEY);
      sessionStorage.removeItem(SOCIAL_LAST_SENT_AT_KEY);
      sessionStorage.removeItem(SOCIAL_SENT_EMAIL_KEY);
      setSocialFlow(flow);
      setVerificationCode('');

      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: `${window.location.origin}/auth`,
        ...(provider === 'google'
          ? { extraParams: { prompt: 'select_account' } }
          : {}),
      });
      if (result.error) {
        toast({
          variant: 'destructive',
          title: 'Sign in failed',
          description: result.error.message || `Could not sign in with ${provider}.`,
        });
        setIsSubmitting(false);
        return;
      }
      if (result.redirected) return;
      setAuthMode('social-verify');
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Sign in failed',
        description: err instanceof Error ? err.message : 'Unexpected error',
      });
      setIsSubmitting(false);
    }
  };

  const SocialAuthButtons = ({ flow }: { flow: SocialOnboardingFlow }) => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => handleSocialSignIn('google', flow)}
          disabled={isSubmitting}
          className="w-full"
        >
          <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
          </svg>
          Google
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => handleSocialSignIn('apple', flow)}
          disabled={isSubmitting}
          className="w-full"
        >
          <svg className="w-4 h-4 mr-2 fill-current" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M16.365 1.43c0 1.14-.4 2.23-1.19 3.07-.78.85-2.06 1.5-3.13 1.42-.13-1.1.4-2.24 1.14-3.03.83-.9 2.24-1.55 3.18-1.46zM20.5 17.4c-.55 1.27-.82 1.84-1.53 2.96-1 1.55-2.41 3.48-4.16 3.49-1.55.02-1.95-1-4.06-.98-2.11.01-2.55 1-4.1.98C4.9 23.84 3.56 22.1 2.56 20.56.86 17.92-.03 14.62.63 11.66c.5-2.26 2.05-3.79 3.98-4.13 1.86-.33 3.61.88 4.79.88 1.17 0 3.31-1.09 5.57-.93.95.04 3.62.38 5.33 2.88-.14.09-3.18 1.86-3.15 5.53.04 4.39 3.83 5.85 3.87 5.87-.03.08-.6 2.06-1.52 3.64z"/>
          </svg>
          Apple
        </Button>
      </div>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-background px-2 text-muted-foreground">
            {language === 'ar' ? 'أو تابع بالبريد' : 'or continue with email'}
          </span>
        </div>
      </div>
    </div>
  );

  const validateLoginForm = () => {
    const newErrors: { email?: string; password?: string } = {};
    
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      newErrors.email = emailResult.error.errors[0].message;
    }
    
    const passwordResult = loginPasswordSchema.safeParse(password);
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
        const result = data as { success: boolean; error?: string; session_token?: string; banned?: boolean; tenant_id?: string; tenant_slug?: string; tenant_name?: string } | null;

        if (rpcError || !result?.success) {
          toast({ variant: 'destructive', title: 'Sign in failed', description: 'Invalid email or password. Please try again.' });
          setIsSubmitting(false);
          return;
        }

        // Ministry codes are tenant-bound — reconcile with the pre-auth pick.
        if (result.tenant_id) applyTenantOverride({ tenant_id: result.tenant_id, tenant_slug: result.tenant_slug, tenant_name: result.tenant_name });
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
      const isHardcodedAdmin = email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
      
      // If this is the hardcoded admin email, check if password is the admin key
      if (isHardcodedAdmin) {
        const isAdminKey = await verifyAdminCode(password);
        
        if (isAdminKey) {
          sessionStorage.setItem('superAdminLoginIntent', 'true');
          sessionStorage.removeItem('superAdminVerified');

          // Try to sign in with the admin key as password
          const { error } = await signIn(email, password);
          
          if (error) {
            // If login fails, the account might not exist or has different password
            const { error: signUpError } = await signUp(email, password);
            
            if (signUpError && !signUpError.message.includes('User already registered')) {
              sessionStorage.removeItem('superAdminLoginIntent');
              toast({
                variant: 'destructive',
                title: 'Admin setup failed',
                description: signUpError.message,
              });
            } else if (signUpError?.message.includes('User already registered')) {
              sessionStorage.removeItem('superAdminLoginIntent');
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
      sessionStorage.removeItem('superAdminLoginIntent');
      sessionStorage.removeItem('superAdminVerified');
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

      const result = data as {
        success: boolean;
        error?: string;
        message?: string;
        tenant_id?: string;
        tenant_slug?: string;
        tenant_name?: string;
      };
      
      if (!result.success) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to submit request',
        });
        setIsSubmitting(false);
        return;
      }

      // School codes carry a tenant — reconcile with the pre-auth pick.
      applyTenantOverride(result);

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
          <div className="w-28 h-28 rounded-3xl overflow-hidden mb-4">
            <LuminaLogo size={112} />
          </div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'Caveat, cursive' }}>
            <span className="gradient-text">Lumina</span>
          </h1>
        </div>

        {selectedCountry.name && (
          <button
            type="button"
            onClick={() => navigate('/country')}
            className="w-full mb-3 flex items-center justify-between px-4 py-2 rounded-xl bg-muted/40 border border-border/50 hover:bg-muted transition text-xs"
          >
            <span className="flex items-center gap-2 text-muted-foreground">
              <Globe className="w-3.5 h-3.5" />
              <span>{language === 'ar' ? 'الدولة:' : 'Country:'}</span>
              <span className="font-medium text-foreground">{selectedCountry.name}</span>
            </span>
            <span className="text-primary">{language === 'ar' ? 'تغيير' : 'Change'}</span>
          </button>
        )}


        <Tabs
          value={authMode}
          onValueChange={(v) => {
            const nextMode = v as AuthMode;
            if (nextMode === 'login' || nextMode === 'signup' || nextMode === 'join' || nextMode === 'parent') {
              clearSocialOnboarding();
              setAuthMode(nextMode);
              setErrors({});
            }
          }}
        >
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

              <SocialAuthButtons flow="account" />
              
              
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

              <SocialAuthButtons flow="account" />
              
              
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

              <SocialAuthButtons flow="join" />



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

                const result = data as {
                  success: boolean;
                  error?: string;
                  school_name?: string;
                  tenant_id?: string;
                  tenant_slug?: string;
                  tenant_name?: string;
                } | null;

                if (error || !result?.success) {
                  toast({ variant: 'destructive', title: 'Error', description: result?.error || error?.message || 'Invalid parent code.' });
                  setIsSubmitting(false);
                  return;
                }

                // Parent codes carry a tenant — reconcile with the pre-auth pick.
                if (result) applyTenantOverride(result);
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

              <SocialAuthButtons flow="parent" />



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
          <TabsContent value="social-verify">
            <form onSubmit={handleVerifySocialCode} className="glass-effect rounded-2xl p-6 space-y-4">
              <div className="text-center space-y-2">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <h2 className="text-xl font-bold">
                  {language === 'ar' ? 'تحقق من بريدك الإلكتروني' : 'Verify your email'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {language === 'ar'
                    ? `أرسلنا رمز تحقق إلى ${user?.email ?? 'بريدك الإلكتروني'}.`
                    : `We sent a verification code to ${user?.email ?? 'your email'}.`}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="social-verification-code">
                  {language === 'ar' ? 'رمز التحقق' : 'Verification code'}
                </Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="social-verification-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder={language === 'ar' ? 'أدخل الرمز' : 'Enter the code'}
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\s/g, ''))}
                    className="pl-10 tracking-wider font-mono"
                  />
                </div>
                {errors.verificationCode && <p className="text-sm text-destructive">{errors.verificationCode}</p>}
              </div>

              <Button type="submit" className="w-full" disabled={isVerifyingCode || !verificationCode.trim()}>
                {isVerifyingCode && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {language === 'ar' ? 'تحقق' : 'Verify'}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={isSendingCode || verificationCooldown > 0}
                onClick={() => requestSocialVerificationCode(false)}
              >
                {isSendingCode && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {verificationCooldown > 0
                  ? (language === 'ar' ? `إعادة الإرسال خلال ${verificationCooldown}ث` : `Resend in ${verificationCooldown}s`)
                  : (language === 'ar' ? 'إرسال رمز جديد' : 'Send a new code')}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={async () => {
                  clearSocialOnboarding();
                  await signOut();
                  setAuthMode('login');
                }}
              >
                {language === 'ar' ? 'استخدام حساب آخر' : 'Use another account'}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="social-details">
            <form onSubmit={handleSocialDetailsSubmit} className="glass-effect rounded-2xl p-6 space-y-4">
              <div className="text-center space-y-2">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  {socialFlow === 'parent' ? <Heart className="h-6 w-6" /> : <Users className="h-6 w-6" />}
                </div>
                <h2 className="text-xl font-bold">
                  {socialFlow === 'parent'
                    ? (language === 'ar' ? 'ربط حساب ولي الأمر' : 'Link parent account')
                    : (language === 'ar' ? 'الانضمام إلى المدرسة' : 'Join your school')}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {language === 'ar'
                    ? `تم التحقق من ${user?.email ?? 'بريدك الإلكتروني'}.`
                    : `${user?.email ?? 'Your email'} is verified.`}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="social-name">{t('fullName')}</Label>
                <Input
                  id="social-name"
                  type="text"
                  placeholder={language === 'ar' ? 'الاسم الكامل' : 'Your full name'}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="social-onboarding-code">
                  {socialFlow === 'parent'
                    ? (language === 'ar' ? 'رمز ولي الأمر' : 'Parent Invite Code')
                    : t('inviteCode')}
                </Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="social-onboarding-code"
                    type="text"
                    placeholder={socialFlow === 'parent'
                      ? (language === 'ar' ? 'أدخل رمز ولي الأمر' : 'Enter parent code')
                      : (language === 'ar' ? 'أدخل رمز الدعوة' : 'Enter your invite code')}
                    value={socialFlow === 'parent' ? parentCode : inviteCode}
                    onChange={(e) => {
                      const value = e.target.value.toUpperCase();
                      if (socialFlow === 'parent') setParentCode(value);
                      else setInviteCode(value);
                    }}
                    className="pl-10 tracking-wider uppercase font-mono"
                  />
                </div>
                {errors.code && <p className="text-sm text-destructive">{errors.code}</p>}
                <p className="text-xs text-muted-foreground">
                  {socialFlow === 'parent'
                    ? (language === 'ar' ? 'يحصل طفلك على هذا الرمز في حسابه بعد الموافقة' : 'Your child receives this code in their account after approval')
                    : (language === 'ar' ? 'يحدد رمز الدعوة تلقائيًا هل أنت طالب أم معلم.' : 'The invite code automatically determines whether you join as a student or teacher.')}
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {socialFlow === 'parent'
                  ? (language === 'ar' ? 'ربط ولي الأمر' : 'Link Parent')
                  : t('joinSchool')}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={async () => {
                  clearSocialOnboarding();
                  await signOut();
                  setAuthMode(socialFlow === 'parent' ? 'parent' : 'join');
                }}
              >
                {language === 'ar' ? 'استخدام حساب آخر' : 'Use another account'}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
