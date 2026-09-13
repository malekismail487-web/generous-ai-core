import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  GlyphEnvelope,
  GlyphOrbit,
  GlyphRefresh,
  GlyphSeal,
  GlyphArrowRight,
  GlyphArrowLeft,
} from '@/components/icons';

const RESEND_COOLDOWN_SECONDS = 60;
const POLL_INTERVAL_MS = 4000;

const STORAGE_EMAIL = 'luminaPendingVerificationEmail';
const STORAGE_NEXT = 'luminaPendingVerificationNext';
const STORAGE_LAST_SENT = 'luminaPendingVerificationLastSent';

/**
 * Post sign-up landing page.
 *
 * Explains that a confirmation email is on its way, polls the backend until the
 * address is actually confirmed (which also covers the case where the user
 * opened the link on a completely different device), and offers a throttled
 * resend.
 */
export default function VerifyEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { toast } = useToast();

  const stateEmail = (location.state as { email?: string } | null)?.email;
  const stateNext = (location.state as { next?: string } | null)?.next;

  const [email] = useState<string>(
    () => stateEmail || params.get('email') || sessionStorage.getItem(STORAGE_EMAIL) || ''
  );
  const [next] = useState<string>(
    () => stateNext || params.get('next') || sessionStorage.getItem(STORAGE_NEXT) || '/'
  );

  const [verified, setVerified] = useState(false);
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const stopped = useRef(false);

  // Persist so a page refresh (or a bounce through the auth gate) keeps context.
  useEffect(() => {
    if (email) sessionStorage.setItem(STORAGE_EMAIL, email);
    if (next) sessionStorage.setItem(STORAGE_NEXT, next);
  }, [email, next]);

  // Cooldown ticker, seeded from the last send so refreshing cannot bypass it.
  useEffect(() => {
    const last = Number(sessionStorage.getItem(STORAGE_LAST_SENT) || 0);
    const elapsed = Math.floor((Date.now() - last) / 1000);
    if (last && elapsed < RESEND_COOLDOWN_SECONDS) setCooldown(RESEND_COOLDOWN_SECONDS - elapsed);
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const checkStatus = useCallback(
    async (manual = false) => {
      if (!email || stopped.current) return;
      if (manual) setChecking(true);
      const { data, error } = await supabase.rpc('is_email_verified', { p_email: email });
      if (manual) setChecking(false);
      if (error) {
        if (manual) {
          toast({ variant: 'destructive', title: 'Could not check status', description: error.message });
        }
        return;
      }
      if (data === true) {
        stopped.current = true;
        setVerified(true);
        sessionStorage.removeItem(STORAGE_EMAIL);
        sessionStorage.removeItem(STORAGE_LAST_SENT);
      } else if (manual) {
        toast({
          title: 'Not confirmed yet',
          description: 'Open the link in the email we sent you, then come back here.',
        });
      }
    },
    [email, toast]
  );

  // Poll until confirmed — this is what makes cross-device confirmation work.
  useEffect(() => {
    if (!email) return;
    checkStatus();
    const id = setInterval(() => checkStatus(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [email, checkStatus]);

  const handleResend = async () => {
    if (!email || cooldown > 0) return;
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirmed` },
    });
    setResending(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Could not resend', description: error.message });
      return;
    }
    sessionStorage.setItem(STORAGE_LAST_SENT, String(Date.now()));
    setCooldown(RESEND_COOLDOWN_SECONDS);
    toast({ title: 'Email sent again', description: `A new confirmation link is on its way to ${email}.` });
  };

  const handleContinue = async () => {
    const { data } = await supabase.auth.getSession();
    sessionStorage.removeItem(STORAGE_NEXT);
    if (data.session) navigate(next || '/', { replace: true });
    else navigate('/auth', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 liquid-glass">
            {verified ? <GlyphSeal size={30} /> : <GlyphEnvelope size={28} />}
          </div>
          <h1 className="text-2xl font-bold mb-2">
            {verified ? 'Email confirmed' : 'Confirm your email'}
          </h1>
          <p className="text-muted-foreground text-sm">
            {verified ? (
              <>Your address <strong className="text-foreground">{email}</strong> is verified. You can continue.</>
            ) : (
              <>We sent a confirmation link to <strong className="text-foreground">{email || 'your email address'}</strong>.</>
            )}
          </p>
        </div>

        <div className="liquid-glass rounded-2xl p-6 animate-fade-in space-y-5">
          {!verified && (
            <>
              <ol className="space-y-3 text-sm text-muted-foreground">
                <li className="flex gap-3">
                  <span className="w-5 h-5 rounded-full border border-foreground/20 flex items-center justify-center text-[11px] text-foreground">1</span>
                  Open your inbox and look for the message from Lumina. Check spam or promotions if it is not there.
                </li>
                <li className="flex gap-3">
                  <span className="w-5 h-5 rounded-full border border-foreground/20 flex items-center justify-center text-[11px] text-foreground">2</span>
                  Tap the confirmation link. It works on any device — phone, tablet or another computer.
                </li>
                <li className="flex gap-3">
                  <span className="w-5 h-5 rounded-full border border-foreground/20 flex items-center justify-center text-[11px] text-foreground">3</span>
                  This page notices the moment it is confirmed and unlocks itself.
                </li>
              </ol>

              <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-foreground/10 pt-4">
                <GlyphOrbit size={14} />
                Waiting for confirmation…
              </div>
            </>
          )}

          {verified ? (
            <Button className="w-full gap-2" onClick={handleContinue}>
              Continue
              <GlyphArrowRight size={16} />
            </Button>
          ) : (
            <div className="space-y-2">
              <Button variant="outline" className="w-full gap-2" onClick={() => checkStatus(true)} disabled={checking}>
                {checking ? <GlyphOrbit size={16} /> : <GlyphRefresh size={16} />}
                I've confirmed — check now
              </Button>
              <Button
                variant="ghost"
                className="w-full gap-2"
                onClick={handleResend}
                disabled={resending || cooldown > 0 || !email}
              >
                {resending ? <GlyphOrbit size={16} /> : <GlyphEnvelope size={16} />}
                {cooldown > 0 ? `Resend available in ${cooldown}s` : 'Resend the email'}
              </Button>
            </div>
          )}
        </div>

        <Button variant="ghost" className="w-full mt-4 gap-2" onClick={() => navigate('/auth')}>
          <GlyphArrowLeft size={16} />
          Back to sign in
        </Button>
      </div>
    </div>
  );
}
