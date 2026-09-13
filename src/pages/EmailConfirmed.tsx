import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { GlyphSeal, GlyphOrbit, GlyphShieldCheck, GlyphArrowRight } from '@/components/icons';

type State = 'working' | 'confirmed' | 'failed';

/**
 * Target of the confirmation link in the sign-up email.
 *
 * Runs on whichever device opened the link — including a device that never
 * signed up — and proves the address is confirmed rather than silently
 * dropping the visitor back onto the sign-up form.
 */
export default function EmailConfirmed() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [state, setState] = useState<State>('working');
  const [email, setEmail] = useState<string>('');
  const [sameDevice, setSameDevice] = useState(false);
  const [detail, setDetail] = useState<string>('');

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // Supabase parses the token from the URL fragment on load; give it a beat.
      const errorDescription = params.get('error_description');
      if (errorDescription) {
        if (!cancelled) {
          setState('failed');
          setDetail(errorDescription);
        }
        return;
      }

      const { data } = await supabase.auth.getSession();
      const sessionEmail = data.session?.user?.email ?? '';

      if (sessionEmail) {
        const confirmed = Boolean(data.session?.user?.email_confirmed_at);
        if (!cancelled) {
          setEmail(sessionEmail);
          setSameDevice(true);
          setState(confirmed ? 'confirmed' : 'failed');
          if (!confirmed) setDetail('This link did not complete the confirmation. Request a new one.');
        }
        return;
      }

      // No session on this device (the classic "opened the link on my phone"
      // case). Verify against the backend using the address in the link.
      const linkEmail = params.get('email') || '';
      if (linkEmail) {
        const { data: ok } = await supabase.rpc('is_email_verified', { p_email: linkEmail });
        if (!cancelled) {
          setEmail(linkEmail);
          setState(ok === true ? 'confirmed' : 'failed');
          if (ok !== true) setDetail('We could not confirm this address yet. Try the link again.');
        }
        return;
      }

      // The link was consumed but this device holds no session and carries no
      // address — Supabase only redirects here after a successful exchange.
      if (!cancelled) setState('confirmed');
    };

    const timer = setTimeout(run, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [params]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md relative z-10 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5 liquid-glass">
          {state === 'working' ? <GlyphOrbit size={28} /> : state === 'confirmed' ? <GlyphSeal size={30} /> : <GlyphShieldCheck size={28} />}
        </div>

        {state === 'working' && (
          <>
            <h1 className="text-2xl font-bold mb-2">Confirming your email</h1>
            <p className="text-muted-foreground text-sm">One moment while we verify the link.</p>
          </>
        )}

        {state === 'confirmed' && (
          <>
            <h1 className="text-2xl font-bold mb-2">Email confirmed</h1>
            <p className="text-muted-foreground text-sm mb-6">
              {email ? (
                <><strong className="text-foreground">{email}</strong> is now verified.</>
              ) : (
                'Your address is now verified.'
              )}{' '}
              {sameDevice
                ? 'You can continue on this device.'
                : 'If you started on another device, it has already unlocked — you can go back to it, or continue here.'}
            </p>
            <div className="liquid-glass rounded-2xl p-4 mb-6 text-left text-sm text-muted-foreground flex gap-3">
              <GlyphShieldCheck size={18} className="mt-0.5 text-foreground" />
              <span>Verification is recorded on your account, not on this browser, so it counts everywhere you sign in.</span>
            </div>
            <Button className="w-full gap-2" onClick={() => navigate(sameDevice ? '/' : '/auth', { replace: true })}>
              {sameDevice ? 'Continue to Lumina' : 'Sign in'}
              <GlyphArrowRight size={16} />
            </Button>
          </>
        )}

        {state === 'failed' && (
          <>
            <h1 className="text-2xl font-bold mb-2">Link could not be verified</h1>
            <p className="text-muted-foreground text-sm mb-6">
              {detail || 'This confirmation link is invalid or has expired.'}
            </p>
            <Button className="w-full" onClick={() => navigate('/verify-email', { replace: true })}>
              Send a new link
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
