-- Canonical Lumina schema source: private storage and explicit realtime publication

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('course-materials', 'course-materials', false, 52428800, ARRAY[
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg', 'image/png', 'image/gif'
  ]),
  ('report-cards', 'report-cards', false, 10485760, ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]),
  ('generated-diagrams', 'generated-diagrams', false, 10485760, ARRAY['image/png', 'image/jpeg', 'image/webp']),
  ('chat-attachments', 'chat-attachments', false, 10485760, NULL)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Course materials school read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'course-materials'
  AND (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.school_id::text = (storage.foldername(name))[1]
        AND p.status = 'approved' AND p.is_active
    )
  )
);

CREATE POLICY "Course materials scoped upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'course-materials'
  AND auth.uid()::text = (storage.foldername(name))[2]
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.school_id::text = (storage.foldername(name))[1]
      AND p.status = 'approved' AND p.is_active
      AND (p.user_type = 'teacher' OR public.is_school_admin_of(auth.uid(), p.school_id))
  )
);

CREATE POLICY "Course materials scoped mutation"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'course-materials'
  AND (
    auth.uid()::text = (storage.foldername(name))[2]
    OR ((storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
      AND public.is_school_admin_of(auth.uid(), ((storage.foldername(name))[1])::uuid))
    OR public.is_super_admin()
  )
)
WITH CHECK (
  bucket_id = 'course-materials'
  AND auth.uid()::text = (storage.foldername(name))[2]
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.school_id::text = (storage.foldername(name))[1]
      AND p.status = 'approved' AND p.is_active
      AND (p.user_type = 'teacher' OR public.is_school_admin_of(auth.uid(), p.school_id))
  )
);

CREATE POLICY "Course materials scoped delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'course-materials'
  AND (
    auth.uid()::text = (storage.foldername(name))[2]
    OR ((storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
      AND public.is_school_admin_of(auth.uid(), ((storage.foldername(name))[1])::uuid))
    OR public.is_super_admin()
  )
);

CREATE POLICY "Report cards school upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'report-cards'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  AND public.is_school_admin_of(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Report cards school mutation"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'report-cards'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  AND (public.is_school_admin_of(auth.uid(), ((storage.foldername(name))[1])::uuid) OR public.is_super_admin())
)
WITH CHECK (
  bucket_id = 'report-cards'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  AND (public.is_school_admin_of(auth.uid(), ((storage.foldername(name))[1])::uuid) OR public.is_super_admin())
);

CREATE POLICY "Report cards school delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'report-cards'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  AND (public.is_school_admin_of(auth.uid(), ((storage.foldername(name))[1])::uuid) OR public.is_super_admin())
);

CREATE POLICY "Report cards scoped read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'report-cards'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  AND (
    public.is_school_admin_of(auth.uid(), ((storage.foldername(name))[1])::uuid)
    OR public.is_super_admin()
    OR auth.uid()::text = (storage.foldername(name))[2]
    OR ((storage.foldername(name))[2] ~* '^[0-9a-f-]{36}$'
      AND public.is_parent_of(auth.uid(), ((storage.foldername(name))[2])::uuid))
  )
);

CREATE POLICY "Chat attachments owner upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chat-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Chat attachments owner read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'chat-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Chat attachments owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'chat-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- generated-diagrams intentionally has no browser policy. The authenticated,
-- bounded generation endpoint returns short-lived signed URLs.

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'announcements', 'submissions', 'invite_requests', 'chat_messages',
    'ministry_access_requests', 'teacher_categories', 'live_meetings'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END;
$$;
