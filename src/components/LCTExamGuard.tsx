import { useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import LCTExamScreen from '@/components/student/LCTExamScreen';

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
          setLockData(null);
        } else {
          setLockData(data as any);
        }
      } catch (err) {
        console.error('LCT lock check failed:', err);
        setLockData(null);
      }
      setChecking(false);
    };

    if (!authLoading) {
      checkLock();
    }
  }, [user, authLoading]);

  // Re-check periodically while locked
  useEffect(() => {
    if (!lockData?.locked || !user) return;
    const interval = setInterval(async () => {
      const { data } = await supabase.rpc('check_lct_lock', { p_user_id: user.id });
      if (data && !(data as any).locked) {
        setLockData(data as any);
      }
    }, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, [lockData?.locked, user]);

  // If auth is loading or lock check is pending, show nothing extra
  if (authLoading || checking) {
    return <>{children}</>;
  }

  // If user is locked, show exam screen
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
