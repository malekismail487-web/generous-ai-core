-- Study Bright Education System Schema for Supabase
-- Run this in your Supabase SQL Editor

-- Schools Table
CREATE TABLE IF NOT EXISTS schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  short_id TEXT NOT NULL UNIQUE,
  activation_code TEXT NOT NULL UNIQUE,
  code_used BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Update Profiles Table (add education fields)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'student' CHECK (role IN ('super_admin', 'school_admin', 'teacher', 'student', 'parent')),
ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS grade TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Subjects Table
CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  teacher_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lesson Plans Table
CREATE TABLE IF NOT EXISTS lesson_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  content_json JSONB DEFAULT '{}',
  files TEXT[] DEFAULT '{}',
  publish_date TIMESTAMPTZ,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  shareable BOOLEAN DEFAULT false,
  classes TEXT[] DEFAULT '{}',
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assignments Table
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  class_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  files TEXT[] DEFAULT '{}',
  due_date TIMESTAMPTZ,
  points INTEGER DEFAULT 100,
  submissions JSONB DEFAULT '[]',
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Exams Table
CREATE TABLE IF NOT EXISTS exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  class_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  questions JSONB DEFAULT '[]',
  duration_minutes INTEGER,
  scheduled_date TIMESTAMPTZ,
  total_points INTEGER,
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Announcements Table
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invite Codes Table
CREATE TABLE IF NOT EXISTS invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  role TEXT CHECK (role IN ('teacher', 'student', 'parent')),
  used BOOLEAN DEFAULT false,
  expires_at TIMESTAMPTZ,
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invite Requests Table
CREATE TABLE IF NOT EXISTS invite_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id UUID REFERENCES invite_codes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  requested_role TEXT,
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity Logs Table
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE
);

-- Create Storage Bucket for Course Materials
INSERT INTO storage.buckets (id, name, public)
VALUES ('course-materials', 'course-materials', true)
ON CONFLICT DO NOTHING;

-- Row Level Security Policies

-- Schools: Only super admins can manage
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;

CREATE POLICY \"Super admin can manage schools\" ON schools
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'super_admin'
    )
  );

-- Profiles: School isolation
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY \"Users can view profiles in their school\" ON profiles
  FOR SELECT USING (
    school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid()
    ) OR id = auth.uid()
  );

CREATE POLICY \"School admins can manage profiles\" ON profiles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('super_admin', 'school_admin')
      AND profiles.school_id = profiles.school_id
    )
  );

-- Similar policies for other tables
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY \"School isolation for subjects\" ON subjects
  FOR ALL USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY \"School isolation for lesson_plans\" ON lesson_plans
  FOR ALL USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY \"School isolation for assignments\" ON assignments
  FOR ALL USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY \"School isolation for exams\" ON exams
  FOR ALL USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY \"School isolation for announcements\" ON announcements
  FOR ALL USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

-- Insert hardcoded schools
INSERT INTO schools (name, short_id, activation_code, code_used, status)
VALUES 
  ('Quimam al hayat international schools', 'QMM001', 'QMM001', false, 'active'),
  ('Lumina test academy', 'LUMI100', 'LUMI100', false, 'active'),
  ('test school', 'TEST999', 'TEST999', false, 'active')
ON CONFLICT (activation_code) DO NOTHING;

-- Create super admin profile (you'll need to sign up first, then update)
-- UPDATE profiles SET role = 'super_admin' WHERE email = 'malekismail487@gmail.com';
