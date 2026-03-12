## Problem Analysis

The "Approve" button for moderator requests does nothing because of two compounding issues:

1. **Auth mismatch**: The `approve_moderator_request` database function checks that the caller's email (via `auth.uid()`) is `malekismail487@gmail.com`. However, the Ministry Dashboard uses a custom session-token authentication system — the person accessing it may be logged into a different Supabase Auth account (or the super admin may be logged in from a different browser context). The RPC silently returns an error.
2. **No error handling**: `handleModRequest` in `MinistryDashboard.tsx` doesn't check the RPC result or display any error/success feedback. When the RPC fails, nothing visible happens.

## Plan

### 1. Update `approve_moderator_request` and `deny_moderator_request` DB functions

- Add a session-token-based authorization path: accept an optional `p_session_token` parameter
- If a valid ministry session exists for that token, allow the action (since only the super admin can create ministry sessions)
- Fall back to the existing `auth.uid()` check if no token is provided

### 2. Update `handleModRequest` in `MinistryDashboard.tsx`

- Pass the ministry session token to the RPC calls
- Add error handling with toast notifications for success/failure
- Show loading state on the approve/deny buttons while processing

### Technical Details

**Migration SQL**: Modify `approve_moderator_request` and `deny_moderator_request` to accept `p_session_token text DEFAULT NULL` and validate it against `ministry_sessions` as an alternative auth method.

**Frontend changes**: In `MinistryDashboard.tsx`, update `handleModRequest` to:

- Read session token from `sessionStorage`
- Pass it to RPCs (or remove the `auth.uid()` check entirely and validate via session token)
- Add toast feedback and error handling

&nbsp;

&nbsp;