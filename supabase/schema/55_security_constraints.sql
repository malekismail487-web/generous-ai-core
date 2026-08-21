-- Canonical Lumina schema source: authority and audit relationships

ALTER TABLE ONLY public.school_admins
  ADD CONSTRAINT school_admins_granted_by_fkey
  FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.school_admins
  ADD CONSTRAINT school_admins_revoked_by_fkey
  FOREIGN KEY (revoked_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.invite_requests
  ADD CONSTRAINT invite_requests_processed_by_fkey
  FOREIGN KEY (processed_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
CREATE INDEX school_admins_active_school_idx
  ON public.school_admins (school_id, user_id)
  WHERE active;
CREATE INDEX invite_requests_denied_at_idx
  ON public.invite_requests (denied_at DESC)
  WHERE status = 'denied';
