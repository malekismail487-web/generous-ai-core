# Ministry Control · MC11 Dossier — Security & Sessions

**Phase:** MC11 · **Migration:** `20260716_ministry_control_mc3_mc11.sql`
**Panel:** `src/components/ministry/control/SecurityPanel.tsx`

---

## Purpose

Give the ministry visibility into its own operational surface — who is
currently signed in, when sessions started, when they last activated, and
what IP they originated from — without granting session-termination
authority to every ministry role. Session administration remains a Super
Admin responsibility.

## Reused data model

MC11 does not create new tables. It exposes the existing
`ministry_sessions` table (introduced in T1) through a read-only,
session-token-aware RPC.

## RPC

```sql
public.list_ministry_sessions(
  p_session_token text DEFAULT NULL,
  p_limit integer DEFAULT 100
) RETURNS TABLE(id uuid, tenant_id uuid, ip_address text, is_active boolean,
                created_at timestamptz, last_activity timestamptz,
                expires_at timestamptz)
```

- Session token resolves to a tenant; the function returns only sessions
  belonging to that tenant.
- Super admins receive all sessions across all tenants (falls through the
  tenant filter).
- Callers with neither a valid session token nor super-admin status get an
  empty set.

Session tokens themselves are **never** returned. The panel shows session
metadata only, so operators can spot suspicious activity without exposing
credentials.

## UI (`SecurityPanel`)

Split into **Active sessions** (still valid and not expired) and
**Historical sessions** (closed or expired). Both use identical column
layouts — start time, last activity, expiry, IP, and active/closed badge.
A refresh button re-runs the RPC on demand.

## Non-goals for MC11

- **No session revocation from the ministry UI.** Terminating another
  ministry operator's session is a security-sensitive action that stays
  with Super Admin. Adding it here would require a per-role capability
  (`session.revoke`) and a workflow for handling the currently-signed-in
  operator's own session — deferred until a formal Ministry Security
  role ships.
- No IP ban management (still lives in the Ministry IP bans table under
  Super Admin).
- No verification-code lifecycle — 100-char access codes remain a Super
  Admin concern.
- No cross-tenant view for ministry-level operators; only super admins
  see all tenants.

## What this unlocks

Combined with the immutable audit log (MC2), the ministry now has a
complete oversight picture: **who did what** (audit log), **what state the
system is in** (per-tool read views), and **who is currently signed in**
(this panel). That is the full non-destructive oversight surface envisioned
by the spec's "Security & Administration" tool.
