import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  FileText,
  User,
  Save,
  Loader2,
  Plus,
  GraduationCap,
  Search,
  Upload,
  File,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const SUBJECTS = [
  'Mathematics', 'English', 'Arabic', 'Physics', 'Chemistry', 'Biology',
  'Social Studies', 'Technology', 'Islamic Studies', 'KSA History', 'Art and Design'
];

const TERMS = ['Term 1', 'Term 2', 'Term 3', 'Final'];

interface Student {
  id: string;
  full_name: string;
  grade_level: string | null;
}

interface SubjectScore {
  subject: string;
  score: number;
  maxScore: number;
}

interface ReportCard {
  id: string;
  student_id: string;
  term: string;
  scores_json: SubjectScore[];
  average: number | null;
  comments: string | null;
  file_url: string | null;
  created_at: string;
}

interface ReportCardCreatorProps {
  schoolId: string;
  adminId: string;
}

export function ReportCardCreator({ schoolId, adminId }: ReportCardCreatorProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedTerm, setSelectedTerm] = useState('Term 1');
  const [scores, setScores] = useState<SubjectScore[]>(
    SUBJECTS.map(s => ({ subject: s, score: 0, maxScore: 100 }))
  );
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);
  const [creationMode, setCreationMode] = useState<'manual' | 'file'>('manual');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    setLoading(true);
    
    // Fetch all students in the school
    const { data: studentsData } = await supabase
      .from('profiles')
      .select('id, full_name, grade_level')
      .eq('school_id', schoolId)
      .eq('user_type', 'student')
      .eq('status', 'approved')
      .order('full_name');

    setStudents((studentsData || []) as Student[]);

    // Fetch existing report cards
    const { data: reportCardsData } = await supabase
      .from('report_cards')
      .select('*')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false });

    // Type cast with proper handling
    const typedReportCards = (reportCardsData || []).map((rc: any) => ({
      ...rc,
      scores_json: rc.scores_json as SubjectScore[],
      file_url: rc.file_url || null
    })) as ReportCard[];

    setReportCards(typedReportCards);
    setLoading(false);
  }, [schoolId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreateDialog = (student: Student) => {
    setSelectedStudent(student);
    setSelectedTerm('Term 1');
    setScores(SUBJECTS.map(s => ({ subject: s, score: 0, maxScore: 100 })));
    setComments('');
    setCreationMode('manual');
    setSelectedFile(null);
    setOpen(true);
  };

  const updateScore = (subject: string, score: number) => {
    setScores(prev => prev.map(s => 
      s.subject === subject ? { ...s, score: Math.max(0, Math.min(score, s.maxScore)) } : s
    ));
  };

  const calculateAverage = () => {
    const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
    const totalMax = scores.reduce((sum, s) => sum + s.maxScore, 0);
    return totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({ variant: 'destructive', title: 'File too large', description: 'Maximum file size is 10MB' });
        return;
      }
      setSelectedFile(file);
    }
  };

  const uploadFile = async (): Promise<string | null> => {
    if (!selectedFile || !selectedStudent) return null;

    setUploading(true);
    const fileExt = selectedFile.name.split('.').pop();
    const fileName = `${schoolId}/${selectedStudent.id}/${selectedTerm.replace(/\s/g, '_')}_${Date.now()}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('report-cards')
      .upload(fileName, selectedFile);

    if (error) {
      toast({ variant: 'destructive', title: 'Upload failed', description: error.message });
      setUploading(false);
      return null;
    }

    const { data: urlData } = supabase.storage.from('report-cards').getPublicUrl(data.path);
    setUploading(false);
    return urlData.publicUrl;
  };

  const handleSave = async () => {
    if (!selectedStudent) return;
    
    setSaving(true);

    let fileUrl: string | null = null;
    let average: number | null = null;

    if (creationMode === 'file') {
      if (!selectedFile) {
        toast({ variant: 'destructive', title: 'Please select a file' });
        setSaving(false);
        return;
      }
      fileUrl = await uploadFile();
      if (!fileUrl) {
        setSaving(false);
        return;
      }
    } else {
      average = calculateAverage();
    }

    // Check if report card already exists for this student/term
    const existing = reportCards.find(
      rc => rc.student_id === selectedStudent.id && rc.term === selectedTerm
    );

    if (existing) {
      // Update existing
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (creationMode === 'file') {
        updateData.file_url = fileUrl;
        updateData.scores_json = [];
        updateData.average = null;
      } else {
        updateData.scores_json = scores;
        updateData.average = average;
        updateData.comments = comments;
        updateData.file_url = null;
      }

      const { error } = await supabase
        .from('report_cards')
        .update(updateData)
        .eq('id', existing.id);

      if (error) {
        toast({ variant: 'destructive', title: 'Error updating report card' });
      } else {
        toast({ title: 'Report card updated!' });
        fetchData();
        setOpen(false);
      }
    } else {
      // Get or create a subject_id (using first subject for simplicity)
      const { data: subjectData } = await supabase
        .from('subjects')
        .select('id')
        .eq('school_id', schoolId)
        .limit(1)
        .single();

      let subjectId = subjectData?.id;
      
      if (!subjectId) {
        // Create a default subject for report cards
        const { data: newSubject } = await supabase
          .from('subjects')
          .insert({ school_id: schoolId, name: 'General' })
          .select()
          .single();
        subjectId = newSubject?.id;
      }

      if (!subjectId) {
        toast({ variant: 'destructive', title: 'Error: Could not create subject reference' });
        setSaving(false);
        return;
      }

      // Create new
      const insertData: any = {
        student_id: selectedStudent.id,
        school_id: schoolId,
        subject_id: subjectId,
        term: selectedTerm,
      };

      if (creationMode === 'file') {
        insertData.file_url = fileUrl;
        insertData.scores_json = [];
        insertData.average = null;
      } else {
        insertData.scores_json = scores;
        insertData.average = average;
        insertData.comments = comments;
      }

      const { error } = await supabase
        .from('report_cards')
        .insert(insertData);

      if (error) {
        toast({ variant: 'destructive', title: 'Error creating report card', description: error.message });
      } else {
        toast({ title: 'Report card created!' });
        fetchData();
        setOpen(false);
      }
    }
    
    setSaving(false);
  };

  const getStudentReportCards = (studentId: string) => {
    return reportCards.filter(rc => rc.student_id === studentId);
  };

  const filteredStudents = students.filter(s =>
    s.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Report Cards
          </h2>
          <p className="text-sm text-muted-foreground">
            Create and manage student report cards
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search students..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Students List */}
      {filteredStudents.length === 0 ? (
        <div className="glass-effect rounded-xl p-8 text-center">
          <User className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-semibold mb-2">No Students Found</h3>
          <p className="text-sm text-muted-foreground">
            {students.length === 0 
              ? "No approved students in this school yet"
              : "No students match your search"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStudents.map((student) => {
            const studentReports = getStudentReportCards(student.id);
            
            return (
              <div 
                key={student.id} 
                className="glass-effect rounded-xl p-4 hover:shadow-lg transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{student.full_name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      {student.grade_level && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <GraduationCap className="w-3 h-3" />
                          {student.grade_level}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        {studentReports.length} report{studentReports.length !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                  </div>
                </div>
                
                {/* Existing report cards */}
                {studentReports.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {studentReports.map(rc => (
                      <Badge key={rc.id} className="text-xs gap-1">
                        {rc.file_url ? (
                          <><File className="w-3 h-3" /> {rc.term}</>
                        ) : (
                          <>{rc.term}: {rc.average}%</>
                        )}
                      </Badge>
                    ))}
                  </div>
                )}
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full mt-3 gap-2"
                  onClick={() => openCreateDialog(student)}
                >
                  <Plus className="w-4 h-4" />
                  Create Report Card
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Report Card for {selectedStudent?.full_name}
            </DialogTitle>
          </DialogHeader>

          <Tabs value={creationMode} onValueChange={(v) => setCreationMode(v as 'manual' | 'file')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="manual" className="gap-2">
                <FileText className="w-4 h-4" />
                Manual Entry
              </TabsTrigger>
              <TabsTrigger value="file" className="gap-2">
                <Upload className="w-4 h-4" />
                Upload File
              </TabsTrigger>
            </TabsList>

            <div className="mt-4 mb-4">
              <Label>Term</Label>
              <Select value={selectedTerm} onValueChange={setSelectedTerm}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TERMS.map(term => (
                    <SelectItem key={term} value={term}>{term}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <TabsContent value="manual">
              <ScrollArea className="max-h-[50vh] pr-4">
                <div className="space-y-6">
                  {/* Subject Scores */}
                  <div className="space-y-3">
                    <Label>Subject Scores</Label>
                    <div className="grid grid-cols-2 gap-3">
                      {scores.map((scoreItem) => (
                        <div key={scoreItem.subject} className="flex items-center gap-2">
                          <span className="text-sm flex-1 truncate">{scoreItem.subject}</span>
                          <Input
                            type="number"
                            min={0}
                            max={scoreItem.maxScore}
                            value={scoreItem.score}
                            onChange={(e) => updateScore(scoreItem.subject, parseInt(e.target.value) || 0)}
                            className="w-20"
                          />
                          <span className="text-xs text-muted-foreground">/{scoreItem.maxScore}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Average Display */}
                  <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <span className="font-semibold">Calculated Average</span>
                    <Badge className="text-lg px-3 py-1">{calculateAverage()}%</Badge>
                  </div>

                  {/* Comments */}
                  <div className="space-y-2">
                    <Label>Comments (Optional)</Label>
                    <Textarea
                      placeholder="Add teacher comments or notes..."
                      value={comments}
                      onChange={(e) => setComments(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="file">
              <div className="space-y-4">
                <div 
                  className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    className="hidden"
                  />
                  
                  {selectedFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <File className="w-8 h-8 text-primary" />
                      <div className="text-left">
                        <p className="font-medium">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFile(null);
                        }}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="font-semibold mb-2">Upload Report Card</h3>
                      <p className="text-sm text-muted-foreground">
                        Click to select a file (PDF, DOC, DOCX, JPG, PNG)
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Maximum file size: 10MB
                      </p>
                    </>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={() => setOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={saving || uploading} 
              className="flex-1 gap-2"
            >
              {(saving || uploading) ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Report Card
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
