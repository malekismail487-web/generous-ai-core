\set ON_ERROR_STOP on

BEGIN;

CREATE FUNCTION pg_temp.assert_true(actual boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF actual IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', label;
  END IF;
  RAISE NOTICE 'ok - %', label;
END;
$$;

CREATE FUNCTION pg_temp.assert_raises(statement text, expected_state text, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = expected_state THEN
      RAISE NOTICE 'ok - % (SQLSTATE %)', label, SQLSTATE;
      RETURN;
    END IF;
    RAISE EXCEPTION 'ASSERTION FAILED: % expected SQLSTATE %, received %: %',
      label, expected_state, SQLSTATE, SQLERRM;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % expected SQLSTATE %, no exception raised', label, expected_state;
END;
$$;

-- Deterministic synthetic identities only. No credential is usable outside the
-- transaction and the entire fixture set is rolled back at the end.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'super-one@example.test', '', now(), '{}', '{"full_name":"Super One"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'super-two@example.test', '', now(), '{}', '{"full_name":"Super Two"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'school-a-admin@example.test', '', now(), '{}', '{"full_name":"School A Admin"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000020', 'authenticated', 'authenticated', 'school-b-admin@example.test', '', now(), '{}', '{"full_name":"School B Admin"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000030', 'authenticated', 'authenticated', 'reserved-looking@example.test', '', now(), '{}', '{"full_name":"Unassigned Label Only"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000040', 'authenticated', 'authenticated', 'student-a@example.test', '', now(), '{}', '{"full_name":"Student A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000050', 'authenticated', 'authenticated', 'student-b@example.test', '', now(), '{}', '{"full_name":"Student B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000060', 'authenticated', 'authenticated', 'label-only-admin@example.test', '', now(), '{}', '{"full_name":"Label Only Admin"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000070', 'authenticated', 'authenticated', 'activation-one@example.test', '', now(), '{}', '{"full_name":"Activation One"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000080', 'authenticated', 'authenticated', 'activation-two@example.test', '', now(), '{}', '{"full_name":"Activation Two"}', now(), now());

INSERT INTO public.tenants (
  id, slug, country_name, country_code, ministry_name, status, is_visible
) VALUES
  ('10000000-0000-0000-0000-000000000001', 'fixture-a', 'Fixture A', 'XA', 'Fixture Ministry A', 'active', true),
  ('10000000-0000-0000-0000-000000000002', 'fixture-b', 'Fixture B', 'XB', 'Fixture Ministry B', 'active', true);

INSERT INTO public.schools (
  id, name, code, status, tenant_id, activation_code_hash
) VALUES
  ('20000000-0000-0000-0000-000000000001', 'Fixture School A', 'FIX-A', 'active', '10000000-0000-0000-0000-000000000001', NULL),
  ('20000000-0000-0000-0000-000000000002', 'Fixture School B', 'FIX-B', 'active', '10000000-0000-0000-0000-000000000002', NULL),
  ('20000000-0000-0000-0000-000000000003', 'Activation School', 'FIX-C', 'active', '10000000-0000-0000-0000-000000000001', encode(extensions.digest('ACTIVATE_SCHOOL_A1', 'sha256'), 'hex'));

INSERT INTO public.profiles (id, school_id, full_name, user_type, status, is_active, email) VALUES
  ('00000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000001', 'School A Admin', 'school_admin', 'approved', true, 'school-a-admin@example.test'),
  ('00000000-0000-0000-0000-000000000020', '20000000-0000-0000-0000-000000000002', 'School B Admin', 'school_admin', 'approved', true, 'school-b-admin@example.test'),
  ('00000000-0000-0000-0000-000000000030', '20000000-0000-0000-0000-000000000001', 'Unassigned Label Only', 'school_admin', 'approved', true, 'reserved-looking@example.test'),
  ('00000000-0000-0000-0000-000000000040', '20000000-0000-0000-0000-000000000001', 'Student A', 'student', 'approved', true, 'student-a@example.test'),
  ('00000000-0000-0000-0000-000000000050', '20000000-0000-0000-0000-000000000002', 'Student B', 'student', 'approved', true, 'student-b@example.test'),
  ('00000000-0000-0000-0000-000000000060', '20000000-0000-0000-0000-000000000001', 'Label Only Admin', 'student', 'approved', true, 'label-only-admin@example.test');

INSERT INTO public.school_admins (user_id, school_id, active, granted_by) VALUES
  ('00000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000001', true, '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000020', '20000000-0000-0000-0000-000000000002', true, '00000000-0000-0000-0000-000000000001');

UPDATE public.platform_bootstrap_state
SET is_open = false, closed_at = now(), closed_by = '00000000-0000-0000-0000-000000000001'
WHERE singleton;
INSERT INTO public.platform_role_assignments (user_id, role, granted_by)
VALUES ('00000000-0000-0000-0000-000000000001', 'super_admin', '00000000-0000-0000-0000-000000000001');

-- ASSERT: profiles-email-contract
SELECT pg_temp.assert_true(
  (SELECT data_type = 'text' AND is_nullable = 'YES' AND column_default IS NULL
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'email'),
  'profiles.email is nullable text with no default'
);

-- ASSERT: disputed-api-table-resolution
SELECT pg_temp.assert_true(
  to_regclass('public.api_keys') IS NULL
  AND to_regclass('public.api_call_logs') IS NULL
  AND to_regclass('public.lumina_api_keys') IS NOT NULL
  AND to_regclass('public.lumina_api_usage') IS NOT NULL,
  'legacy API tables are excluded and Lumina API tables are retained'
);

-- ASSERT: generic-admin-enum-retired
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'app_role' AND e.enumlabel = 'admin'
  ),
  'generic app_role.admin is absent'
);

-- ASSERT: legacy-rpcs-absent
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
      'verify_admin_access_code', 'verify_super_admin_code',
      'grant_admin_via_code', 'activate_school_with_code'
    ])
  ),
  'legacy authority RPCs are absent'
);

-- ASSERT: rls-on-public-tables
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
  ),
  'every public table has RLS enabled'
);

-- ASSERT: security-definer-search-path
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) setting
        WHERE setting LIKE 'search_path=pg_catalog,%' OR setting = 'search_path=pg_catalog'
      )
  ),
  'all public SECURITY DEFINER functions pin pg_catalog first'
);

-- ASSERT: public-execute-closed
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
    WHERE n.nspname = 'public' AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC has no function execution privilege'
);

-- ASSERT: anon-function-allowlist
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.proname <> ALL (ARRAY[
        'get_active_tenants', 'get_tenant_config', 'check_ministry_ip_ban',
        'signup_as_moderator', 'signup_as_parent', 'signup_with_invite_code'
      ])
  ),
  'anonymous execution is limited to the reviewed pre-authentication allowlist'
);

-- ASSERT: platform-tables-browser-closed
SELECT pg_temp.assert_true(
  NOT has_table_privilege('authenticated', 'public.platform_bootstrap_state', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.platform_role_assignments', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.platform_audit_log', 'SELECT'),
  'platform authority tables are unavailable to browser roles'
);

-- ASSERT: storage-private
SELECT pg_temp.assert_true(
  (SELECT count(*) = 4 AND bool_and(NOT public)
   FROM storage.buckets
   WHERE id = ANY (ARRAY['course-materials', 'report-cards', 'generated-diagrams', 'chat-attachments'])),
  'canonical storage buckets exist and are private'
);

-- ASSERT: realtime-allowlist
SELECT pg_temp.assert_true(
  (SELECT count(*) = 7 FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
     AND tablename = ANY (ARRAY[
       'announcements', 'submissions', 'invite_requests', 'chat_messages',
       'ministry_access_requests', 'teacher_categories', 'live_meetings'
     ])),
  'reviewed realtime tables are explicitly published'
);

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
SET LOCAL ROLE authenticated;

-- ASSERT: super-admin-aal1-denied
SELECT pg_temp.assert_true(NOT public.is_super_admin(), 'AAL1 Super Admin assignment is denied');

-- ASSERT: grant-aal1-denied
SELECT pg_temp.assert_raises(
  $sql$SELECT public.grant_platform_role('00000000-0000-0000-0000-000000000002', 'super_admin')$sql$,
  '42501', 'AAL1 cannot grant platform authority'
);

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);
SET LOCAL ROLE authenticated;

-- ASSERT: super-admin-aal2-positive
SELECT pg_temp.assert_true(public.is_super_admin(), 'active immutable assignment plus AAL2 grants Super Admin');

-- ASSERT: last-super-admin-protected
SELECT pg_temp.assert_raises(
  $sql$SELECT public.revoke_platform_role('00000000-0000-0000-0000-000000000001', 'super_admin')$sql$,
  '23514', 'last active Super Admin cannot be revoked'
);

-- ASSERT: super-admin-grant-revoke-audited
SELECT public.grant_platform_role('00000000-0000-0000-0000-000000000002', 'super_admin');
SELECT public.revoke_platform_role('00000000-0000-0000-0000-000000000002', 'super_admin');
SELECT pg_temp.assert_true(
  (SELECT count(*) = 2 FROM public.platform_audit_log
   WHERE target_user_id = '00000000-0000-0000-0000-000000000002'
     AND event_type IN ('platform.role_granted', 'platform.role_revoked')),
  'platform grant and revoke are audited'
);

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}', true);
SET LOCAL ROLE authenticated;

-- ASSERT: revoked-super-admin-stale-session-denied
SELECT pg_temp.assert_true(
  NOT public.is_super_admin(),
  'revoked Super Admin assignment is denied despite an AAL2 session'
);

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000030","role":"authenticated","aal":"aal2","email":"reserved-looking@example.test"}', true);
SET LOCAL ROLE authenticated;

-- ASSERT: forged-email-denied
SELECT pg_temp.assert_true(NOT public.is_super_admin(), 'forged or reserved-looking email cannot grant Super Admin');

-- ASSERT: label-only-school-admin-denied
SELECT pg_temp.assert_true(
  NOT public.is_school_admin_of(auth.uid(), '20000000-0000-0000-0000-000000000001'),
  'School Admin profile label without active membership is denied'
);

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000010","role":"authenticated","aal":"aal1"}', true);
SET LOCAL ROLE authenticated;

-- ASSERT: school-admin-own-school-positive
SELECT pg_temp.assert_true(
  public.is_school_admin_of(auth.uid(), '20000000-0000-0000-0000-000000000001'),
  'active School Admin is authorized for own school'
);

-- ASSERT: school-admin-cross-school-denied
SELECT pg_temp.assert_true(
  NOT public.is_school_admin_of(auth.uid(), '20000000-0000-0000-0000-000000000002'),
  'School Admin is denied for another school'
);

-- ASSERT: school-admin-rls-cross-tenant-denied
SELECT pg_temp.assert_true(
  (SELECT count(*) = 0 FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000050'),
  'School Admin RLS cannot read another school profile'
);

-- ASSERT: arbitrary-viewer-spoof-denied
SELECT pg_temp.assert_true(
  NOT public.can_view_student_mastery(
    '00000000-0000-0000-0000-000000000050',
    '00000000-0000-0000-0000-000000000050'
  ),
  'caller-supplied viewer UUID cannot impersonate a student'
);

RESET ROLE;

INSERT INTO public.invite_codes (
  id, school_id, code, role, expires_at, created_by
) VALUES
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'INVITE-A-ONE', 'student', now() + interval '1 day', '00000000-0000-0000-0000-000000000010'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'INVITE-A-TWO', 'student', now() + interval '1 day', '00000000-0000-0000-0000-000000000010');
INSERT INTO public.invite_requests (id, code_id, name, email, user_id) VALUES
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Student A', 'student-a@example.test', '00000000-0000-0000-0000-000000000040'),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'Student A', 'student-a@example.test', '00000000-0000-0000-0000-000000000040');

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal1"}', true);
SET LOCAL ROLE authenticated;

-- ASSERT: invite-denial-cross-school-denied
SELECT pg_temp.assert_raises(
  $sql$SELECT public.deny_invite_request('40000000-0000-0000-0000-000000000002', 'cross-school attempt')$sql$,
  '42501', 'School Admin cannot deny another school invite'
);

RESET ROLE;
UPDATE public.school_admins
SET active = false,
    revoked_at = now(),
    revoked_by = '00000000-0000-0000-0000-000000000001'
WHERE user_id = '00000000-0000-0000-0000-000000000020'
  AND school_id = '20000000-0000-0000-0000-000000000002';
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000020","role":"authenticated","aal":"aal1"}', true);
SET LOCAL ROLE authenticated;

-- ASSERT: revoked-school-admin-stale-session-denied
SELECT pg_temp.assert_true(
  NOT public.is_school_admin_of(auth.uid(), '20000000-0000-0000-0000-000000000002'),
  'revoked School Admin membership is denied despite a stale session'
);

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000010","role":"authenticated","aal":"aal1"}', true);
SET LOCAL ROLE authenticated;

-- ASSERT: invite-denial-own-school-positive
SELECT public.deny_invite_request('40000000-0000-0000-0000-000000000001', 'fixture reason');
SELECT pg_temp.assert_true(
  (SELECT status = 'denied' AND processed_by = auth.uid() AND denied_at IS NOT NULL
   FROM public.invite_requests WHERE id = '40000000-0000-0000-0000-000000000001'),
  'School Admin can transactionally deny an own-school pending invite'
);

-- ASSERT: invite-denial-idempotent
SELECT pg_temp.assert_true(
  (public.deny_invite_request('40000000-0000-0000-0000-000000000001', 'ignored') ->> 'already_denied')::boolean,
  'invite denial is safely idempotent'
);

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000070","role":"authenticated","aal":"aal1"}', true);
SET LOCAL ROLE authenticated;

-- ASSERT: school-activation-positive
SELECT public.activate_school('ACTIVATE_SCHOOL_A1');
SELECT pg_temp.assert_true(
  (SELECT code_used AND code_used_by = auth.uid() FROM public.schools WHERE id = '20000000-0000-0000-0000-000000000003')
  AND (SELECT user_type = 'school_admin' AND status = 'approved' AND is_active FROM public.profiles WHERE id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.school_admins WHERE user_id = auth.uid() AND school_id = '20000000-0000-0000-0000-000000000003' AND active)
  AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()),
  'activation consumes the code and creates only School Admin authority'
);

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000080","role":"authenticated","aal":"aal1"}', true);
SET LOCAL ROLE authenticated;

-- ASSERT: school-activation-reuse-denied
SELECT pg_temp.assert_raises(
  $sql$SELECT public.activate_school('ACTIVATE_SCHOOL_A1')$sql$,
  '22023', 'consumed activation code cannot be replayed'
);

RESET ROLE;

-- ASSERT: audit-append-only
SELECT pg_temp.assert_raises(
  $sql$UPDATE public.platform_audit_log SET event_type = 'tampered'$sql$,
  '42501', 'platform audit ledger rejects mutation'
);

-- ASSERT: no-runner-email-shim
SELECT pg_temp.assert_true(
  (SELECT count(*) = 1 FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'email'),
  'profiles.email is canonical and not a duplicate runner shim'
);

ROLLBACK;
