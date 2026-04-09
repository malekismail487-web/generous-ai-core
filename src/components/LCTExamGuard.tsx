import { useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import LCTExamScreen from '@/components/student/LCTExamScreen';
import { Loader2, Brain, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── Constants ──────────────────────────────────────────────────────────────────

const INITIAL_CHECK_TIMEOUT = 8000; // 8s max for initial lock check
const PERIODIC_CHECK_INTERVAL = 12000; // 12s between periodic checks
const RETRY_DELAY = 3000; // 3s retry on failure
const MAX_RETRIES = 3;

// ─── Types ──────────────────────────────────────────────────────────────────────

interface LockData {
  locked: boolean;
  exam_id: string | null;
  locked_until: string | null;
}

interface LCTExamGuardProps {
  children: ReactNode;
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function LCTExamGuard({ children }: LCTExamGuardProps) {
  const { user, loading: authLoading } = useAuth();
  const [lockData, setLockData] = useState<LockData | null>(null);
  const [checking, setChecking] = useState(true);
  const [checkFailed, setCheckFailed] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const retriesRef = useRef(0);
  const userIdRef = useRef<string | null>(null);

  // Track user ID changes
  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);

  // ─── Online/Offline Detection ─────────────────────────────────────────────

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // ─── Lock Check Function ─────────────────────────────────────────────────

  const checkLock = useCallback(async (userId: string): Promise<LockData> => {
    const { data, error } = await supabase.rpc('check_lct_lock', { p_user_id: userId });
    if (error) throw error;
    return data as unknown as LockData;
  }, []);

  // ─── Initial Lock Check with Retry ────────────────────────────────────────

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLockData(null);
      setChecking(false);
      return;
    }

    let cancelled = false;
    retriesRef.current = 0;

    const doCheck = async () => {
      try {
        const result = await checkLock(user.id);
        if (!cancelled) {
          setLockData(result);
          setChecking(false);
          setCheckFailed(false);
          retriesRef.current = 0;
        }
      } catch (err) {
        console.error('LCT lock check error:', err);
        retriesRef.current++;
        if (retriesRef.current < MAX_RETRIES && !cancelled) {
          // Retry after delay
          setTimeout(doCheck, RETRY_DELAY);
        } else if (!cancelled) {
          // Give up — assume not locked (allow app access)
          setLockData({ locked: false, exam_id: null, locked_until: null });
          setChecking(false);
          setCheckFailed(true);
        }
      }
    };

    doCheck();

    // Safety timeout — if check takes too long, release
    const timeout = setTimeout(() => {
      if (!cancelled && checking) {
        setLockData({ locked: false, exam_id: null, locked_until: null });
        setChecking(false);
        setCheckFailed(true);
      }
    }, INITIAL_CHECK_TIMEOUT);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [user, authLoading, checkLock]);

  // ─── Periodic Re-check ───────────────────────────────────────────────────

  useEffect(() => {
    if (!user || authLoading || checking) return;

    const interval = setInterval(async () => {
      if (!navigator.onLine) return;
      try {
        const result = await checkLock(user.id);
        setLockData(result);
        setCheckFailed(false);
      } catch {
        // Silent fail on periodic check — don't interrupt student
      }
    }, PERIODIC_CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [user, authLoading, checking, checkLock]);

  // ─── Re-check when coming back online ─────────────────────────────────────

  useEffect(() => {
    if (isOnline && user && !checking) {
      checkLock(user.id)
        .then(result => {
          setLockData(result);
          setCheckFailed(false);
        })
        .catch(() => { /* ignore */ });
    }
  }, [isOnline]);

  // ─── Visibility change detection (tab switch / screen unlock) ─────────────

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible' && userIdRef.current) {
        checkLock(userIdRef.current)
          .then(result => setLockData(result))
          .catch(() => { /* ignore */ });
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [checkLock]);

  // ─── Render: Auth Loading ─────────────────────────────────────────────────

  if (authLoading) {
    return <>{children}</>;
  }

  // ─── Render: Checking Lock ────────────────────────────────────────────────

  if (checking) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center">
        <div className="text-center">
          <Brain className="w-10 h-10 text-primary mx-auto mb-3 animate-pulse" />
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Checking exam status...</p>
          {!isOnline && (
            <div className="flex items-center gap-1.5 justify-center mt-2 text-amber-500">
              <WifiOff className="w-3.5 h-3.5" />
              <span className="text-[10px]">Waiting for connection...</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Render: Check Failed Warning ─────────────────────────────────────────

  if (checkFailed && !lockData?.locked) {
    // Show children but with a subtle retry banner
    return (
      <>
        <div className="fixed top-0 left-0 right-0 z-[9998] bg-amber-500/10 border-b border-amber-500/30 px-4 py-1.5 flex items-center justify-center gap-2">
          <WifiOff className="w-3 h-3 text-amber-500" />
          <span className="text-[10px] text-amber-600 dark:text-amber-400">
            Could not verify exam status.
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-[10px] px-2"
            onClick={async () => {
              if (user) {
                try {
                  const result = await checkLock(user.id);
                  setLockData(result);
                  setCheckFailed(false);
                } catch { /* ignore */ }
              }
            }}
          >
            Retry
          </Button>
        </div>
        {children}
      </>
    );
  }

  // ─── Render: Locked into Exam ─────────────────────────────────────────────

  if (lockData?.locked && lockData.exam_id && lockData.locked_until && user) {
    // Verify the lock hasn't expired client-side
    const lockEnd = new Date(lockData.locked_until).getTime();
    const now = Date.now();
    if (lockEnd <= now) {
      // Lock has expired — re-check from server
      return <>{children}</>;
    }

    return (
      <LCTExamScreen
        examId={lockData.exam_id}
        lockedUntil={lockData.locked_until}
        userId={user.id}
      />
    );
  }

  // ─── Render: Normal App ───────────────────────────────────────────────────

  return <>{children}</>;
}
