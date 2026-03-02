
-- Backfill parent codes for all existing approved students who don't have one yet
INSERT INTO parent_invite_codes (student_id, school_id, code)
SELECT p.id, p.school_id, 'P' || upper(substr(md5(random()::text || p.id::text), 1, 7))
FROM profiles p
WHERE p.user_type = 'student'
  AND p.status = 'approved'
  AND p.is_active = true
  AND p.school_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM parent_invite_codes pic WHERE pic.student_id = p.id)
ON CONFLICT DO NOTHING;
