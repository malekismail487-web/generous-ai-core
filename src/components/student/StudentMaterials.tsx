import { useState } from 'react';
import {
  BookOpen,
  File,
  FileText,
  Image,
  Download,
  Eye,
  Filter,
  FolderOpen,
  Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

const SUBJECTS = [
  { id: 'biology', name: 'Biology', emoji: '🧬', color: 'from-green-500 to-emerald-600' },
  { id: 'physics', name: 'Physics', emoji: '⚛️', color: 'from-blue-500 to-cyan-600' },
  { id: 'mathematics', name: 'Mathematics', emoji: '📐', color: 'from-purple-500 to-violet-600' },
  { id: 'chemistry', name: 'Chemistry', emoji: '🧪', color: 'from-orange-500 to-amber-600' },
  { id: 'english', name: 'English', emoji: '📚', color: 'from-red-500 to-rose-600' },
  { id: 'social_studies', name: 'Social Studies', emoji: '🌍', color: 'from-teal-500 to-cyan-600' },
  { id: 'technology', name: 'Technology', emoji: '💻', color: 'from-indigo-500 to-blue-600' },
  { id: 'arabic', name: 'Arabic', emoji: '🕌', color: 'from-amber-500 to-yellow-600' },
];

interface CourseMaterial {
  id: string;
  title: string;
  subject: string;
  content: string | null;
  file_url: string | null;
  grade_level: string | null;
  created_at: string;
  uploaded_by?: string;
}

interface TeacherProfile {
  id: string;
  full_name: string;
}

interface StudentMaterialsProps {
  materials: CourseMaterial[];
  teacherProfiles?: Record<string, TeacherProfile>;
}

export function StudentMaterials({ materials, teacherProfiles = {} }: StudentMaterialsProps) {
  // Filter state
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // View state
  const [selectedMaterial, setSelectedMaterial] = useState<CourseMaterial | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  const getTeacherName = (uploadedBy: string | undefined) => {
    if (!uploadedBy) return 'Teacher';
    return teacherProfiles[uploadedBy]?.full_name || 'Teacher';
  };

  const getSubjectInfo = (subjectId: string) => {
    return SUBJECTS.find(s => s.id === subjectId) || { 
      id: subjectId, 
      name: subjectId, 
      emoji: '📄', 
      color: 'from-gray-500 to-gray-600' 
    };
  };

  const getFileIcon = (fileUrl: string | null) => {
    if (!fileUrl) return <FileText className="w-5 h-5" />;
    if (fileUrl.includes('.pdf')) return <File className="w-5 h-5 text-red-500" />;
    if (fileUrl.includes('.ppt') || fileUrl.includes('.pptx')) return <File className="w-5 h-5 text-orange-500" />;
    if (fileUrl.includes('.doc') || fileUrl.includes('.docx')) return <File className="w-5 h-5 text-blue-500" />;
    if (fileUrl.match(/\.(jpg|jpeg|png|gif)$/i)) return <Image className="w-5 h-5 text-green-500" />;
    return <File className="w-5 h-5" />;
  };

  const getFileType = (fileUrl: string | null) => {
    if (!fileUrl) return 'Note';
    if (fileUrl.includes('.pdf')) return 'PDF';
    if (fileUrl.includes('.ppt') || fileUrl.includes('.pptx')) return 'PowerPoint';
    if (fileUrl.includes('.doc') || fileUrl.includes('.docx')) return 'Word';
    if (fileUrl.match(/\.(jpg|jpeg|png|gif)$/i)) return 'Image';
    return 'File';
  };

  // Filter materials
  const filteredMaterials = materials.filter(m => {
    if (filterSubject !== 'all' && m.subject !== filterSubject) return false;
    if (searchQuery && !m.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Count materials per subject
  const subjectCounts = SUBJECTS.reduce((acc, subject) => {
    acc[subject.id] = materials.filter(m => m.subject === subject.id).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* Subject Cards - Classera Style Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {SUBJECTS.filter(s => subjectCounts[s.id] > 0).slice(0, 4).map((subject) => (
          <Card 
            key={subject.id}
            className={`cursor-pointer hover:shadow-lg transition-all ${
              filterSubject === subject.id ? 'ring-2 ring-primary' : ''
            }`}
            onClick={() => setFilterSubject(filterSubject === subject.id ? 'all' : subject.id)}
          >
            <CardContent className="p-4">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${subject.color} flex items-center justify-center text-white text-2xl mb-3`}>
                {subject.emoji}
              </div>
              <h3 className="font-semibold text-sm">{subject.name}</h3>
              <p className="text-xs text-muted-foreground">
                {subjectCounts[subject.id]} material{subjectCounts[subject.id] !== 1 ? 's' : ''}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3 p-4 bg-muted/50 rounded-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search materials..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={filterSubject} onValueChange={setFilterSubject}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Subjects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subjects</SelectItem>
              {SUBJECTS.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.emoji} {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Materials List - Classera Style */}
      {filteredMaterials.length === 0 ? (
        <div className="glass-effect rounded-xl p-12 text-center">
          <FolderOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="text-lg font-semibold mb-2">No Materials Found</h3>
          <p className="text-muted-foreground">
            {materials.length === 0 
              ? "Your teachers haven't uploaded any materials yet"
              : "No materials match your search or filter"}
          </p>
        </div>
      ) : filterSubject !== 'all' ? (
        // Grid view when filtering by subject
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMaterials.map((material) => {
            const subjectInfo = getSubjectInfo(material.subject);
            return (
              <Card 
                key={material.id} 
                className="group hover:shadow-lg transition-all cursor-pointer"
                onClick={() => {
                  setSelectedMaterial(material);
                  setViewDialogOpen(true);
                }}
              >
                <CardHeader className="pb-3">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${subjectInfo.color} flex items-center justify-center text-white text-xl`}>
                    {subjectInfo.emoji}
                  </div>
                  <CardTitle className="text-base line-clamp-2 mt-2">
                    {material.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{subjectInfo.name}</Badge>
                    {material.grade_level && material.grade_level !== 'All' && (
                      <Badge variant="secondary">{material.grade_level}</Badge>
                    )}
                    <Badge variant="secondary" className="gap-1">
                      {getFileIcon(material.file_url)}
                      {getFileType(material.file_url)}
                    </Badge>
                  </div>
                  
                  {material.content && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {material.content}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t">
                    <div className="flex flex-col">
                      <p className="text-xs text-muted-foreground">
                        {new Date(material.created_at).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        by {getTeacherName(material.uploaded_by)}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Eye className="w-4 h-4" />
                      </Button>
                      {material.file_url && (
                        <a
                          href={material.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Download className="w-4 h-4" />
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        // Grouped by subject view (default)
        <div className="space-y-6">
          {SUBJECTS.map((subjectInfo) => {
            const subjectMaterials = filteredMaterials.filter(m => m.subject === subjectInfo.id);
            if (subjectMaterials.length === 0) return null;

            return (
              <div key={subjectInfo.id} className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${subjectInfo.color} flex items-center justify-center text-white text-lg`}>
                    {subjectInfo.emoji}
                  </div>
                  <div>
                    <h3 className="font-semibold">{subjectInfo.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {subjectMaterials.length} material{subjectMaterials.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {subjectMaterials.map((material) => (
                    <div
                      key={material.id}
                      className="group flex items-center gap-3 p-4 bg-card border rounded-xl hover:shadow-md transition-all cursor-pointer"
                      onClick={() => {
                        setSelectedMaterial(material);
                        setViewDialogOpen(true);
                      }}
                    >
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                        {getFileIcon(material.file_url)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{material.title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{getFileType(material.file_url)}</span>
                          {material.grade_level && material.grade_level !== 'All' && (
                            <>
                              <span>•</span>
                              <span>{material.grade_level}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {material.file_url && (
                          <a
                            href={material.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Download className="w-4 h-4" />
                            </Button>
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Material View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedMaterial && (
                <>
                  <span className="text-2xl">{getSubjectInfo(selectedMaterial.subject).emoji}</span>
                  {selectedMaterial.title}
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {selectedMaterial && (
            <div className="space-y-4 py-4">
              {/* Meta Info */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{getSubjectInfo(selectedMaterial.subject).name}</Badge>
                {selectedMaterial.grade_level && selectedMaterial.grade_level !== 'All' && (
                  <Badge variant="secondary">{selectedMaterial.grade_level}</Badge>
                )}
                <Badge variant="secondary" className="gap-1">
                  {getFileIcon(selectedMaterial.file_url)}
                  {getFileType(selectedMaterial.file_url)}
                </Badge>
              </div>

              {/* Content */}
              {selectedMaterial.content && (
                <div className="prose prose-sm max-w-none">
                  <h4 className="font-medium mb-2">Notes</h4>
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {selectedMaterial.content}
                  </p>
                </div>
              )}

              {/* File Preview/Download */}
              {selectedMaterial.file_url && (
                <div className="p-4 bg-muted rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getFileIcon(selectedMaterial.file_url)}
                      <div>
                        <p className="font-medium text-sm">Attached File</p>
                        <p className="text-xs text-muted-foreground">
                          {getFileType(selectedMaterial.file_url)} Document
                        </p>
                      </div>
                    </div>
                    <a
                      href={selectedMaterial.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button className="gap-2">
                        <Download className="w-4 h-4" />
                        Download
                      </Button>
                    </a>
                  </div>
                </div>
              )}

              {/* Timestamp and Teacher */}
              <div className="text-center pt-4 border-t">
                <p className="text-xs text-muted-foreground">
                  Uploaded on {new Date(selectedMaterial.created_at).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  by {getTeacherName(selectedMaterial.uploaded_by)}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
