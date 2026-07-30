# Environment file cleanup

Date: 2026-07-31
Scope: Stop tracking the local environment configuration file while preserving developer setup instructions.

## Changes made

- Removed `.env` from Git tracking with `git rm --cached .env`.
  - The local `.env` file remains on disk for the current developer environment.
  - The file is staged as deleted from the repository; no environment variable values were read or copied into this dossier.
- Added `.env.example` containing only the three required variable names:
  - `VITE_SUPABASE_PROJECT_ID`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
  - `VITE_SUPABASE_URL`
- Added `AGENTS.md` to record the repository's standards for deliberate implementation, verification, secret handling, and factual change dossiers.

## Verification performed

- Confirmed before the change that `.env` was tracked by Git.
- Confirmed that `.gitignore` already contains rules for `.env`, `.env.local`, and `.env.*`.
- Confirmed after removing it from the index that `.env` remains present in the working directory.
- Confirmed `.env.example` contains variable names only and no copied values.

## Remaining work

- This change prevents future commits from tracking `.env`; it does not remove the file's historical contents from existing Git commits.
- If any value in the previous `.env` is sensitive, rotate it in Supabase and any related provider dashboards. History rewriting should be considered separately because it changes published Git history.
