import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Plus,
  Trash2,
  Upload,
  File,
  FileText,
  Image,
  X,
  Download,
  Eye,
  Filter,
  FolderOpen
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { tr, getSubjectName, getGradeName } from '@/lib/translations';

// Hardcoded subjects list
const SUBJECTS = [
  { id: 'biology', emoji: '🧬', color: 'from-green-500 to-emerald-600' },
  { id: 'physics', emoji: '⚛️', color: 'from-blue-500 to-cyan-600' },
  { id: 'mathematics', emoji: '📐', color: 'from-purple-500 to-violet-600' },
  { id: 'chemistry', emoji: '🧪', color: 'from-orange-500 to-amber-600' },
  { id: 'english', emoji: '📚', color: 'from-red-500 to-rose-600' },
  { id: 'social_studies', emoji: '🌍', color: 'from-teal-500 to-cyan-600' },
  { id: 'technology', emoji: '💻', color: 'from-indigo-500 to-blue-600' },
  { id: 'arabic', emoji: '🕌', color: 'from-amber-500 to-yellow-600' },
];

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

interface CourseMaterial {
  id: string;
  title: string;
  subject: string;
  content: string | null;
  file_url: string | null;
  grade_level: string | null;
  created_at: string;
}

interface TeacherMaterialsProps {
  materials: CourseMaterial[];
  schoolId: string;
  authUserId: string;
  onRefresh: () => void;
}

export function TeacherMaterials({
  materials,
  schoolId,
  authUserId,
  onRefresh
}: TeacherMaterialsProps) {
  const { toast } = useToast();
  const { language } = useThemeLanguage();
  const t = (key: Parameters<typeof tr>[0]) => tr(key, language);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Filter state
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [filterGrade, setFilterGrade] = useState<string>('all');

  // Form state
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('biology');
  const [gradeLevel, setGradeLevel] = useState('All');
  const [content, setContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const resetForm = () => {
    setTitle('');
    setSubject('biology');
    setGradeLevel('All');
    setContent('');
    setSelectedFile(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      toast({ 
        variant: 'destructive', 
        title: t('invalidFileType'), 
        description: t('invalidFileTypeDesc') 
      });
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast({ 
        variant: 'destructive', 
        title: t('fileTooLarge'), 
        description: t('fileTooLargeDesc') 
      });
      return;
    }

    setSelectedFile(file);
  };

  const uploadFile = async (): Promise<string | null> => {
    if (!selectedFile) return null;

    const fileExt = selectedFile.name.split('.').pop();
    const fileName = `${authUserId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('course-materials')
      .upload(fileName, selectedFile, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('Upload error:', error);
      toast({ variant: 'destructive', title: t('error'), description: error.message });
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('course-materials')
      .getPublicUrl(data.path);

    return publicUrl;
  };

  const createMaterial = async () => {
    if (!title.trim()) {
      toast({ variant: 'destructive', title: t('pleaseEnterTitle') });
      return;
    }

    setUploading(true);

    let fileUrl: string | null = null;
    if (selectedFile) {
      fileUrl = await uploadFile();
      if (!fileUrl && selectedFile) {
        setUploading(false);
        return;
      }
    }

    const { error } = await supabase
      .from('course_materials')
      .insert({
        uploaded_by: authUserId,
        school_id: schoolId,
        subject: subject,
        title: title.trim(),
        content: content.trim() || null,
        file_url: fileUrl,
        grade_level: gradeLevel
      });

    setUploading(false);

    if (error) {
      console.error('Material creation error:', error);
      toast({ variant: 'destructive', title: t('error'), description: error.message });
    } else {
      toast({ title: t('materialUploadedSuccess') });
      resetForm();
      setDialogOpen(false);
      onRefresh();
    }
  };

  const deleteMaterial = async (materialId: string) => {
    const { error } = await supabase
      .from('course_materials')
      .delete()
      .eq('id', materialId);

    if (error) {
      toast({ variant: 'destructive', title: t('error') });
    } else {
      toast({ title: t('materialDeleted') });
      onRefresh();
    }
  };

  const getSubjectInfo = (subjectId: string) => {
    return SUBJECTS.find(s => s.id === subjectId) || { 
      id: subjectId, 
      emoji: '📄', 
      color: 'from-gray-500 to-gray-600' 
    };
  };

  const getFileIcon = (fileUrl: string | null) => {
    if (!fileUrl) return <FileText className="w-6 h-6" />;
    if (fileUrl.includes('.pdf')) return <File className="w-6 h-6 text-red-500" />;
    if (fileUrl.includes('.ppt') || fileUrl.includes('.pptx')) return <File className="w-6 h-6 text-orange-500" />;
    if (fileUrl.includes('.doc') || fileUrl.includes('.docx')) return <File className="w-6 h-6 text-blue-500" />;
    if (fileUrl.match(/\.(jpg|jpeg|png|gif)$/i)) return <Image className="w-6 h-6 text-green-500" />;
    return <File className="w-6 h-6" />;
  };

  // Filter materials
  const filteredMaterials = materials.filter(m => {
    if (filterSubject !== 'all' && m.subject !== filterSubject) return false;
    if (filterGrade !== 'all' && m.grade_level !== filterGrade) return false;
    return true;
  });

  // Group materials by subject
  const groupedBySubject = SUBJECTS.reduce((acc, subj) => {
    const subjectMaterials = filteredMaterials.filter(m => m.subject === subj.id);
    if (subjectMaterials.length > 0 || filterSubject === 'all') {
      acc[subj.id] = subjectMaterials;
    }
    return acc;
  }, {} as Record<string, CourseMaterial[]>);

  return (
    <div className="space-y-6">
      {/* Header with Upload Button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">{t('teacherCourseMaterials')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('uploadAndManageMaterials')}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Upload className="w-4 h-4" />
          {t('uploadMaterialBtn')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 p-4 bg-muted/50 rounded-xl">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t('filtersLabel')}</span>
        </div>
        <Select value={filterSubject} onValueChange={setFilterSubject}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t('allSubjects')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allSubjects')}</SelectItem>
            {SUBJECTS.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.emoji} {getSubjectName(s.id, language)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterGrade} onValueChange={setFilterGrade}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={t('allGrades')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allGrades')}</SelectItem>
            {GRADES.map((g) => (
              <SelectItem key={g} value={g}>{getGradeName(g, language)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Materials by Subject */}
      {filteredMaterials.length === 0 ? (
        <div className="glass-effect rounded-xl p-12 text-center">
          <FolderOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="text-lg font-semibold mb-2">{t('noMaterialsFound')}</h3>
          <p className="text-muted-foreground mb-4">
            {materials.length === 0 
              ? t('startByUploadingFirst')
              : t('noMaterialsMatchFilters')}
          </p>
          {materials.length === 0 && (
            <Button onClick={() => setDialogOpen(true)}>
              <Upload className="w-4 h-4 mr-2" />
              {t('uploadFirstMaterialBtn')}
            </Button>
          )}
        </div>
      ) : filterSubject !== 'all' ? (
        // List view when filtering by subject
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMaterials.map((material) => {
            const subjectInfo = getSubjectInfo(material.subject);
            return (
              <Card key={material.id} className="group hover:shadow-lg transition-all">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${subjectInfo.color} flex items-center justify-center text-white text-xl`}>
                      {subjectInfo.emoji}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-destructive"
                      onClick={() => deleteMaterial(material.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <CardTitle className="text-base line-clamp-2 mt-2">
                    {material.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{getSubjectName(material.subject, language)}</Badge>
                    {material.grade_level && (
                      <Badge variant="secondary">{getGradeName(material.grade_level, language)}</Badge>
                    )}
                  </div>
                  
                  {material.content && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {material.content}
                    </p>
                  )}

                  {material.file_url && (
                    <a
                      href={material.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      {getFileIcon(material.file_url)}
                      <span>{t('viewFileLabel')}</span>
                      <Download className="w-3 h-3" />
                    </a>
                  )}

                  <p className="text-xs text-muted-foreground pt-2 border-t">
                    {t('uploadedOn')} {new Date(material.created_at).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        // Grouped by subject view
        <div className="space-y-6">
          {SUBJECTS.map((subjectInfo) => {
            const subjectMaterials = groupedBySubject[subjectInfo.id] || [];
            if (subjectMaterials.length === 0) return null;

            return (
              <div key={subjectInfo.id} className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${subjectInfo.color} flex items-center justify-center text-white text-lg`}>
                    {subjectInfo.emoji}
                  </div>
                  <div>
                    <h3 className="font-semibold">{getSubjectName(subjectInfo.id, language)}</h3>
                    <p className="text-sm text-muted-foreground">
                      {subjectMaterials.length} {subjectMaterials.length !== 1 ? t('materialsCount') : t('materialCount')}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pl-13">
                  {subjectMaterials.map((material) => (
                    <div
                      key={material.id}
                      className="group flex items-center gap-3 p-3 bg-card border rounded-lg hover:shadow-md transition-all"
                    >
                      <div className="flex-shrink-0">
                        {getFileIcon(material.file_url)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{material.title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {material.grade_level && (
                            <span>{getGradeName(material.grade_level, language)}</span>
                          )}
                          <span>•</span>
                          <span>{new Date(material.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {material.file_url && (
                          <a
                            href={material.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Eye className="w-4 h-4" />
                            </Button>
                          </a>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => deleteMaterial(material.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('uploadCourseMaterial')}</DialogTitle>
            <DialogDescription>
              {t('uploadFileOrContent')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="materialTitle">{t('titleRequired')}</Label>
              <Input
                id="materialTitle"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('enterMaterialTitlePlaceholder')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('subjectRequired')}</Label>
                <Select value={subject} onValueChange={setSubject}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.emoji} {getSubjectName(s.id, language)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('gradeLevelRequired')}</Label>
                <Select value={gradeLevel} onValueChange={setGradeLevel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GRADES.map((g) => (
                      <SelectItem key={g} value={g}>{getGradeName(g, language)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* File Upload */}
            <div className="space-y-2">
              <Label>{t('uploadFileLabel')}</Label>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.ppt,.pptx,.doc,.docx,.jpg,.jpeg,.png,.gif"
                onChange={handleFileSelect}
              />
              {selectedFile ? (
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <File className="w-8 h-8 text-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedFile(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium">{t('clickToUpload')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('fileTypesAllowed')}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="materialContent">{t('additionalNotes')}</Label>
              <Textarea
                id="materialContent"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t('addNotesPlaceholder')}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={createMaterial} disabled={uploading || !title.trim()}>
              {uploading ? t('uploadingBtn') : t('uploadMaterialBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
