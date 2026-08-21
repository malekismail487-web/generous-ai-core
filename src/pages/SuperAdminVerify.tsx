import { Navigate, useNavigate } from 'react-router-dom';
import { AlertTriangle, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useRoleGuard } from '@/hooks/useRoleGuard';

/**
 * Transitional MFA gate for the platform console.
 *
 * Authority is never created here. The server reports Super Admin only for an
 * active immutable-UUID assignment with an aal2 JWT. MFA enrollment/challenge
 * remains a provider-owned ceremony and this page deliberately has no access
 * code, email exception, or browser verification flag.
 */
export default function SuperAdminVerify() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isSuperAdmin, assuranceLevel, loading, refresh } = useRoleGuard();

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Checking authority" />
      </main>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (isSuperAdmin && assuranceLevel === 'aal2') return <Navigate to="/super-admin" replace />;

  return (
    <main className="min-h-screen grid place-items-center bg-background p-4">
      <section className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          {assuranceLevel === 'aal1'
            ? <KeyRound className="h-6 w-6 text-primary" />
            : <AlertTriangle className="h-6 w-6 text-destructive" />}
        </div>
        <h1 className="text-2xl font-semibold">Super Admin verification required</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Platform access requires an active server-side Super Admin assignment and a verified AAL2 session.
          Email addresses, access codes, and browser state cannot grant this authority.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={() => void refresh()} className="gap-2">
            <ShieldCheck className="h-4 w-4" /> Re-check verified session
          </Button>
          <Button variant="outline" onClick={() => navigate('/')}>
            Return to Lumina
          </Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
        <p className="mt-5 text-xs text-muted-foreground">
          MFA enrollment and challenge are completed through the approved Supabase Auth flow; no factor or recovery secret should be entered here.
        </p>
      </section>
    </main>
  );
}
