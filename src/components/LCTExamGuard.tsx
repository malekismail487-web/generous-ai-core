import { useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import LCTExamScreen from '@/components/student/LCTExamScreen';
import { Loader2, Brain } from 'lucide-react';

interface LCTExamGuardProps {
  children: ReactNode;
}

export default function LCTExamGuard({ children }: LCTExamGuardProps) {
  const { user, loading: authLoading } = useAuth();
  const [lockData, setLockData] = useState<{ locked: boolean; exam_id: string | null; locked_until: string | null } | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkLock = async () => {
      if (!user) {
        setLockData(null);
        setChecking(false);
        return;
      }

      try {
        const { data, error } = await supabase.rpc('check_lct_lock', { p_user_id: user.id });
        if (error) {
          console.error('LCT lock check error:', error);
          setLockData({ locked: false, exam_id: null, locked_until: null });
        } else {
          setLockData(data as any);
        }
      } catch (err) {
        console.error('LCT lock check failed:', err);
        setLockData({ locked: false, exam_id: null, locked_until: null });
      }
      setChecking(false);
    };

    if (!authLoading) {
      checkLock();
    }
  }, [user, authLoading]);

  // Re-check periodically — catches newly started exams and expired locks
  useEffect(() => {
    if (!user || authLoading) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await supabase.rpc('check_lct_lock', { p_user_id: user.id });
        if (data) {
          setLockData(data as any);
        }
      } catch {
        // Silent fail on periodic check
      }
    }, 15000); // Check every 15s (catches new exams while student is browsing)
    return () => clearInterval(interval);
  }, [user, authLoading]);

  // While auth is loading, show nothing extra
  if (authLoading) {
    return <>{children}</>;
  }

  // While checking lock status, show a loading screen (NOT children — prevents flash-of-content)
  if (checking) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center">
        <div className="text-center">
          <Brain className="w-10 h-10 text-primary mx-auto mb-3 animate-pulse" />
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" />
        </div>
      </div>
    );
  }

  // If user is locked, show exam screen — blocks everything
  if (lockData?.locked && lockData.exam_id && lockData.locked_until && user) {
    return (
      <LCTExamScreen
        examId={lockData.exam_id}
        lockedUntil={lockData.locked_until}
        userId={user.id}
      />
    );
  }

  return <>{children}</>;
}
