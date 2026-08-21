# Lovable migration evidence archive

This directory preserves the 128 historical repository migrations exactly as evidence. It is intentionally outside `supabase/migrations`, so Supabase CLI migration discovery cannot execute it.

These files are not a recovered deployment history and are not the canonical Lumina schema. The historical chain is known to require a noncanonical `public.profiles.email` diagnostic shim before migration 20. That runner-only shim is not included here and must never be treated as a repair.

Integrity artifacts:

- `manifest.json` records original and archive paths, order/version, canonical-LF byte size and SHA-256, and the corresponding Git blob identity.
- `checksums.sha256` records the documented canonical-LF SHA-256 values.
- `node scripts/w0rs/archive-manifest.mjs --check` deterministically verifies both artifacts and the required count.

Canonicalization changes only CRLF or lone CR line endings to LF. It does not trim content or add/remove a trailing newline. The SQL files themselves remain byte-identical to their former executable copies.
