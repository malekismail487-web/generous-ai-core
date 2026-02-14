
-- Allow authenticated users to upload weekly plan files
CREATE POLICY "Authenticated users can upload weekly plan files"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'course-materials'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'weekly-plans'
);

-- Allow anyone to read weekly plan files
CREATE POLICY "Anyone can read weekly plan files"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'course-materials'
  AND (storage.foldername(name))[1] = 'weekly-plans'
);
