-- Drop the FK constraint on profiles.id → auth.users(id)
-- This is blocking school admins from approving pending users
-- because profiles are created BEFORE the user has an auth.users entry (via invite request flow)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;