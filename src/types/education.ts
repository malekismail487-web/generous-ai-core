// Education System Types for Study Bright

export type UserRole = 'super_admin' | 'school_admin' | 'teacher' | 'student' | 'parent';

export type SchoolStatus = 'active' | 'suspended';

export interface School {
  id: string;
  name: string;
  short_id: string;
  activation_code: string;
  code_used: boolean;
  status: SchoolStatus;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  school_id: string | null;
  grade: string | null;
  is_active: boolean;
  created_at: string;
}

export interface InviteCode {
  id: string;
  code: string;
  role: UserRole;
  used: boolean;
  expires_at: string;
  school_id: string;
  created_at: string;
}

export interface InviteRequest {
  id: string;
  code_id: string;
  name: string;
  email: string;
  requested_role: UserRole;
  school_id: string;
  created_at: string;
}

export interface LessonPlan {
  id: string;
  teacher_id: string;
  subject_id: string;
  title: string;
  description: string;
  content_json: {
    objectives?: string;
    standards?: string;
    strategies?: string;
    activities?: string;
    notes?: string;
  };
  files: string[];
  publish_date: string;
  status: 'draft' | 'published';
  shareable: boolean;
  classes: string[];
  school_id: string;
  created_at: string;
}

export interface Assignment {
  id: string;
  teacher_id: string;
  class_id: string;
  title: string;
  description: string;
  files: string[];
  due_date: string;
  points: number;
  submissions: AssignmentSubmission[];
  school_id: string;
  created_at: string;
}

export interface AssignmentSubmission {
  student_id: string;
  student_name: string;
  file_url: string;
  submitted_at: string;
  grade: number | null;
  feedback: string | null;
}

export interface Exam {
  id: string;
  teacher_id: string;
  class_id: string;
  title: string;
  description: string;
  questions: ExamQuestion[];
  duration_minutes: number;
  scheduled_date: string;
  total_points: number;
  school_id: string;
  created_at: string;
}

export interface ExamQuestion {
  question: string;
  options: string[];
  answer: string;
  points: number;
}

export interface Subject {
  id: string;
  name: string;
  teacher_id: string;
  school_id: string;
  created_at: string;
}

export interface Announcement {
  id: string;
  school_id: string;
  title: string;
  body: string;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  action: string;
  timestamp: string;
  school_id: string | null;
}

// API Request/Response Types
export interface CreateUserDirectRequest {
  name: string;
  email: string;
  role: UserRole;
  grade?: string;
}

export interface CreateSchoolRequest {
  name: string;
  short_id: string;
  activation_code: string;
}

export interface CreateLessonPlanRequest {
  subject_id: string;
  title: string;
  description: string;
  content_json: {
    objectives?: string;
    standards?: string;
    strategies?: string;
    activities?: string;
    notes?: string;
  };
  files: string[];
  publish_date: string;
  classes: string[];
}

export interface CreateAssignmentRequest {
  class_id: string;
  title: string;
  description: string;
  files: string[];
  due_date: string;
  points: number;
}

export interface CreateExamRequest {
  class_id: string;
  title: string;
  description: string;
  questions: ExamQuestion[];
  duration_minutes: number;
  scheduled_date: string;
  total_points: number;
}

export interface CreateAnnouncementRequest {
  title: string;
  body: string;
}
