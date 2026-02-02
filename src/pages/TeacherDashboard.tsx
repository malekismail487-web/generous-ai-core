import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import {
  Loader2,
  LogOut,
  BookOpen,
  FileText,
  GraduationCap,
  ClipboardList,
  BarChart3,
  Megaphone,
  Plus,
  Trash2,
  Eye,
  Upload,
  File,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Hardcoded subjects list - same as used elsewhere in the app
const SUBJECTS = [
  { id: 'biology', name: 'Biology', emoji: '🧬' },
  { id: 'physics', name: 'Physics', emoji: '⚛️' },
  { id: 'mathematics', name: 'Mathematics', emoji: '📐' },
  { id: 'chemistry', name: 'Chemistry', emoji: '🧪' },
  { id: 'english', name: 'English', emoji: '📚' },
  { id: 'social_studies', name: 'Social Studies', emoji: '🌍' },
  { id: 'technology', name: 'Technology', emoji: '💻' },
  { id: 'arabic', name: 'Arabic', emoji: '🕌' },
];

// Grade levels from KG to Grade 12
const GRADES = [
  'All', 'KG1', 'KG2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4',
  'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9',
  'Grade 10', 'Grade 11', 'Grade 12'
];

const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/gif'
];

const FILE_TYPE_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.ms-powerpoint': 'PowerPoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
  'application/msword': 'Word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
};

interface CourseMaterial {
  id: string;
  title: string;
  subject: string;
  content: string | null;
  file_url: string | null;
  grade_level: string | null;
  created_at: string;
}

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  grade_level: string;
  due_date: string | null;
  points: number;
  created_at: string;
}

interface Submission {
  id: string;
  assignment_id: string;
  student_id: string;
  content: string | null;
  submitted_at: string;
  grade: number | null;
  feedback: string | null;
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  created_at: string;
}

export default function TeacherDashboard() {
  const { isTeacher, school, profile, loading } = useRoleGuard();
  const { signOut, user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [courseMaterials, setCourseMaterials] = useState<CourseMaterial[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Dialog states
  const [materialDialogOpen, setMaterialDialogOpen] = useState(false);
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [gradingDialogOpen, setGradingDialogOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);

  // Course Material form
  const [newMaterialTitle, setNewMaterialTitle] = useState('');
  const [newMaterialSubject, setNewMaterialSubject] = useState('biology');
  const [newMaterialContent, setNewMaterialContent] = useState('');
  const [newMaterialGradeLevel, setNewMaterialGradeLevel] = useState('All');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Assignment form
  const [newAssignmentTitle, setNewAssignmentTitle] = useState('');
  const [newAssignmentDescription, setNewAssignmentDescription] = useState('');
  const [newAssignmentSubject, setNewAssignmentSubject] = useState('biology');
  const [newAssignmentGradeLevel, setNewAssignmentGradeLevel] = useState('All');
  const [newAssignmentDueDate, setNewAssignmentDueDate] = useState('');
  const [newAssignmentPoints, setNewAssignmentPoints] = useState('100');

  // Grading form
  const [gradeValue, setGradeValue] = useState('');
  const [feedbackValue, setFeedbackValue] = useState('');

  const fetchData = useCallback(async () => {
    if (!school || !profile) return;
    setLoadingData(true);

    // Fetch course materials
    const { data: materialsData } = await supabase
      .from('course_materials')
      .select('*')
      .eq('uploaded_by', profile.id)
      .order('created_at', { ascending: false });
    setCourseMaterials((materialsData || []) as CourseMaterial[]);

    // Fetch assignments
    const { data: assignmentsData } = await supabase
      .from('assignments')
      .select('*')
      .eq('teacher_id', profile.id)
      .order('created_at', { ascending: false });
    setAssignments((assignmentsData || []) as Assignment[]);

    // Fetch submissions for teacher's assignments
    if (assignmentsData && assignmentsData.length > 0) {
      const assignmentIds = assignmentsData.map(a => a.id);
      const { data: submissionsData } = await supabase
        .from('submissions')
        .select('*')
        .in('assignment_id', assignmentIds);
      setSubmissions((submissionsData || []) as Submission[]);
    }

    // Fetch announcements
    const { data: announcementsData } = await supabase
      .from('announcements')
      .select('*')
      .eq('school_id', school.id)
      .order('created_at', { ascending: false });
    setAnnouncements((announcementsData || []) as Announcement[]);

    setLoadingData(false);
  }, [school, profile]);

  useEffect(() => {
    if (isTeacher && school && profile) {
      fetchData();
    }
  }, [isTeacher, school, profile, fetchData]);

  // File handling
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      toast({ variant: 'destructive', title: 'Invalid file type', description: 'Please upload PDF, Word, or PowerPoint files.' });
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Maximum file size is 50MB.' });
      return;
    }

    setSelectedFile(file);
  };

  const uploadFile = async (): Promise<string | null> => {
    if (!selectedFile || !user) return null;

    setIsUploading(true);

    const fileExt = selectedFile.name.split('.').pop();
    const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('course-materials')
      .upload(fileName, selectedFile, {
        cacheControl: '3600',
        upsert: false,
      });

    setIsUploading(false);

    if (error) {
      console.error('Upload error:', error);
      toast({ variant: 'destructive', title: 'Upload failed', description: error.message });
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('course-materials')
      .getPublicUrl(data.path);

    return publicUrl;
  };

  // Course Material CRUD
  const createCourseMaterial = async () => {
    if (!school || !profile || !newMaterialTitle.trim()) {
      toast({ variant: 'destructive', title: 'Please enter a title' });
      return;
    }

    let fileUrl: string | null = null;
    if (selectedFile) {
      fileUrl = await uploadFile();
      if (!fileUrl && selectedFile) {
        return; // Upload failed
      }
    }

    const { error } = await supabase
      .from('course_materials')
      .insert({
        uploaded_by: profile.id,
        school_id: school.id,
        subject: newMaterialSubject,
        title: newMaterialTitle.trim(),
        content: newMaterialContent.trim() || null,
        file_url: fileUrl,
        grade_level: newMaterialGradeLevel
      });

    if (error) {
      toast({ variant: 'destructive', title: 'Error uploading material' });
      console.error(error);
    } else {
      toast({ title: 'Course material uploaded!' });
      resetMaterialForm();
      setMaterialDialogOpen(false);
      fetchData();
    }
  };

  const resetMaterialForm = () => {
    setNewMaterialTitle('');
    setNewMaterialSubject('biology');
    setNewMaterialContent('');
    setNewMaterialGradeLevel('All');
    setSelectedFile(null);
  };

  const deleteCourseMaterial = async (materialId: string) => {
    const { error } = await supabase
      .from('course_materials')
      .delete()
      .eq('id', materialId);

    if (error) {
      toast({ variant: 'destructive', title: 'Error deleting material' });
    } else {
      toast({ title: 'Material deleted' });
      fetchData();
    }
  };

  // Assignment CRUD
  const createAssignment = async () => {
    if (!school || !profile || !newAssignmentTitle.trim()) {
      toast({ variant: 'destructive', title: 'Please enter a title' });
      return;
    }

    const { error } = await supabase
      .from('assignments')
      .insert({
        teacher_id: profile.id,
        school_id: school.id,
        subject: newAssignmentSubject,
        title: newAssignmentTitle.trim(),
        description: newAssignmentDescription.trim() || null,
        due_date: newAssignmentDueDate || null,
        points: parseInt(newAssignmentPoints) || 100,
        grade_level: newAssignmentGradeLevel
      });

    if (error) {
      toast({ variant: 'destructive', title: 'Error creating assignment' });
      console.error(error);
    } else {
      toast({ title: 'Assignment created!' });
      resetAssignmentForm();
      setAssignmentDialogOpen(false);
      fetchData();
    }
  };

  const resetAssignmentForm = () => {
    setNewAssignmentTitle('');
    setNewAssignmentDescription('');
    setNewAssignmentSubject('biology');
    setNewAssignmentGradeLevel('All');
    setNewAssignmentDueDate('');
    setNewAssignmentPoints('100');
  };

  const deleteAssignment = async (assignmentId: string) => {
    const { error } = await supabase
      .from('assignments')
      .delete()
      .eq('id', assignmentId);

    if (error) {
      toast({ variant: 'destructive', title: 'Error deleting assignment' });
    } else {
      toast({ title: 'Assignment deleted' });
      fetchData();
    }
  };

  // Grading
  const gradeSubmission = async () => {
    if (!selectedSubmission || !profile) return;

    const { error } = await supabase
      .from('submissions')
      .update({
        grade: parseInt(gradeValue) || null,
        feedback: feedbackValue || null,
        graded_at: new Date().toISOString(),
        graded_by: profile.id
      })
      .eq('id', selectedSubmission.id);

    if (error) {
      toast({ variant: 'destructive', title: 'Error saving grade' });
    } else {
      toast({ title: 'Grade saved!' });
      setGradingDialogOpen(false);
      setSelectedSubmission(null);
      setGradeValue('');
      setFeedbackValue('');
      fetchData();
    }
  };

  const getSubjectInfo = (subjectId: string) => {
    return SUBJECTS.find(s => s.id === subjectId) || { id: subjectId, name: subjectId, emoji: '📄' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isTeacher || !school || !profile?.is_active) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass-effect-strong border-b border-border/30 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Teacher Dashboard</h1>
              <p className="text-xs text-muted-foreground">{school.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {profile.full_name}
            </span>
            <Button variant="outline" size="icon" onClick={signOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Course Materials</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{courseMaterials.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Assignments</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{assignments.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Pending Grading</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-amber-500">
                {submissions.filter(s => s.grade === null).length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Announcements</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{announcements.length}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="materials" className="space-y-6">
          <TabsList className="grid grid-cols-5 w-full max-w-2xl">
            <TabsTrigger value="materials" className="gap-2">
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Materials</span>
            </TabsTrigger>
            <TabsTrigger value="assignments" className="gap-2">
              <ClipboardList className="w-4 h-4" />
              <span className="hidden sm:inline">Assign</span>
            </TabsTrigger>
            <TabsTrigger value="grading" className="gap-2">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Grade</span>
              {submissions.filter(s => s.grade === null).length > 0 && (
                <Badge variant="destructive" className="ml-1">
                  {submissions.filter(s => s.grade === null).length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="insights" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">Insights</span>
            </TabsTrigger>
            <TabsTrigger value="announcements" className="gap-2">
              <Megaphone className="w-4 h-4" />
              <span className="hidden sm:inline">News</span>
            </TabsTrigger>
          </TabsList>

          {/* Course Materials Tab */}
          <TabsContent value="materials" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Course Materials</h2>
              <Dialog open={materialDialogOpen} onOpenChange={setMaterialDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Upload className="w-4 h-4" />
                    Upload Material
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Upload Course Material</DialogTitle>
                    <DialogDescription>
                      Upload a file or add content for your students
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                    <div className="space-y-2">
                      <Label htmlFor="material-title">Title *</Label>
                      <Input
                        id="material-title"
                        value={newMaterialTitle}
                        onChange={(e) => setNewMaterialTitle(e.target.value)}
                        placeholder="e.g., Chapter 3: Photosynthesis"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="material-subject">Subject *</Label>
                      <select
                        id="material-subject"
                        value={newMaterialSubject}
                        onChange={(e) => setNewMaterialSubject(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-sm"
                      >
                        {SUBJECTS.map((subj) => (
                          <option key={subj.id} value={subj.id}>
                            {subj.emoji} {subj.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="material-grade">Grade Level *</Label>
                      <select
                        id="material-grade"
                        value={newMaterialGradeLevel}
                        onChange={(e) => setNewMaterialGradeLevel(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-sm"
                      >
                        {GRADES.map((grade) => (
                          <option key={grade} value={grade}>
                            {grade === 'All' ? '📋 All Grades' : `🎓 ${grade}`}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-muted-foreground">
                        Only students in this grade will see this material
                      </p>
                    </div>

                    {/* File Upload */}
                    <div className="space-y-2">
                      <Label>Upload File (PDF, Word, PowerPoint)</Label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleFileSelect}
                        accept=".pdf,.doc,.docx,.ppt,.pptx"
                        className="hidden"
                      />
                      
                      {selectedFile ? (
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 border border-border/50">
                          <File size={20} className="text-primary" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                              {FILE_TYPE_LABELS[selectedFile.type] && ` • ${FILE_TYPE_LABELS[selectedFile.type]}`}
                            </p>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => setSelectedFile(null)}>
                            <X size={16} />
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full p-6 rounded-xl border-2 border-dashed border-border/50 hover:border-primary/50 transition-colors text-center"
                        >
                          <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">Click to upload</p>
                          <p className="text-xs text-muted-foreground mt-1">PDF, Word, PowerPoint up to 50MB</p>
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="material-content">Additional Notes (optional)</Label>
                      <Textarea
                        id="material-content"
                        value={newMaterialContent}
                        onChange={(e) => setNewMaterialContent(e.target.value)}
                        placeholder="Add any notes or instructions..."
                        rows={3}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setMaterialDialogOpen(false); resetMaterialForm(); }}>
                      Cancel
                    </Button>
                    <Button onClick={createCourseMaterial} disabled={isUploading || !newMaterialTitle.trim()}>
                      {isUploading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Uploading...
                        </>
                      ) : (
                        'Upload Material'
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {loadingData ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : courseMaterials.length === 0 ? (
              <div className="glass-effect rounded-xl p-8 text-center">
                <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-semibold mb-2">No Course Materials Yet</h3>
                <p className="text-sm text-muted-foreground">Upload your first file or content to get started</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {courseMaterials.map((material) => {
                  const subjectInfo = getSubjectInfo(material.subject);
                  return (
                    <div key={material.id} className="glass-effect rounded-xl p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-lg">{subjectInfo.emoji}</span>
                            <h3 className="font-semibold">{material.title}</h3>
                            <Badge variant="outline">{subjectInfo.name}</Badge>
                            {material.grade_level && (
                              <Badge variant="secondary" className="gap-1">
                                <GraduationCap className="w-3 h-3" />
                                {material.grade_level}
                              </Badge>
                            )}
                            {material.file_url && (
                              <Badge className="bg-primary/20 text-primary">Has File</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            Created {new Date(material.created_at).toLocaleDateString()}
                          </p>
                          {material.content && (
                            <p className="mt-2 text-sm line-clamp-2">{material.content}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {material.file_url && (
                            <Button
                              variant="ghost"
                              size="icon"
                              asChild
                            >
                              <a href={material.file_url} target="_blank" rel="noopener noreferrer">
                                <Eye className="w-4 h-4" />
                              </a>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteCourseMaterial(material.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Assignments Tab */}
          <TabsContent value="assignments" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Assignments</h2>
              <Dialog open={assignmentDialogOpen} onOpenChange={setAssignmentDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="w-4 h-4" />
                    Create Assignment
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Assignment</DialogTitle>
                    <DialogDescription>
                      Create a new assignment for your students
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="assignment-title">Title *</Label>
                      <Input
                        id="assignment-title"
                        value={newAssignmentTitle}
                        onChange={(e) => setNewAssignmentTitle(e.target.value)}
                        placeholder="Assignment title"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="assignment-subject">Subject *</Label>
                      <select
                        id="assignment-subject"
                        value={newAssignmentSubject}
                        onChange={(e) => setNewAssignmentSubject(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-sm"
                      >
                        {SUBJECTS.map((subj) => (
                          <option key={subj.id} value={subj.id}>
                            {subj.emoji} {subj.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="assignment-grade">Grade Level *</Label>
                      <select
                        id="assignment-grade"
                        value={newAssignmentGradeLevel}
                        onChange={(e) => setNewAssignmentGradeLevel(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-sm"
                      >
                        {GRADES.map((grade) => (
                          <option key={grade} value={grade}>
                            {grade === 'All' ? '📋 All Grades' : `🎓 ${grade}`}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-muted-foreground">
                        Only students in this grade will see this assignment
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="assignment-description">Description</Label>
                      <Textarea
                        id="assignment-description"
                        value={newAssignmentDescription}
                        onChange={(e) => setNewAssignmentDescription(e.target.value)}
                        placeholder="Assignment instructions"
                        rows={4}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="assignment-due">Due Date</Label>
                        <Input
                          id="assignment-due"
                          type="datetime-local"
                          value={newAssignmentDueDate}
                          onChange={(e) => setNewAssignmentDueDate(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="assignment-points">Points</Label>
                        <Input
                          id="assignment-points"
                          type="number"
                          value={newAssignmentPoints}
                          onChange={(e) => setNewAssignmentPoints(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setAssignmentDialogOpen(false); resetAssignmentForm(); }}>
                      Cancel
                    </Button>
                    <Button onClick={createAssignment} disabled={!newAssignmentTitle.trim()}>
                      Create Assignment
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="glass-effect rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Points</TableHead>
                    <TableHead>Submissions</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No assignments yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    assignments.map((assignment) => {
                      const submissionCount = submissions.filter(s => s.assignment_id === assignment.id).length;
                      const isOverdue = assignment.due_date && new Date(assignment.due_date) < new Date();
                      const subjectInfo = getSubjectInfo(assignment.subject);
                      return (
                        <TableRow key={assignment.id}>
                          <TableCell className="font-medium">{assignment.title}</TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1">
                              {subjectInfo.emoji} {subjectInfo.name}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{assignment.grade_level}</Badge>
                          </TableCell>
                          <TableCell>
                            {assignment.due_date ? (
                              <span className={isOverdue ? 'text-destructive' : ''}>
                                {new Date(assignment.due_date).toLocaleDateString()}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">No due date</span>
                            )}
                          </TableCell>
                          <TableCell>{assignment.points}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{submissionCount}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteAssignment(assignment.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Grading Tab */}
          <TabsContent value="grading" className="space-y-4">
            <h2 className="text-lg font-semibold">Student Submissions</h2>

            <div className="glass-effect rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Assignment</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No submissions yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    submissions.map((submission) => {
                      const assignment = assignments.find(a => a.id === submission.assignment_id);
                      return (
                        <TableRow key={submission.id}>
                          <TableCell className="font-medium">{assignment?.title || 'Unknown'}</TableCell>
                          <TableCell>
                            {new Date(submission.submitted_at).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            {submission.grade !== null ? (
                              <Badge className="bg-green-500">{submission.grade}/{assignment?.points || 100}</Badge>
                            ) : (
                              <Badge variant="destructive">Not graded</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedSubmission(submission);
                                setGradeValue(submission.grade?.toString() || '');
                                setFeedbackValue(submission.feedback || '');
                                setGradingDialogOpen(true);
                              }}
                            >
                              {submission.grade !== null ? 'Edit Grade' : 'Grade'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Grading Dialog */}
            <Dialog open={gradingDialogOpen} onOpenChange={setGradingDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Grade Submission</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {selectedSubmission?.content && (
                    <div className="space-y-2">
                      <Label>Student's Answer</Label>
                      <div className="p-3 bg-muted rounded-lg text-sm">
                        {selectedSubmission.content}
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="grade">Grade</Label>
                    <Input
                      id="grade"
                      type="number"
                      value={gradeValue}
                      onChange={(e) => setGradeValue(e.target.value)}
                      placeholder="Enter grade"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="feedback">Feedback</Label>
                    <Textarea
                      id="feedback"
                      value={feedbackValue}
                      onChange={(e) => setFeedbackValue(e.target.value)}
                      placeholder="Feedback for student"
                      rows={4}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setGradingDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={gradeSubmission}>Save Grade</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Insights Tab */}
          <TabsContent value="insights" className="space-y-4">
            <h2 className="text-lg font-semibold">Dashboard Insights</h2>
            
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Submission Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {assignments.length > 0 
                      ? Math.round((submissions.length / assignments.length) * 100)
                      : 0}%
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {submissions.length} submissions across {assignments.length} assignments
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Average Grade</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {submissions.filter(s => s.grade !== null).length > 0
                      ? Math.round(
                          submissions
                            .filter(s => s.grade !== null)
                            .reduce((acc, s) => acc + (s.grade || 0), 0) /
                          submissions.filter(s => s.grade !== null).length
                        )
                      : 'N/A'}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Based on {submissions.filter(s => s.grade !== null).length} graded submissions
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Materials by Subject</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {SUBJECTS.map(subj => {
                      const count = courseMaterials.filter(m => m.subject === subj.id).length;
                      if (count === 0) return null;
                      return (
                        <div key={subj.id} className="flex items-center justify-between text-sm">
                          <span>{subj.emoji} {subj.name}</span>
                          <Badge variant="outline">{count}</Badge>
                        </div>
                      );
                    })}
                    {courseMaterials.length === 0 && (
                      <p className="text-sm text-muted-foreground">No materials uploaded yet</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Assignments by Subject</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {SUBJECTS.map(subj => {
                      const count = assignments.filter(a => a.subject === subj.id).length;
                      if (count === 0) return null;
                      return (
                        <div key={subj.id} className="flex items-center justify-between text-sm">
                          <span>{subj.emoji} {subj.name}</span>
                          <Badge variant="outline">{count}</Badge>
                        </div>
                      );
                    })}
                    {assignments.length === 0 && (
                      <p className="text-sm text-muted-foreground">No assignments created yet</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Announcements Tab */}
          <TabsContent value="announcements" className="space-y-4">
            <h2 className="text-lg font-semibold">School Announcements</h2>

            {announcements.length === 0 ? (
              <div className="glass-effect rounded-xl p-8 text-center">
                <Megaphone className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-semibold mb-2">No Announcements</h3>
                <p className="text-sm text-muted-foreground">School announcements will appear here</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {announcements.map((announcement) => (
                  <div key={announcement.id} className="glass-effect rounded-xl p-4">
                    <h3 className="font-semibold">{announcement.title}</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      {new Date(announcement.created_at).toLocaleDateString()}
                    </p>
                    <p className="text-sm">{announcement.body}</p>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
