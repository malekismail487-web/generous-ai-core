## Fix: Reliable IP Address Detection

### Problem

IP addresses are fetched client-side via `fetch('https://api.ipify.org?format=json')`. This is unreliable because:

- Preview/iframe environments may route through CDN proxies, returning a non-real IP
- Ad blockers or CORS issues can block the request entirely
- The IP returned may be a Cloudflare/Vercel edge IP, not the user's real IP

### Solution

Create a lightweight edge function that reads the real client IP from the incoming request headers (`x-forwarded-for`, `x-real-ip`, or the connection remote address). The frontend calls this edge function instead of `api.ipify.org`.

### Implementation

**1. New edge function: `supabase/functions/get-client-ip/index.ts**`

- Reads `x-forwarded-for` (first IP in chain), falls back to `x-real-ip`, then `cf-connecting-ip`
- Returns `{ ip: "..." }` as JSON
- No auth required, minimal logic

**2. Update `src/pages/MinistryLogin.tsx**`

- Replace `fetch('https://api.ipify.org?format=json')` with a call to the new `get-client-ip` edge function via the Supabase client's `functions.invoke()`

**3. Update `src/pages/Auth.tsx**`

- Same replacement — use the edge function instead of `api.ipify.org`

### About Device Fingerprint

The current fingerprint approach (browser properties + random seed stored in localStorage) is reasonable for its purpose. It uniquely identifies the browser session on that device. It's not meant to be a hardware ID — it's a soft fingerprint that persists across page reloads but resets if localStorage is cleared. This is standard for web apps and works correctly as-is.

&nbsp;

I want the system to retrieve the IP and all data from every device that enters a ministry access code 