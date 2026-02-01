// Supabase API Service for Study Bright Education System
import { supabase } from '@/integrations/supabase/client';
import type { 
  School, 
  Profile, 
  InviteCode, 
  InviteRequest, 
  LessonPlan, 
  Assignment, 
  Exam, 
  Subject, 
  Announcement,
  CreateUserDirectRequest,
  CreateSchoolRequest,
  CreateLessonPlanRequest,
  CreateAssignmentRequest,
  CreateExamRequest
} from '@/types/education';

const SUPER_ADMIN_EMAIL = 'malekismail487@gmail.com';

// Hard-coded school activation codes
const HARDCODED_SCHOOLS = {
  'QMM001': 'Quimam al hayat international schools',
  'LUMI100': 'Lumina test academy',
  'TEST999': 'test school'
};

// ============ AUTH ============
export async function loginUser(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  
  return profile;
}

export async function logoutUser() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ============ SUPER ADMIN ============
export async function createSchool(request: CreateSchoolRequest) {
  const { data, error } = await supabase
    .from('schools')
    .insert({
      name: request.name,
      short_id: request.short_id,
      activation_code: request.activation_code,
      code_used: false,
      status: 'active'
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getAllSchools() {
  const { data, error } = await supabase
    .from('schools')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data as School[];
}

export async function suspendSchool(schoolId: string) {
  // Update school status
  const { error: schoolError } = await supabase
    .from('schools')
    .update({ status: 'suspended' })
    .eq('id', schoolId);
  
  if (schoolError) throw schoolError;
  
  // Deactivate all users
  const { error: usersError } = await supabase
    .from('profiles')
    .update({ is_active: false })
    .eq('school_id', schoolId);
  
  if (usersError) throw usersError;
}

export async function activateSchool(schoolId: string) {
  const { error: schoolError } = await supabase
    .from('schools')
    .update({ status: 'active' })
    .eq('id', schoolId);
  
  if (schoolError) throw schoolError;
  
  const { error: usersError } = await supabase
    .from('profiles')
    .update({ is_active: true })
    .eq('school_id', schoolId);
  
  if (usersError) throw usersError;
}

export async function deleteSchool(schoolId: string) {
  // Delete school and cascade will handle related data
  const { error } = await supabase
    .from('schools')
    .delete()
    .eq('id', schoolId);
  
  if (error) throw error;
}

// ============ SCHOOL ADMIN ============
export async function createUserDirect(request: CreateUserDirectRequest, schoolId: string) {
  // Create auth user
  const tempPassword = Math.random().toString(36).slice(-12);
  
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: request.email,
    password: tempPassword,
  });
  
  if (authError) throw authError;
  
  // Create profile
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: authData.user?.id,
      email: request.email,
      name: request.name,
      role: request.role,
      school_id: schoolId,
      grade: request.grade || null,
      is_active: true
    })
    .select()
    .single();
  
  if (error) throw error;
  return { profile: data, temporary_password: tempPassword };
}

export async function getSchoolUsers(schoolId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data as Profile[];
}

export async function updateUser(userId: string, updates: Partial<Profile>) {
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);
  
  if (error) throw error;
}

export async function deleteUser(userId: string) {
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', userId);
  
  if (error) throw error;
}

export async function createAnnouncement(title: string, body: string, schoolId: string) {
  const { data, error } = await supabase
    .from('announcements')
    .insert({ title, body, school_id: schoolId })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getAnnouncements(schoolId: string) {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data as Announcement[];
}

// ============ TEACHER ============
export async function createSubject(name: string, teacherId: string, schoolId: string) {
  const { data, error } = await supabase
    .from('subjects')
    .insert({ name, teacher_id: teacherId, school_id: schoolId })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getTeacherSubjects(teacherId: string) {
  const { data, error } = await supabase
    .from('subjects')
    .select('*')
    .eq('teacher_id', teacherId);
  
  if (error) throw error;
  return data as Subject[];
}

export async function createLessonPlan(request: CreateLessonPlanRequest, teacherId: string, schoolId: string) {
  const { data, error } = await supabase
    .from('lesson_plans')
    .insert({
      teacher_id: teacherId,
      subject_id: request.subject_id,
      title: request.title,
      description: request.description,
      content_json: request.content_json,
      files: request.files,
      publish_date: request.publish_date,
      status: 'published',
      classes: request.classes,
      school_id: schoolId
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getTeacherLessonPlans(teacherId: string) {
  const { data, error } = await supabase
    .from('lesson_plans')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data as LessonPlan[];
}

export async function createAssignment(request: CreateAssignmentRequest, teacherId: string, schoolId: string) {
  const { data, error } = await supabase
    .from('assignments')
    .insert({
      teacher_id: teacherId,
      class_id: request.class_id,
      title: request.title,
      description: request.description,
      files: request.files,
      due_date: request.due_date,
      points: request.points,
      submissions: [],
      school_id: schoolId
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getTeacherAssignments(teacherId: string) {
  const { data, error } = await supabase
    .from('assignments')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data as Assignment[];
}

export async function createExam(request: CreateExamRequest, teacherId: string, schoolId: string) {
  const { data, error } = await supabase
    .from('exams')
    .insert({
      teacher_id: teacherId,
      class_id: request.class_id,
      title: request.title,
      description: request.description,
      questions: request.questions,
      duration_minutes: request.duration_minutes,
      scheduled_date: request.scheduled_date,
      total_points: request.total_points,
      school_id: schoolId
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getTeacherExams(teacherId: string) {
  const { data, error } = await supabase
    .from('exams')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data as Exam[];
}

export async function getTeacherStudents(schoolId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('school_id', schoolId)
    .eq('role', 'student')
    .eq('is_active', true);
  
  if (error) throw error;
  return data as Profile[];
}

// ============ STUDENT ============
export async function getStudentLessonPlans(schoolId: string) {
  const { data, error } = await supabase
    .from('lesson_plans')
    .select('*')
    .eq('school_id', schoolId)
    .eq('status', 'published')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data as LessonPlan[];
}

export async function getStudentAssignments(schoolId: string) {
  const { data, error } = await supabase
    .from('assignments')
    .select('*')
    .eq('school_id', schoolId)
    .order('due_date', { ascending: true });
  
  if (error) throw error;
  return data as Assignment[];
}

export async function getStudentExams(schoolId: string) {
  const { data, error } = await supabase
    .from('exams')
    .select('*')
    .eq('school_id', schoolId)
    .order('scheduled_date', { ascending: true });
  
  if (error) throw error;
  return data as Exam[];
}

export async function submitAssignment(assignmentId: string, studentId: string, studentName: string, fileUrl: string) {
  // Get current assignment
  const { data: assignment, error: fetchError } = await supabase
    .from('assignments')
    .select('*')
    .eq('id', assignmentId)
    .single();
  
  if (fetchError) throw fetchError;
  
  // Add submission
  const submissions = assignment.submissions || [];
  const existingIndex = submissions.findIndex((s: any) => s.student_id === studentId);
  
  const newSubmission = {
    student_id: studentId,
    student_name: studentName,
    file_url: fileUrl,
    submitted_at: new Date().toISOString(),
    grade: null,
    feedback: null
  };
  
  if (existingIndex >= 0) {
    submissions[existingIndex] = newSubmission;
  } else {
    submissions.push(newSubmission);
  }
  
  const { error } = await supabase
    .from('assignments')
    .update({ submissions })
    .eq('id', assignmentId);
  
  if (error) throw error;
}

// ============ FILE UPLOAD ============
export async function uploadFile(file: File, schoolId: string) {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
  const filePath = `${schoolId}/${fileName}`;
  
  const { error: uploadError } = await supabase.storage
    .from('course-materials')
    .upload(filePath, file);
  
  if (uploadError) throw uploadError;
  
  const { data } = supabase.storage
    .from('course-materials')
    .getPublicUrl(filePath);
  
  return data.publicUrl;
}
