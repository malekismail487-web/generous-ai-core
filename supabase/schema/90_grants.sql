-- Canonical Lumina schema source: closed-by-default grants and explicit RPC allowlist

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON TYPE public.app_role, public.platform_role TO authenticated, service_role;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- Browser table operations remain subject to RLS. Platform authority, bootstrap,
-- and the append-only audit ledger are deliberately excluded.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
REVOKE ALL ON public.platform_bootstrap_state FROM authenticated;
REVOKE ALL ON public.platform_role_assignments FROM authenticated;
REVOKE ALL ON public.platform_audit_log FROM authenticated;
REVOKE SELECT, INSERT, UPDATE ON public.schools FROM authenticated;
GRANT SELECT (
  id, name, code, address, created_at, updated_at, is_test_data, status,
  code_used, code_used_by, code_used_at, subjects_sync_enabled, tenant_id,
  governance_status
) ON public.schools TO authenticated;
GRANT UPDATE (
  name, code, address, updated_at, status, subjects_sync_enabled, governance_status
) ON public.schools TO authenticated;

DO $$
DECLARE
  function_name text;
  function_oid oid;
  authenticated_allowlist constant text[] := ARRAY[
    'activate_school', 'activate_tenant', 'approve_invite_request', 'approve_school_profile',
    'approve_teacher_request',
    'assign_ministry_role', 'attach_bandit_reward', 'attach_ensemble_outcome',
    'can_view_student_mastery', 'check_and_increment_cost', 'check_lct_lock',
    'check_ministry_ip_ban', 'check_ministry_session', 'create_school_with_code',
    'delete_school_cascade', 'deny_invite_request', 'ext_append_message',
    'ext_approve_request', 'ext_create_conversation', 'ext_list_active_for_me',
    'ext_list_conversations', 'ext_list_pending_requests', 'ext_load_audit_chat',
    'ext_load_conversation', 'ext_push_forward', 'ext_reject_request', 'ext_save_blueprint',
    'ext_tenant_from_session', 'generate_ministry_invite_code',
    'generate_moderator_invite_code', 'get_active_tenants', 'get_authority_context',
    'get_cross_tenant_observatory', 'get_due_reviews', 'get_fsrs_due_cards',
    'get_ministry_dashboard_data', 'get_tenant_config', 'get_weakest_topics',
    'grant_platform_role', 'has_role', 'is_parent_of', 'is_school_admin',
    'is_school_admin_of', 'is_super_admin', 'is_super_admin_caller',
    'is_super_admin_user', 'is_teacher', 'link_moderator_after_signup',
    'link_profile_after_signup', 'list_change_requests', 'list_feature_flags',
    'list_mc_curriculum_subjects', 'list_mc_curriculum_versions',
    'list_mc_feature_flags', 'list_mc_lumina_config', 'list_mc_notices',
    'list_mc_policies', 'list_mc_regions', 'list_mc_schools', 'list_ministry_audit',
    'list_ministry_role_assignments', 'list_ministry_sessions', 'mc_can_govern_tenant',
    'mi_list_insights', 'mi_national_overview', 'mi_regional_breakdown',
    'mi_run_daily_aggregation', 'mi_school_snapshot', 'provision_tenant',
    'publish_change_request', 'record_review_delivered', 'reject_school_profile',
    'reject_teacher_request',
    'resolve_ministry_request', 'review_change_request', 'revoke_ministry_role',
    'revoke_platform_role', 'rotate_teacher_category_code', 'set_feature_flag',
    'signup_as_moderator', 'signup_as_parent', 'signup_with_invite_code',
    'submit_change_request', 'suspend_tenant', 'update_concept_mastery',
    'update_tenant_defaults', 'withdraw_change_request'
  ];
BEGIN
  FOREACH function_name IN ARRAY authenticated_allowlist LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = function_name
    ) THEN
      RAISE EXCEPTION 'Authenticated RPC allowlist references missing function: %', function_name;
    END IF;
    FOR function_oid IN
      SELECT p.oid FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = function_name
    LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', function_oid::regprocedure);
    END LOOP;
  END LOOP;
END;
$$;

-- Only these pre-authentication discovery/onboarding contracts are callable by anon.
DO $$
DECLARE
  function_name text;
  function_oid oid;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'get_active_tenants', 'get_tenant_config', 'check_ministry_ip_ban',
    'signup_as_moderator', 'signup_as_parent', 'signup_with_invite_code'
  ] LOOP
    FOR function_oid IN
      SELECT p.oid FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = function_name
    LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', function_oid::regprocedure);
    END LOOP;
  END LOOP;
END;
$$;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

SET check_function_bodies = true;
