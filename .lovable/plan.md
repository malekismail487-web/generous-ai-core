## Plan: Dynamic Ministry Invite Code Generation

### Overview

Replace the static, hardcoded 100-character ministry access code with a dynamic system where the Super Admin clicks a button to generate a fresh code that expires after 15 minutes. Each generated code is hashed (SHA-256) before storage — the plaintext is shown once to the admin, then never stored.

### Database Changes

**Migration:**

1. Add `expires_at` column to `ministry_access_codes` table (timestamptz, nullable — null means permanent/legacy)
2. Create a new RPC function `generate_ministry_invite_code()`that:
  - Validates caller is super admin (email check)
  - Generates a random 100-character alphanumeric code using `gen_random_bytes`
  - Deactivates all previous active codes
  - Inserts the SHA-256 hash + `expires_at = now() + 15 minutes`
  - Returns the plaintext code (shown once to admin)
3. Update `verify_ministry_code()` to also check `expires_at IS NULL OR expires_at > now()` so expired codes are rejected

### Frontend Changes

`**src/pages/SuperAdmin.tsx`:**

- Add a "Ministry" tab button alongside "Schools" and "Analytics"
- In the Ministry tab, add a "Generate Ministry Code" button
- On click, call the new RPC, display the 100-character code in a copyable dialog with a 15-minute countdown timer
- Show warning: "This code will expire in 15 minutes. Copy it now."

### Security

- Plaintext code never stored in DB — only the SHA-256 hash it must generate a 100 character code every time the super admin, clicks generate code and the super admin has a 15 minute cooldown before generating another code
- Old codes automatically deactivated when a new one is generated
- 15-minute expiry enforced server-side in both the generation function and verification function
- Only super admin email can invoke the generation RPC 