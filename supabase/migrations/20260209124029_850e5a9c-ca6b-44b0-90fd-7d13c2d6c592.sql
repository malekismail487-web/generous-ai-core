-- Drop the duplicate and recreate with correct scope
DROP POLICY IF EXISTS "School admins can manage report card files" ON storage.objects;

-- Allow school admins to manage (update/delete) report card files
CREATE POLICY "School admins can manage report card files"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'report-cards'
);