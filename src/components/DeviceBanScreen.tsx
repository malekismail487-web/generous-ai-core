import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getDeviceFingerprint } from '@/lib/deviceFingerprint';
import { ShieldOff } from 'lucide-react';

export default function DeviceBanScreen({ children }: { children: React.ReactNode }) {
  const [banned, setBanned] = useState(false);
  const [message, setMessage] = useState('');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkBan = async () => {
      try {
        const fp = getDeviceFingerprint();
        const { data } = await supabase.rpc('check_device_ban', {
          p_device_fingerprint: fp,
        });
        const result = data as { banned: boolean; message?: string } | null;
        if (result?.banned) {
          setBanned(true);
          setMessage(result.message || 'Your device has been permanently banned.');
        }
      } catch (err) {
        console.error('Ban check error:', err);
      }
      setChecking(false);
    };
    checkBan();
  }, []);

  if (checking) {
    return null; // Brief flash while checking - renders nothing
  }

  if (banned) {
    return (
      <div className="fixed inset-0 z-[99999] bg-black flex items-center justify-center p-6">
        <div className="max-w-lg text-center space-y-8">
          <div className="w-24 h-24 mx-auto rounded-full bg-red-950/50 border-2 border-red-800 flex items-center justify-center">
            <ShieldOff className="w-12 h-12 text-red-500" />
          </div>
          <div className="space-y-4">
            <h1 className="text-3xl font-bold text-red-500 tracking-tight">
              ACCESS TERMINATED
            </h1>
            <div className="w-16 h-0.5 bg-red-800 mx-auto" />
            <p className="text-gray-400 text-sm leading-relaxed max-w-md mx-auto">
              {message}
            </p>
          </div>
          <div className="pt-4 border-t border-red-950">
            <p className="text-xs text-gray-600">
              ⚠️ This action was taken by a system moderator. Your device fingerprint and all associated activity have been logged and permanently recorded.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
