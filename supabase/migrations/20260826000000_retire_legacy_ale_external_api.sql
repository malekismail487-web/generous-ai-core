-- Retire the obsolete cross-project Adaptive Learning Engine API credential
-- class without assuming that its Lovable-era table exists on this backend.
-- This migration never creates legacy ALE API state and never emits credential
-- values, prefixes, or hashes.

DO $retire_legacy_ale_external_api$
DECLARE
  retired_rows bigint := 0;
BEGIN
  IF to_regclass('public.ale_api_keys') IS NULL THEN
    RAISE NOTICE 'ALE_EXTERNAL_API_RETIREMENT TABLE_ABSENT retired_rows=0';
    RETURN;
  END IF;

  EXECUTE $retire_rows$
    UPDATE public.ale_api_keys
       SET is_active = false,
           revoked_at = COALESCE(revoked_at, now())
     WHERE is_active IS DISTINCT FROM false
        OR revoked_at IS NULL
  $retire_rows$;

  GET DIAGNOSTICS retired_rows = ROW_COUNT;
  RAISE NOTICE 'ALE_EXTERNAL_API_RETIREMENT TABLE_PRESENT retired_rows=%', retired_rows;
END
$retire_legacy_ale_external_api$;
