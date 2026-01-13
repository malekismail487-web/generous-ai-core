import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, Mail, Lock, Loader2 } from 'lucide-react';
import { z } from 'zod';

const emailSchema = z.string().email('Please enter a valid email address');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');

// Hardcoded admin email - uses admin key as password
const HARDCODED_ADMIN_EMAIL = 'malekismail487@gmail.com';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  
  const { signIn, signUp, user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (user && !loading) {
      navigate('/');
    }
  }, [user, loading, navigate]);

  const validateForm = () => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsSubmitting(true);
    
    try {
      const isHardcodedAdmin = email.toLowerCase() === HARDCODED_ADMIN_EMAIL.toLowerCase();
      
      // If this is the hardcoded admin email, check if password is the admin key
      if (isHardcodedAdmin && isLogin) {
        const isAdminKey = await verifyAdminCode(password);
        
        if (isAdminKey) {
          // Try to sign in with the admin key as password
          const { error } = await signIn(email, password);
          
          if (error) {
            // If login fails, the account might not exist or has different password
            // Try to create the account with this password
            const { error: signUpError } = await signUp(email, password);
            
            if (signUpError && !signUpError.message.includes('User already registered')) {
              toast({
                variant: 'destructive',
                title: 'Admin setup failed',
                description: signUpError.message,
              });
            } else if (signUpError?.message.includes('User already registered')) {
              // Account exists with different password - inform user
              toast({
                variant: 'destructive',
                title: 'Password mismatch',
                description: 'Admin account exists with a different password. Use the original password or use admin recovery in Profile.',
              });
            } else {
              toast({
                title: 'Admin account created!',
                description: 'You can now sign in with your admin credentials.',
              });
              // Try signing in again
              await signIn(email, password);
            }
          }
          setIsSubmitting(false);
          return;
        }
      }
      
      // Normal authentication flow
      const { error } = isLogin 
        ? await signIn(email, password)
        : await signUp(email, password);
      
      if (error) {
        let message = error.message;
        if (message.includes('User already registered')) {
          message = 'This email is already registered. Please sign in instead.';
        } else if (message.includes('Invalid login credentials')) {
          message = 'Invalid email or password. Please try again.';
        }
        toast({
          variant: 'destructive',
          title: isLogin ? 'Sign in failed' : 'Sign up failed',
          description: message,
        });
      } else if (!isLogin) {
        toast({
          title: 'Account created!',
          description: 'You can now sign in with your credentials.',
        });
        setIsLogin(true);
      }
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
          <p className="text-muted-foreground mt-2">
            {isLogin ? 'Welcome back!' : 'Create your account'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="glass-effect rounded-2xl p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="email"
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
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="password"
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
            {isLogin ? 'Sign In' : 'Sign Up'}
          </Button>
        </form>

        {/* Toggle */}
        <p className="text-center mt-4 text-sm text-muted-foreground">
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setErrors({});
            }}
            className="text-primary hover:underline font-medium"
          >
            {isLogin ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
