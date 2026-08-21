-- Ensure storage bucket exists for course materials
insert into storage.buckets (id, name, public)
values ('course-materials', 'course-materials', true)
on conflict (id) do nothing;

-- RLS policies for storage.objects in course-materials bucket
-- Allow authenticated users to upload only into their own folder: <auth.uid()>/<filename>
DROP POLICY IF EXISTS "Course materials: users can upload to own folder" ON storage.objects;
CREATE POLICY "Course materials: users can upload to own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'course-materials'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Course materials: users can update own files" ON storage.objects;
CREATE POLICY "Course materials: users can update own files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'course-materials'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'course-materials'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Course materials: users can delete own files" ON storage.objects;
CREATE POLICY "Course materials: users can delete own files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'course-materials'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to read course-materials objects metadata (public URLs already work, this helps list/download via SDK)
DROP POLICY IF EXISTS "Course materials: authenticated can read" ON storage.objects;
CREATE POLICY "Course materials: authenticated can read"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'course-materials');