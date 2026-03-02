import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getDeviceFingerprint } from '@/lib/deviceFingerprint';
import { Shield, Loader2, Lock, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function MinistryLogin() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [banned, setBanned] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'pending' | 'approved' | 'denied'>('idle');
  const [ipAddress, setIpAddress] = useState<string | null>(null);

  // Get IP address
  useEffect(() => {
    fetch('https://api.ipify.org?format=json')
      .then(r => r.json())
      .then(d => setIpAddress(d.ip))
      .catch(() => setIpAddress(null));
  }, []);

  // Check if already banned
  useEffect(() => {
    const checkBan = async () => {
      const fp = getDeviceFingerprint();
      const { data } = await supabase.rpc('check_ministry_ip_ban', {
        p_ip: ipAddress || '',
        p_fingerprint: fp
      });
      const result = data as { banned: boolean } | null;
      if (result?.banned) setBanned(true);
    };
    if (ipAddress !== null) checkBan();
  }, [ipAddress]);

  // Check existing session
  useEffect(() => {
    const existing = sessionStorage.getItem('ministry_session_token');
    if (existing) {
      // Check if session is still valid
      supabase.rpc('check_ministry_session', { p_session_token: existing })
        .then(({ data }) => {
          const result = data as { valid: boolean } | null;
          if (result?.valid) {
            navigate('/ministry-dashboard');
          } else {
            sessionStorage.removeItem('ministry_session_token');
          }
        });
    }
  }, [navigate]);

  // Poll for approval when pending
  useEffect(() => {
    if (status !== 'pending' || !sessionToken) return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('ministry_access_requests')
        .select('status')
        .eq('session_token', sessionToken)
        .maybeSingle();

      const row = data as { status: string } | null;
      if (row?.status === 'approved') {
        setStatus('approved');
        sessionStorage.setItem('ministry_session_token', sessionToken);
        clearInterval(interval);
        navigate('/ministry-dashboard');
      } else if (row?.status === 'denied') {
        setStatus('denied');
        setBanned(true);
        clearInterval(interval);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [status, sessionToken, navigate]);

  const handleSubmit = async () => {
    if (!code) {
      setError('Please enter your access code');
      return;
    }

    setLoading(true);
    setError('');

    const fp = getDeviceFingerprint();
    const { data, error: rpcError } = await supabase.rpc('verify_ministry_code', {
      p_code: code,
      p_ip_address: ipAddress,
      p_user_agent: navigator.userAgent,
      p_device_fingerprint: fp
    });

    const result = data as { success: boolean; error?: string; session_token?: string; banned?: boolean } | null;

    if (rpcError || !result?.success) {
      if (result?.banned) {
        setBanned(true);
      } else {
        setError(result?.error || 'Invalid access code');
      }
      setLoading(false);
      return;
    }

    setSessionToken(result.session_token!);
    setStatus('pending');
    setCode('');
    setLoading(false);
  };

  if (banned) {
    return (
      <div className="fixed inset-0 z-[99999] bg-black flex items-center justify-center p-6">
        <div className="max-w-lg text-center space-y-8">
          <div className="w-24 h-24 mx-auto rounded-full bg-red-950/50 border-2 border-red-800 flex items-center justify-center">
            <ShieldOff className="w-12 h-12 text-red-500" />
          </div>
          <h1 className="text-3xl font-bold text-red-500 tracking-tight">ACCESS TERMINATED</h1>
          <div className="w-16 h-0.5 bg-red-800 mx-auto" />
          <p className="text-gray-400 text-sm leading-relaxed max-w-md mx-auto">
            Your IP address and device have been permanently banned from accessing this portal.
            All activity has been logged and reported.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'pending') {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-full bg-amber-950/30 border border-amber-700/50 flex items-center justify-center">
            <Lock className="w-10 h-10 text-amber-500 animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold text-amber-400">Verification Pending</h1>
          <p className="text-gray-400 text-sm">
            Your access request has been submitted. The system administrator has been notified
            and must manually verify your identity before access is granted.
          </p>
          <div className="flex items-center justify-center gap-2 text-amber-500/70">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Waiting for administrator approval...</span>
          </div>
          <div className="pt-4 border-t border-gray-800">
            <p className="text-xs text-gray-600">
              Do not close this window. Your session will expire in 10 minutes if not approved.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center p-6">
      <div className="max-w-lg w-full space-y-8">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 mx-auto rounded-full bg-emerald-950/30 border border-emerald-700/30 flex items-center justify-center">
            <Shield className="w-10 h-10 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold text-emerald-400">Classified Access Portal</h1>
          <p className="text-gray-500 text-xs">
            Authorized personnel only. All access attempts are monitored and logged.
          </p>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <textarea
              value={code}
              onChange={(e) => {
                const val = e.target.value.replace(/\s/g, '');
                setCode(val);
              }}
              placeholder="Enter access code..."
              className="w-full h-32 bg-gray-950 border border-gray-800 rounded-lg p-4 text-emerald-400 font-mono text-xs resize-none focus:outline-none focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700/50 placeholder:text-gray-700"
              spellCheck={false}
              autoComplete="off"
            />
          </div>

          {error && (
            <p className="text-red-500 text-xs text-center">{error}</p>
          )}

          <Button
            onClick={handleSubmit}
            disabled={!code || loading}
            className="w-full bg-emerald-900/50 hover:bg-emerald-800/50 text-emerald-400 border border-emerald-700/30 disabled:opacity-30"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Request Access'
            )}
          </Button>
        </div>

        <div className="text-center">
          <p className="text-gray-700 text-[10px]">
            CLASSIFIED • RESTRICTED ACCESS • SESSION ID: {getDeviceFingerprint().slice(0, 12)}
          </p>
        </div>
      </div>
    </div>
  );
}
